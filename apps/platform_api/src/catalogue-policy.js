// Explicit admin-managed publication is separate from paid merchant access.
export const catalogueError=(status,message)=>Object.assign(new Error(message),{status});
const aliasName=value=>{if(!/^[a-z][a-z0-9_]*$/i.test(value))throw Error('Invalid internal SQL alias.');return value;};
export function shopPublicationAccessSql(alias='s') {
  const s=aliasName(alias);
  return `((${s}.admin_managed=true AND ${s}.subscription_amount_minor IS NULL AND EXISTS(SELECT 1 FROM accounts catalogue_owner WHERE catalogue_owner.id=${s}.owner_id AND catalogue_owner.suspended=false AND (catalogue_owner.role='admin' OR (catalogue_owner.role='merchant' AND EXISTS(SELECT 1 FROM accounts catalogue_admin WHERE catalogue_admin.id=${s}.provisioned_by AND catalogue_admin.role='admin' AND catalogue_admin.suspended=false))))) OR (${s}.subscription_amount_minor IS NOT NULL AND EXISTS(SELECT 1 FROM subscriptions catalogue_subscription WHERE catalogue_subscription.shop_id=${s}.id AND catalogue_subscription.paid_until>now())) OR (${s}.admin_managed=false AND EXISTS(SELECT 1 FROM subscriptions catalogue_subscription WHERE catalogue_subscription.shop_id=${s}.id AND catalogue_subscription.paid_until>now())))`;
}
export function managedListingOwnerSql(alias='l') {
  const l=aliasName(alias);
  return `(${l}.admin_managed=false OR (EXISTS(SELECT 1 FROM accounts catalogue_owner WHERE catalogue_owner.id=${l}.seller_id AND catalogue_owner.suspended=false AND (catalogue_owner.role='admin' OR (catalogue_owner.role='merchant' AND EXISTS(SELECT 1 FROM shops catalogue_owned WHERE catalogue_owned.id=${l}.shop_id AND catalogue_owned.admin_managed=true AND catalogue_owned.owner_id=${l}.seller_id AND EXISTS(SELECT 1 FROM accounts catalogue_admin WHERE catalogue_admin.id=catalogue_owned.provisioned_by AND catalogue_admin.role='admin' AND catalogue_admin.suspended=false))))) AND (${l}.shop_id IS NULL OR EXISTS(SELECT 1 FROM shops catalogue_parent WHERE catalogue_parent.id=${l}.shop_id AND catalogue_parent.admin_managed=true AND catalogue_parent.owner_id=${l}.seller_id))))`;
}
export async function platformAdministrator(db,environment=process.env) {
  const email=String(environment.OWNER_EMAIL||'').trim().toLowerCase();
  if(!email)throw catalogueError(503,'The platform administrator is temporarily unavailable. Please try again later.');
  const rows=(await db.query("SELECT id FROM accounts WHERE lower(email)=$1 AND role='admin' AND suspended=false",[email])).rows;
  if(rows.length!==1)throw catalogueError(503,'The platform administrator is temporarily unavailable. Please try again later.');
  return rows[0];
}
export async function requireCatalogueAdministrator(db,account,ownerId,environment=process.env) {
  if(account?.role!=='admin'||account.suspended)throw catalogueError(403,'Only the platform administrator can manage this catalogue.');
  const admin=await platformAdministrator(db,environment);
  if(account.id!==admin.id||(ownerId&&ownerId!==admin.id))throw catalogueError(403,'Only the configured platform administrator can manage its own catalogue.');
  return admin;
}
export async function publicEnquiryMetadata(db,environment=process.env) {
  try {const admin=await platformAdministrator(db,environment);return {enquiry_recipient_id:admin.id,enquiry_enabled:true};}
  catch(error){if(error.status!==503)throw error;return {enquiry_recipient_id:null,enquiry_enabled:false};}
}
export function conversationReplyCapability(inquiry,metadata) {
  if(!metadata.enquiry_enabled)return {can_reply:false,read_only_reason:'Replies are temporarily unavailable because the platform administrator is unavailable.'};
  if(inquiry.recipient_id!==metadata.enquiry_recipient_id)return {can_reply:false,read_only_reason:'This historical conversation is read-only. Send a new enquiry to contact the platform administrator.'};
  return {can_reply:true,read_only_reason:null};
}
export async function requireAdminConversationReply(db,inquiry,environment=process.env) {
  const admin=await platformAdministrator(db,environment);
  if(inquiry.recipient_id!==admin.id)throw catalogueError(403,'This historical conversation is read-only. Send a new enquiry to contact the platform administrator.');
  return admin;
}
