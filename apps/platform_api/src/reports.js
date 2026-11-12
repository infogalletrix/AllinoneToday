import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const fail = (status, message) => Object.assign(new Error(message), { status });
const reportInput = z.object({
  listingId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  reason: z.string().trim().min(10).max(2000),
}).strict().refine(input => Boolean(input.listingId) !== Boolean(input.inquiryId), {
  message: 'Choose one listing or conversation to report.',
});

// Account targets must be established by a visible listing or an owned
// conversation. A client cannot report an arbitrary account or read a private
// conversation by guessing its ID.
export async function createReport(pool, account, body, publicListingSql) {
  if (!account?.id) throw fail(401, 'Sign in to report content or users.');
  const input = reportInput.parse(body);
  let targetId, listingId = null, inquiryId = null;
  if (input.listingId) {
    const listing = (await pool.query(
      `SELECT l.id,l.seller_id FROM listings l WHERE l.id=$1 AND ${publicListingSql}`,
      [input.listingId],
    )).rows[0];
    if (!listing) throw fail(404, 'The listing is unavailable.');
    targetId = listing.seller_id;
    listingId = listing.id;
  } else {
    const inquiry = (await pool.query(
      'SELECT id,sender_id,recipient_id FROM inquiries WHERE id=$1 AND (sender_id=$2 OR recipient_id=$2)',
      [input.inquiryId, account.id],
    )).rows[0];
    if (!inquiry) throw fail(404, 'Conversation not found.');
    targetId = inquiry.sender_id === account.id ? inquiry.recipient_id : inquiry.sender_id;
    inquiryId = inquiry.id;
  }
  if (targetId === account.id) throw fail(400, 'You cannot report yourself or your own listing.');
  if (input.accountId && input.accountId !== targetId) throw fail(400, 'The reported account does not match this content.');
  const targetAccountId = inquiryId || input.accountId ? targetId : null;
  await pool.query(
    "INSERT INTO reports(id,account_id,listing_id,target_account_id,inquiry_id,reason,status) VALUES($1,$2,$3,$4,$5,$6,'pending')",
    [randomUUID(), account.id, listingId, targetAccountId, inquiryId, input.reason],
  );
}

export async function reportContext(pool, id) {
  const report = (await pool.query('SELECT * FROM reports WHERE id=$1', [z.string().uuid().parse(id)])).rows[0];
  if (!report) throw fail(404, 'Report not found.');
  if (!report.inquiry_id) return { inquiry: null, messages: [] };
  const inquiry = (await pool.query(
    'SELECT id,sender_id,recipient_id,message,created_at FROM inquiries WHERE id=$1',
    [report.inquiry_id],
  )).rows[0];
  const messages = (await pool.query(
    'SELECT sender_id,content,created_at FROM (SELECT sender_id,content,created_at FROM messages WHERE inquiry_id=$1 ORDER BY created_at DESC LIMIT 100) recent ORDER BY created_at',
    [report.inquiry_id],
  )).rows;
  return { inquiry, messages };
}
