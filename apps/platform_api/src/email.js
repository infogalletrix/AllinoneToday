import nodemailer from 'nodemailer';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';

export function smtpConfiguration(environment=process.env) {
  const port=Number(environment.SMTP_PORT||587);
  const host=environment.SMTP_HOST||'';
  const user=environment.SMTP_USER||'';
  const from=environment.SMTP_FROM_EMAIL||'';
  const encoded=environment.SMTP_PASSWORD_BASE64||'';
  const valid=Boolean(host && /^[a-zA-Z0-9.-]+$/.test(host) && user && !/[\r\n]/.test(user)
    && z.email().safeParse(from).success && [465,587].includes(port)
    && encoded && /^[A-Za-z0-9+/]+={0,2}$/.test(encoded));
  return {valid,host,port,user,from,password:valid?Buffer.from(encoded,'base64').toString('utf8'):''};
}
export function smtpTransport(configuration=smtpConfiguration()) {
  if(!configuration.valid) throw new Error('SMTP is not configured.');
  return nodemailer.createTransport({
    host:configuration.host,port:configuration.port,secure:configuration.port===465,
    requireTLS:configuration.port!==465,
    auth:{user:configuration.user,pass:configuration.password},
    tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,
    disableFileAccess:true,disableUrlAccess:true,
  });
}
const templates={
  storage_alert:['Image storage alert — All in One Today','Image storage is approaching or has reached the 15 GB limit. Open the owner or support workspace to review the storage monitor. New uploads are blocked when they would exceed the quota.'],
  support_alert:['New support request','A customer has opened a support request. Open the All in One Today support inbox to respond.'],
  password_changed:['Your password was updated','Your All in One Today password has been updated and existing sessions were signed out. If this was not you, contact support immediately.'],
  welcome:['Welcome to All in One Today','Your account is ready. Discover local shops or complete your shop registration in the All in One Today app.'],
  enquiry:['New customer enquiry','You have a new customer enquiry. Sign in to All in One Today on the website and open Messages to view and reply.'],
  reply:['New enquiry reply','You have a new reply to your enquiry. Open All in One Today to continue the conversation.'],
};
function publicUrl(environment) {
  const url=new URL(environment.PUBLIC_URL||'https://allinonetoday.com');
  if(url.protocol!=='https:' && !(environment.NODE_ENV!=='production' && url.hostname==='localhost')) throw new Error('Email links require HTTPS.');
  url.username='';url.password='';url.search='';url.hash='';
  return url.href.replace(/\/$/,'');
}
export function emailMessage(item,environment=process.env) {
  if(!templates[item.template] || !z.email().safeParse(item.email).success) throw new Error('Invalid transactional email.');
  const [subject,body]=templates[item.template];
  const url=publicUrl(environment)+(item.template==='enquiry'?'/messages':'');
  return {from:{name:'All in One Today',address:environment.SMTP_FROM_EMAIL},to:item.email,
    subject,text:`${body}\n\n${url}\n\nAll in One Today · Your local marketplace`,
    messageId:`<${item.id}@${new URL(url).hostname}>`,
  };
}
export async function enqueueEmail(db,template,accountId,dedupeKey,environment=process.env) {
  if(!smtpConfiguration(environment).valid) return false;
  if(!templates[template]) throw new Error('Unknown email template.');
  await db.query(`INSERT INTO email_outbox(id,account_id,template,dedupe_key)
    SELECT $1,id,$2,$3 FROM accounts WHERE id=$4 AND suspended=false AND NOT email LIKE 'deleted-%@invalid.example'
    ON CONFLICT(dedupe_key) DO NOTHING`,[randomUUID(),template,dedupeKey,accountId]);
  return true;
}
export async function deliverEmails(pool,transport,environment=process.env) {
  let delivered=0;
  for(let count=0;count<10;count++) {
    const item=(await pool.query(`WITH candidate AS (
      SELECT o.id FROM email_outbox o JOIN accounts a ON a.id=o.account_id
      WHERE a.suspended=false AND NOT a.email LIKE 'deleted-%@invalid.example' AND o.attempts<5
      AND ((o.status='pending' AND o.next_attempt_at<=now()) OR (o.status='sending' AND o.locked_at<now()-interval '5 minutes'))
      ORDER BY o.created_at FOR UPDATE OF o SKIP LOCKED LIMIT 1
    ), claimed AS (
      UPDATE email_outbox o SET status='sending',attempts=attempts+1,locked_at=now()
      FROM candidate c WHERE o.id=c.id RETURNING o.*
    ) SELECT c.*,a.email FROM claimed c JOIN accounts a ON a.id=c.account_id`)).rows[0];
    if(!item) break;
    try {
      await transport.sendMail(emailMessage(item,environment));
      await pool.query("UPDATE email_outbox SET status='sent',sent_at=now(),last_error_code=NULL WHERE id=$1",[item.id]);
      delivered++;
    } catch(error) {
      // Store a short error category only; never provider replies, credentials or email bodies.
      const code=/^[A-Z0-9_]{1,30}$/.test(error.code||'')?error.code:'DELIVERY_FAILED';
      await pool.query("UPDATE email_outbox SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,next_attempt_at=now()+interval '5 minutes',last_error_code=$2 WHERE id=$1",[item.id,code]);
    }
  }
  return delivered;
}
export function startEmailDelivery(pool) {
  if(!smtpConfiguration().valid) return async()=>{};
  const transport=smtpTransport();
  let pending=null,stopped=false;
  const tick=()=>{
    if(stopped || pending) return;
    pending=deliverEmails(pool,transport).catch(()=>console.error('email_worker_failed')).finally(()=>{pending=null;});
  };
  const timer=setInterval(tick,10000);timer.unref();tick();
  return async()=>{stopped=true;clearInterval(timer);await pending;transport.close();};
}
