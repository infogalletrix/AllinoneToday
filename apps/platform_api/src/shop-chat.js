import { catalogueError } from './catalogue-policy.js';

const unavailable = { enquiry_recipient_id: null, enquiry_recipient_name: null, enquiry_enabled: false };
const ownerId = target => target?.owner_id || target?.seller_id;

// The target must come from a public, server-selected shop or listing. Never use
// a recipient supplied by the browser: ownership is the routing authority.
export async function enquiryRecipient(db, target) {
  const id = ownerId(target);
  if (!id) throw catalogueError(503, 'The seller is temporarily unavailable. Please try again later.');
  const account = (await db.query('SELECT id,name,role FROM accounts WHERE id=$1 AND suspended=false', [id])).rows[0];
  if (!account) throw catalogueError(503, 'The seller is temporarily unavailable. Please try again later.');
  return account;
}

export async function withOwnerEnquiryMetadata(db, rows, demoId) {
  const ids = [...new Set(rows.filter(row => row.id !== demoId && !row.is_demo).map(ownerId).filter(Boolean))];
  const accounts = ids.length ? (await db.query('SELECT id,name FROM accounts WHERE id=ANY($1::uuid[]) AND suspended=false', [ids])).rows : [];
  const owners = new Map(accounts.map(account => [account.id, account]));
  return rows.map(row => {
    const account = row.id === demoId || row.is_demo ? null : owners.get(ownerId(row));
    return { ...row, ...(account ? {
      enquiry_recipient_id: account.id, enquiry_recipient_name: account.name, enquiry_enabled: true,
    } : unavailable) };
  });
}

export async function withConversationCapabilities(db, rows) {
  const ids = [...new Set(rows.flatMap(row => [row.sender_id, row.recipient_id]).filter(Boolean))];
  const accounts = ids.length ? (await db.query('SELECT id,name FROM accounts WHERE id=ANY($1::uuid[]) AND suspended=false', [ids])).rows : [];
  const active = new Map(accounts.map(account => [account.id, account]));
  return rows.map(row => {
    const canReply = active.has(row.sender_id) && active.has(row.recipient_id);
    return { ...row, recipient_name: active.get(row.recipient_id)?.name || row.recipient_name || 'Seller',
      can_reply: canReply,
      read_only_reason: canReply ? null : 'Replies are unavailable because a participant account is unavailable.',
    };
  });
}

// Route authorization still requires the signed-in account to be a participant.
// Account status is checked afresh on each send so suspension takes effect now.
export async function requireConversationReply(db, inquiry) {
  const [capability] = await withConversationCapabilities(db, [inquiry]);
  if (!capability.can_reply) throw catalogueError(403, capability.read_only_reason);
  return capability;
}
