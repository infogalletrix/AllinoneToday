import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import {z} from 'zod';
import {randomInt,randomUUID} from 'node:crypto';
import {isOperator} from './roles.js';
import {hashPassword,tokenHash,verifyPassword} from './security.js';
import {smtpConfiguration,smtpTransport,enqueueEmail} from './email.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const ok=(res,data,message)=>res.json({success:true,data,message});
export function supportRouter(pool) {
  const router=Router();
  router.get('/tickets',async(req,res)=>ok(res,(await pool.query(`SELECT t.*,a.name AS customer_name FROM support_tickets t JOIN accounts a ON a.id=t.account_id WHERE ($1=true OR t.account_id=$2) ORDER BY t.updated_at DESC LIMIT 100`,[isOperator(req.account.role),req.account.id])).rows));
  async function ticket(req){const t=(await pool.query('SELECT * FROM support_tickets WHERE id=$1',[z.string().uuid().parse(req.params.id)])).rows[0];if(!t||(!isOperator(req.account.role)&&t.account_id!==req.account.id))throw fail(404,'Support conversation not found.');return t;}
  router.post('/tickets',rateLimit({windowMs:3600000,limit:10}),async(req,res)=>{
    const input=z.object({subject:z.string().trim().min(3).max(120),message:z.string().trim().min(2).max(2000)}).parse(req.body);
    const support=(await pool.query("SELECT id FROM accounts WHERE role='support' AND suspended=false ORDER BY created_at LIMIT 1")).rows[0];
    if(!support)throw fail(503,'The support team is not available yet. Please try later.');
    const client=await pool.connect();let t;
    try{await client.query('BEGIN');t=(await client.query('INSERT INTO support_tickets(id,account_id,assigned_support_id,subject) VALUES($1,$2,$3,$4) RETURNING *',[randomUUID(),req.account.id,support.id,input.subject])).rows[0];await client.query('INSERT INTO support_messages(id,ticket_id,sender_id,content) VALUES($1,$2,$3,$4)',[randomUUID(),t.id,req.account.id,input.message]);await client.query('INSERT INTO notifications(id,account_id,title,body) VALUES($1,$2,$3,$4)',[randomUUID(),support.id,'New support request','Open the support inbox to respond.']);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    await enqueueEmail(pool,'support_alert',support.id,`support:${t.id}`).catch(()=>{});ok(res,t,'Sent to the Galletrix support team.');
  });
  router.get('/tickets/:id/messages',async(req,res)=>{await ticket(req);ok(res,(await pool.query('SELECT m.*,a.name AS sender_name,a.role AS sender_role FROM support_messages m JOIN accounts a ON a.id=m.sender_id WHERE ticket_id=$1 ORDER BY m.created_at',[req.params.id])).rows);});
  router.post('/tickets/:id/messages',async(req,res)=>{
    const t=await ticket(req),input=z.object({content:z.string().trim().min(1).max(2000)}).parse(req.body);
    if(t.status==='resolved')throw fail(409,'This support request is resolved. Create a new request if you need more help.');
    const recipient=isOperator(req.account.role)?t.account_id:t.assigned_support_id;
    const client=await pool.connect();let m;
    try{await client.query('BEGIN');m=(await client.query('INSERT INTO support_messages(id,ticket_id,sender_id,content) VALUES($1,$2,$3,$4) RETURNING *',[randomUUID(),t.id,req.account.id,input.content])).rows[0];await client.query('UPDATE support_tickets SET updated_at=now() WHERE id=$1',[t.id]);await client.query('INSERT INTO notifications(id,account_id,title,body) VALUES($1,$2,$3,$4)',[randomUUID(),recipient,'Support chat reply','Open your support conversation to read the reply.']);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}ok(res,m);
  });
  router.patch('/tickets/:id',async(req,res)=>{if(!isOperator(req.account.role))throw fail(403,'Support access is required.');await ticket(req);const p=z.object({status:z.enum(['open','resolved'])}).parse(req.body);ok(res,(await pool.query('UPDATE support_tickets SET status=$1,updated_at=now() WHERE id=$2 RETURNING *',[p.status,req.params.id])).rows[0]);});
  return router;
}
export function recoveryRouter(pool,{transportFactory=smtpTransport}={}) {
  const router=Router(),limit=rateLimit({windowMs:15*60000,limit:8});
  router.post('/forgot-password',limit,async(req,res)=>{
    const {email}=z.object({email:z.email().max(254)}).parse(req.body);
    if(!smtpConfiguration().valid)throw fail(503,'Email recovery will be available after the SMTP setup. Contact support for help.');
    const code=String(randomInt(0,1000000)).padStart(6,'0'),codeHash=await hashPassword(code);
    const row=(await pool.query(`INSERT INTO password_resets(token_hash,account_id,expires_at,attempts)
      SELECT $1,id,now()+interval '15 minutes',0 FROM accounts WHERE lower(email)=$2 AND suspended=false
      ON CONFLICT(account_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,created_at=now(),attempts=0
      WHERE password_resets.created_at<now()-interval '2 minutes' RETURNING account_id`,[codeHash,email.toLowerCase()])).rows[0];
    if(row){const transport=transportFactory();
      // Reset codes are never persisted in an email queue or logged.
      transport.sendMail({from:{name:'All in One Today',address:process.env.SMTP_FROM_EMAIL},to:email,subject:'Your All in One Today password reset code',text:`Your password reset code is ${code}. It expires in 15 minutes. You have up to five attempts.\n\nIf you did not request this, ignore this email.`}).catch(()=>console.error('password_recovery_delivery_failed')).finally(()=>transport.close());
    }
    ok(res,null,'If an eligible account exists, a reset code will arrive shortly.');
  });
  router.post('/reset-password',limit,async(req,res)=>{
    const p=z.object({token:z.string().min(40).max(100).optional(),email:z.email().max(254).optional(),otp:z.string().regex(/^\d{6}$/).optional(),password:z.string().min(10).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).regex(/[^a-zA-Z0-9\s]/),confirmPassword:z.string()})
      .refine(p=>Boolean(p.token)||(Boolean(p.email)&&Boolean(p.otp)),'Enter the code sent to your email.')
      .refine(p=>p.password===p.confirmPassword,'The new passwords must match.').parse(req.body);
    const hash=await hashPassword(p.password),client=await pool.connect();let row,invalidOtp=false;
    try{
      await client.query('BEGIN');
      if(p.token){row=(await client.query('DELETE FROM password_resets WHERE token_hash=$1 AND expires_at>now() RETURNING account_id',[tokenHash(p.token)])).rows[0];if(!row)throw fail(400,'This reset link is invalid or expired. Request a new code.');}
      else{
        row=(await client.query('SELECT r.account_id,r.token_hash,r.attempts FROM password_resets r JOIN accounts a ON a.id=r.account_id WHERE lower(a.email)=$1 AND a.suspended=false AND r.expires_at>now() FOR UPDATE OF r',[p.email.toLowerCase()])).rows[0];
        if(!row)throw fail(400,'This reset code is invalid or expired. Request a new code.');
        if(row.attempts>=5){await client.query('DELETE FROM password_resets WHERE account_id=$1',[row.account_id]);invalidOtp=true;}
        else if(!await verifyPassword(p.otp,row.token_hash)){
          const attempt=(await client.query('UPDATE password_resets SET attempts=attempts+1 WHERE account_id=$1 RETURNING attempts',[row.account_id])).rows[0];
          if(attempt.attempts>=5)await client.query('DELETE FROM password_resets WHERE account_id=$1',[row.account_id]);invalidOtp=true;
        }else await client.query('DELETE FROM password_resets WHERE account_id=$1',[row.account_id]);
      }
      if(!invalidOtp){const changed=await client.query('UPDATE accounts SET password_hash=$1,password_set=true,must_change_password=false,owner_temporary_password=NULL WHERE id=$2 AND suspended=false',[hash,row.account_id]);if(!changed.rowCount)throw fail(400,'This account is not eligible for password recovery.');await client.query('DELETE FROM sessions WHERE account_id=$1',[row.account_id]);}
      await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    if(invalidOtp)throw fail(400,'This reset code is incorrect or has expired. Request a new code.');
    await enqueueEmail(pool,'password_changed',row.account_id,`password-changed:${randomUUID()}`).catch(()=>{});ok(res,null,'Password updated. Sign in with your new password.');
  });
  return router;
}
