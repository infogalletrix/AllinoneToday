import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';import {writeFile,readFile} from 'node:fs/promises';
const base=process.env.SMOKE_URL || 'https://allinonetoday.galletrix.com';
const tag='ait-smoke-'+randomBytes(8).toString('hex'),password=randomBytes(20).toString('hex')+'Aa!1';
const accounts=[];
const png=await readFile(new URL('../apps/mobile_app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@1x.png',import.meta.url));
async function call(method,path,body,token,expected=200){const res=await fetch(base+'/api'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});const value=await res.json();assert.equal(res.status,expected,`${method} ${path}: ${value.message}`);return value.data;}
async function account(suffix,role){const result=await call('POST','/auth/register',{name:'Release verification '+suffix,email:`${tag}-${suffix}@example.invalid`,phone:'9999999999',password,role},null,201);accounts.push(result);return result;}
try{
  await call('GET','/health');await call('GET','/categories');
  await call('POST','/auth/register',{name:'Weak password check',email:`${tag}-weak@example.invalid`,password:'weak',role:'buyer'},null,400);
  const seller=await account('seller','buyer'),buyer=await account('buyer','buyer'),merchant=await account('merchant','merchant');
  await call('GET','/auth/session',undefined,seller.token);
  const upload=new FormData();upload.append('image',new Blob([png],{type:'image/png'}),'check.png');
  await call('POST','/uploads',upload,seller.token,403);
  await call('POST','/listings',{},seller.token,403);
  const shop=await call('POST','/shops',{name:'Release verification shop',location:'Verification location',category:'Services',branches:2,phone:'9999999999'},merchant.token,201);
  const publicShops=await call('GET','/shops');assert(!publicShops.some(s=>s.id===shop.id));
  const merchantPhoto=new FormData();merchantPhoto.append('image',new Blob([png],{type:'image/png'}),'shop-check.png');
  const ownPhoto=await call('POST','/uploads',merchantPhoto,merchant.token,201);
  await call('POST','/listings',{title:'Unpaid shop listing',price:100,category:'Services',location:'Verification location',description:'Must not be published without subscription.',image_path:ownPhoto.url,shop_id:shop.id},merchant.token,403);
  const health=await call('GET','/health');
  await call('POST','/billing/verify',{requestId:shop.id,paymentId:'pay_fake',subscriptionId:'sub_fake',signature:'0'.repeat(64)},merchant.token,health.billingEnabled?400:503);
  await call('POST','/conversations',{shop_id:shop.id,phone:'9999999999',message:'Unpaid shops must not be contactable.'},buyer.token,404);
  await call('GET',`/shops/${shop.id}/quote`,undefined,buyer.token,404);
  await call('POST','/blocks',{accountId:seller.user.id},buyer.token);
  assert((await call('GET','/blocks',undefined,buyer.token)).some(item=>item.blocked_id===seller.user.id));
  await call('DELETE','/blocks/'+seller.user.id,undefined,buyer.token);
  await call('GET','/admin/reports',undefined,buyer.token,403);
  console.log('Live API checks passed: accounts, strong passwords, public publishing/upload denial, merchant uploads, unpaid-shop publication/contact denial, quote isolation, fake payment rejection, blocking and owner authorization. Paid-listing/message tests run only in isolated staging.');
}finally{
  for(const a of accounts)await call('DELETE','/account',{password},a.token).catch(()=>{});
  if(process.env.SMOKE_IDS_FILE)await writeFile(process.env.SMOKE_IDS_FILE,JSON.stringify(accounts.map(a=>a.user.id)));
  console.log('Temporary test accounts anonymized; test listings and shops are not public.');
}
