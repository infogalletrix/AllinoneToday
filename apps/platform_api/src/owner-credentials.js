import {randomBytes,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {hashPassword,verifyPassword} from './security.js';
import {sealOwnerPassword} from './credential-vault.js';

const fail=(status,message,code)=>Object.assign(new Error(message),{status,...(code?{code}: {})});
const strongPassword=z.string().min(10).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).regex(/[^a-zA-Z0-9\s]/);
export const ownerAccountSchema=z.object({
  name:z.string().trim().min(2).max(100),email:z.email().max(254),phone:z.string().trim().max(30).default(''),
  user_id:z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).optional(),
  temporary_password:strongPassword.optional(),
}).strict();
export const loginSchema=z.object({
  identifier:z.string().trim().min(1).max(254).optional(),email:z.string().trim().min(1).max(254).optional(),
  password:z.string().min(1).max(128),
}).refine(input=>Boolean(input.identifier||input.email),'Enter your user ID or email.');
export const passwordChangeSchema=z.object({
  currentPassword:z.string().min(1).max(128),
  password:strongPassword,
  confirmPassword:z.string().max(128),
}).refine(input=>input.password===input.confirmPassword,'The new passwords must match.')
  .refine(input=>input.currentPassword!==input.password,'Choose a different password.');

export function newOwnerCredentials(){
  return {user_id:'AIT-'+randomBytes(8).toString('hex').toUpperCase(),temporary_password:randomBytes(18).toString('base64url')+'Aa1!'};
}
export async function provisionOwner(db,input,{provisionedBy}={}){
  const owner=ownerAccountSchema.parse(input),credentials=newOwnerCredentials();
  if(owner.temporary_password!==undefined)credentials.temporary_password=owner.temporary_password;
  const email=owner.email.toLowerCase();let existing=null;
  if(provisionedBy){
    existing=(await db.query('SELECT * FROM accounts WHERE lower(email)=$1 FOR UPDATE',[email])).rows[0]||null;
    if(existing){
      const reusable=existing.role==='merchant'&&!existing.suspended&&Boolean((await db.query("SELECT 1 FROM shops WHERE owner_id=$1 AND admin_managed=true AND (provisioned_by=$2 OR provisioned_by IS NULL) AND status='deleted' LIMIT 1",[existing.id,provisionedBy])).rowCount)&&!Boolean((await db.query("SELECT 1 FROM shops WHERE owner_id=$1 AND status<>'deleted' LIMIT 1",[existing.id])).rowCount);
      if(!reusable)throw fail(409,'An account with this email already exists. Use an email linked to a deleted shop or enter a different email.');
    }
  }
  credentials.user_id=owner.user_id||existing?.user_id||credentials.user_id;
  const id=existing?.id||randomUUID(),hash=await hashPassword(credentials.temporary_password);
  const encrypted=await sealOwnerPassword(credentials.temporary_password,id,hash);
  let account;
  try{
    account=existing
      ?(await db.query('UPDATE accounts SET name=$1,phone=$2,password_hash=$3,password_set=true,role=\'merchant\',user_id=$4,must_change_password=true,owner_temporary_password=$5,suspended=false WHERE id=$6 RETURNING id,name,email,phone,user_id',[owner.name,owner.phone,hash,credentials.user_id,encrypted,id])).rows[0]
      :(await db.query("INSERT INTO accounts(id,name,email,phone,password_hash,role,user_id,must_change_password,owner_temporary_password) VALUES($1,$2,$3,$4,$5,'merchant',$6,true,$7) RETURNING id,name,email,phone,user_id",[id,owner.name,email,owner.phone,hash,credentials.user_id,encrypted])).rows[0];
  }catch(error){
    if(error.code==='23505'&&error.constraint==='account_user_id_unique')throw fail(409,'This user ID is already in use. Choose a different user ID.');
    if(error.code==='23505'&&error.constraint==='accounts_email_key')throw fail(409,'An account with this email already exists. Use a different email.');
    throw error;
  }
  if(existing){
    for(const table of ['sessions','web_handoffs','password_resets'])await db.query(`DELETE FROM ${table} WHERE account_id=$1`,[id]);
  }
  return {account,credentials};
}
export function requirePasswordReady(account,path){
  if(!account?.must_change_password)return;
  if(['/api/auth/session','/api/auth/logout','/api/auth/change-password','/api/business-app/session'].includes(path.split('?')[0]))return;
  throw fail(403,'Change your temporary password before using your shop account.','PASSWORD_CHANGE_REQUIRED');
}
export async function changeAccountPassword(pool,accountId,input){
  const values=passwordChangeSchema.parse(input),client=await pool.connect();
  try{
    await client.query('BEGIN');
    const account=(await client.query('SELECT * FROM accounts WHERE id=$1 AND suspended=false FOR UPDATE',[accountId])).rows[0];
    if(!account?.password_set||!await verifyPassword(values.currentPassword,account.password_hash))throw fail(401,'The current password is incorrect.');
    const changed=(await client.query('UPDATE accounts SET password_hash=$1,password_set=true,must_change_password=false,owner_temporary_password=NULL WHERE id=$2 RETURNING *',[await hashPassword(values.password),accountId])).rows[0];
    await client.query('DELETE FROM sessions WHERE account_id=$1',[accountId]);
    await client.query('DELETE FROM web_handoffs WHERE account_id=$1',[accountId]);
    await client.query('DELETE FROM password_resets WHERE account_id=$1',[accountId]);
    await client.query('COMMIT');
    return changed;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
