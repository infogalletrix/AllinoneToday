import { OAuth2Client } from 'google-auth-library';
import { randomUUID } from 'node:crypto';
import { hashPassword, newToken } from './security.js';

export function googleConfig() {
  return {googleWebClientId:process.env.GOOGLE_WEB_CLIENT_ID||'',googleIosPublicClientId:process.env.GOOGLE_IOS_PUBLIC_CLIENT_ID||'',googleIosBusinessClientId:process.env.GOOGLE_IOS_BUSINESS_CLIENT_ID||''};
}
export async function googleAccount(pool,idToken,role,existing=null,verify) {
  const configuration=googleConfig();
  const audience=Object.values(configuration).filter(Boolean);
  if(!configuration.googleWebClientId)throw Object.assign(new Error('Google login is awaiting OAuth configuration. Use email login for now.'),{status:503});
  let profile;
  try{const client=new OAuth2Client();const ticket=await (verify||client.verifyIdToken.bind(client))({idToken,audience});profile=ticket.getPayload();}
  catch{throw Object.assign(new Error('Google could not verify this sign-in. Please try again.'),{status:401});}
  if(!profile?.sub||!profile.email||!profile.email_verified)throw Object.assign(new Error('A verified Google email is required.'),{status:401});
  const linked=(await pool.query('SELECT * FROM accounts WHERE google_sub=$1',[profile.sub])).rows[0];
  if(linked){if(linked.suspended)throw Object.assign(new Error('This account is suspended. Contact support.'),{status:403});if(existing&&existing.id!==linked.id)throw Object.assign(new Error('This Google account is linked to another account.'),{status:409});return linked;}
  const email=profile.email.toLowerCase();
  const account=(await pool.query('SELECT * FROM accounts WHERE email=$1',[email])).rows[0];
  if(account){
    // Never silently link an unverified password account by matching email.
    if(!existing||existing.id!==account.id)throw Object.assign(new Error('This email has an account. Log in with its password, then choose Link Google from your profile.'),{status:409});
    return (await pool.query('UPDATE accounts SET google_sub=$1 WHERE id=$2 RETURNING *',[profile.sub,account.id])).rows[0];
  }
  if(existing)throw Object.assign(new Error('Choose the Google account with the same email as your profile.'),{status:409});
  return (await pool.query('INSERT INTO accounts(id,name,email,password_hash,role,google_sub,password_set) VALUES($1,$2,$3,$4,$5,$6,false) RETURNING *',[randomUUID(),String(profile.name||email.split('@')[0]).slice(0,100),email,await hashPassword(newToken()),role,profile.sub])).rows[0];
}
