import {readdir,stat,writeFile,unlink,mkdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
export const IMAGE_QUOTA_BYTES=15_000_000_000;
export async function storageStatus(directory=process.env.UPLOAD_DIR||'./uploads',limit=IMAGE_QUOTA_BYTES) {
  const root=resolve(directory);let bytes=0,files=0;const pending=[root];
  while(pending.length){const parent=pending.pop();for(const item of await readdir(parent,{withFileTypes:true})){
    const path=resolve(parent,item.name);
    if(item.isSymbolicLink())continue;
    if(item.isDirectory())pending.push(path);
    else if(item.isFile()){bytes+=(await stat(path)).size;files++;}
  }}
  return {usedBytes:bytes,limitBytes:limit,files,percent:Math.min(100,Math.round(bytes/limit*10000)/100),availableBytes:Math.max(0,limit-bytes)};
}
async function notifyStorage(db,status,blocked=false) {
  const level=blocked||status.usedBytes>=status.limitBytes?'full':status.percent>=90?'warning':null;
  if(!level){await db.query("DELETE FROM platform_settings WHERE key IN ('storage-alert-warning','storage-alert-full')");return;}
  const once=await db.query('INSERT INTO platform_settings(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING key',[`storage-alert-${level}`,status]);
  if(!once.rowCount)return;
  const operators=(await db.query("SELECT id FROM accounts WHERE role IN ('admin','support') AND suspended=false")).rows;
  const body=level==='full'?'The 15 GB image quota is full or the next upload would exceed it. New image uploads are blocked.':'Image storage is at least 90% of the 15 GB quota. Review storage before it fills.';
  for(const account of operators){
    const id=randomUUID();
    await db.query('INSERT INTO notifications(id,account_id,title,body) VALUES($1,$2,$3,$4)',[id,account.id,'Image storage alert',body]);
    await db.query("INSERT INTO email_outbox(id,account_id,template,dedupe_key) VALUES($1,$2,'storage_alert',$3)",[randomUUID(),account.id,`storage:${id}`]);
  }
}
export async function storeImage(pool,accountId,name,bytes,{directory=process.env.UPLOAD_DIR||'./uploads',limit=IMAGE_QUOTA_BYTES}={}) {
  if(basename(name)!==name||!/^[-a-f0-9]+\.webp$/.test(name))throw new Error('Invalid image destination.');
  const client=await pool.connect();const file=resolve(directory,name);let written=false,committed=false;
  try {
    await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('allinonetoday-image-quota'))");
    const current=await storageStatus(directory,limit);
    const blocked=current.usedBytes+bytes.length>limit;
    if(blocked){await notifyStorage(client,current,true);await client.query('COMMIT');committed=true;throw Object.assign(new Error('Image storage has reached its 15 GB limit. The owner and support team have been alerted.'),{status:507});}
    await writeFile(file,bytes,{flag:'wx'});written=true;
    await client.query('INSERT INTO uploads VALUES($1,$2,now())',[`/uploads/${name}`,accountId]);
    await notifyStorage(client,{...current,usedBytes:current.usedBytes+bytes.length,percent:(current.usedBytes+bytes.length)/limit*100});
    await client.query('COMMIT');committed=true;
  }catch(error){if(!committed)await client.query('ROLLBACK');if(written&&!committed)await unlink(file).catch(()=>{});throw error;}
  finally{client.release();}
}
export async function monitorStorage(pool) {
  await mkdir(process.env.UPLOAD_DIR||'./uploads',{recursive:true});
  const client=await pool.connect();
  try{await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('allinonetoday-image-quota'))");const status=await storageStatus();await notifyStorage(client,status);await client.query('COMMIT');return status;}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
