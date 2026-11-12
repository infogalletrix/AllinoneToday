import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,link,unlink} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';

// Keep the handoff encryption key outside PostgreSQL. The default location lives
// in the persistent uploads volume, inside a directory denied by static serving.
const pendingKeys=new Map();
async function vaultKey(environment,create){
  if(environment.OWNER_CREDENTIALS_KEY){
    if(!/^[a-f0-9]{64}$/i.test(environment.OWNER_CREDENTIALS_KEY))throw Error('Owner credential encryption key must contain 64 hexadecimal characters.');
    return Buffer.from(environment.OWNER_CREDENTIALS_KEY,'hex');
  }
  const path=resolve(environment.OWNER_CREDENTIALS_KEY_FILE||resolve(environment.UPLOAD_DIR||'./uploads','.private','owner-credentials.key'));
  async function read(){
    const key=await readFile(path);
    if(key.length!==32)throw Error('Owner credential encryption key is invalid.');
    return key;
  }
  if(!create)return read();
  if(!pendingKeys.has(path))pendingKeys.set(path,(async()=>{
    try{return await read();}catch(error){if(error.code!=='ENOENT')throw error;}
    await mkdir(dirname(path),{recursive:true,mode:0o700});
    const temporary=path+'.'+randomUUID();
    try{
      await writeFile(temporary,randomBytes(32),{mode:0o600,flag:'wx'});
      try{await link(temporary,path);}catch(error){if(error.code!=='EEXIST')throw error;}
      return await read();
    }finally{await unlink(temporary).catch(()=>{});}
  })().finally(()=>pendingKeys.delete(path)));
  return pendingKeys.get(path);
}

export async function sealOwnerPassword(password,accountId,passwordHash,environment=process.env){
  return seal(password,accountId,passwordHash,await vaultKey(environment,true));
}
function seal(password,accountId,passwordHash,key){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(accountId+':'+passwordHash));
  const encrypted=Buffer.concat([cipher.update(password,'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}

export async function openOwnerPassword(account,environment=process.env){
  if(!account.must_change_password||!account.owner_temporary_password)return null;
  try{
    const [version,iv,tag,encrypted,...extra]=account.owner_temporary_password.split('.');
    if(version!=='v1'||extra.length||!iv||!tag||!encrypted)return null;
    const decipher=createDecipheriv('aes-256-gcm',await vaultKey(environment,false),Buffer.from(iv,'base64url'));
    decipher.setAAD(Buffer.from(account.id+':'+account.password_hash));
    decipher.setAuthTag(Buffer.from(tag,'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted,'base64url')),decipher.final()]).toString('utf8');
  }catch{
    // A lost/rotated key or password change must never expose stale credentials.
    // The administrator can explicitly issue new temporary login details.
    return null;
  }
}
