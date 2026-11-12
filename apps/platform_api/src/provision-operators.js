// Operator provisioning is a private CLI, never a public HTTP route.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './security.js';
const approved = new Map([
  ['kgaravind1988@gmail.com', {role:'admin',name:'All in One Today owner'}],
  ['support@galletrix.com', {role:'support',name:'Galletrix support'}],
]);
let raw = '';
for await (const chunk of process.stdin) { raw += chunk; if(raw.length>4096) throw Error('Input too large.'); }
const input = JSON.parse(raw);
if(Object.keys(input).length!==2 || [...approved.keys()].some(email=>!input[email] ||
  typeof input[email]!=='string' || input[email].length<16 || input[email].length>128 ||
  !/[A-Z]/.test(input[email]) || !/[a-z]/.test(input[email]) || !/[0-9]/.test(input[email]) || !/[^a-zA-Z0-9\s]/.test(input[email]))) throw Error('Private strong passwords are required for the two approved operators.');
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
const client = await pool.connect();
const results=[];
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('operator-provisioning'))");
  const operators=(await client.query("SELECT email FROM accounts WHERE role='admin'")).rows;
  if(operators.some(row=>!['kgaravind1988@gmail.com','kgaravind1998@gmail.com'].includes(row.email))) throw Error('Unexpected product-owner account exists. Review it before provisioning.');
  for(const [email,definition] of approved) {
    let account=(await client.query('SELECT * FROM accounts WHERE email=$1 FOR UPDATE',[email])).rows[0];
    const created=!account;
    if(created) account=(await client.query('INSERT INTO accounts(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING *',[randomUUID(),definition.name,email,await hashPassword(input[email]),definition.role])).rows[0];
    else {
      await client.query('UPDATE accounts SET role=$1,suspended=false WHERE id=$2',[definition.role,account.id]);
      // Keep existing password and Google linkage; privilege changes revoke sessions.
      if(account.role!==definition.role) await client.query('DELETE FROM sessions WHERE account_id=$1',[account.id]);
    }
    results.push({email,created,role:definition.role,id:account.id});
  }
  const owner=results.find(r=>r.role==='admin');
  const prior=(await client.query("UPDATE accounts SET role='merchant' WHERE email='kgaravind1998@gmail.com' AND role='admin' RETURNING id")).rows[0];
  if(prior) await client.query('DELETE FROM sessions WHERE account_id=$1',[prior.id]);
  for(const item of results) await client.query('INSERT INTO admin_audit(id,actor_id,action,target) VALUES($1,$2,$3,$4)',[randomUUID(),owner.id,'operator.provision',item.email]);
  if(prior) await client.query('INSERT INTO admin_audit(id,actor_id,action,target) VALUES($1,$2,$3,$4)',[randomUUID(),owner.id,'owner.email-replaced',prior.id]);
  await client.query('COMMIT');
  console.log(JSON.stringify(results.map(({id,...result})=>result)));
} catch(error) {
  await client.query('ROLLBACK');
  console.error(error.message);
  process.exitCode=1;
} finally { client.release();await pool.end(); }
