// Real provider API creation/cancellation, Test Mode only. Never authorizes a
// payment or inserts a synthetic paid subscription into any database.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes,createHmac} from 'node:crypto';
const base='https://allinonetoday.galletrix.com/payment-test';
const credentials=JSON.parse(await readFile(new URL('../.local/marketplace-test-credentials.json',import.meta.url),'utf8'));
assert.match(credentials.RAZORPAY_KEY_ID,/^rzp_test_/);
const password=randomBytes(20).toString('hex')+'Aa1!';
let account, checkoutCreated=false;
async function call(method,path,data,token,expected=200){
  const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(30000)});
  const result=await response.json();assert.equal(response.status,expected,method+' '+path+': '+result.message);return result.data;
}
try{
  const health=await call('GET','/health');assert.equal(health.billingEnabled,true);assert.equal(health.billingMode,'test');assert.equal(health.paymentEnvironment,'test');
  const production=await fetch('https://allinonetoday.galletrix.com/api/health').then(response=>response.json());assert.equal(production.data.billingEnabled,false);
  account=await call('POST','/auth/register',{name:'Payment sandbox verification',email:'payment-test-'+randomBytes(12).toString('hex')+'@example.invalid',password,role:'merchant'},undefined,201);
  const liveSession=await fetch('https://allinonetoday.galletrix.com/api/auth/session',{headers:{Authorization:'Bearer '+account.token}});assert.equal(liveSession.status,401);
  const shop=await call('POST','/shops',{name:'Temporary sandbox shop',category:'Services',branches:1,size:'small',expected_photos:100,phone:'9999999999',location:'Sandbox verification'},account.token,201);
  const quote=await call('GET','/shops/'+shop.id+'/quote',undefined,account.token);assert.equal(quote.amountMinor,49900);assert.equal(Boolean(quote.requiresReview),false);
  const checkout=await call('POST','/billing/checkout',{shopId:shop.id,acceptedAmountMinor:quote.amountMinor},account.token);
  checkoutCreated=true;
  assert.equal(checkout.paymentMode,'test');assert.equal(checkout.key,credentials.RAZORPAY_KEY_ID);assert.match(checkout.subscriptionId,/^sub_/);assert.equal(checkout.amountMinor,49900);
  const provider=await fetch('https://api.razorpay.com/v1/subscriptions/'+checkout.subscriptionId,{headers:{Authorization:'Basic '+Buffer.from(credentials.RAZORPAY_KEY_ID+':'+credentials.RAZORPAY_KEY_SECRET).toString('base64')},signal:AbortSignal.timeout(20000)});
  assert.equal(provider.status,200);assert.equal((await provider.json()).status,'created');
  await call('POST','/billing/verify',{requestId:checkout.requestId,paymentId:'pay_fake',subscriptionId:checkout.subscriptionId,signature:'0'.repeat(64)},account.token,400);
  assert.equal((await call('GET','/shops')).length,0);
  const raw=JSON.stringify({event:'payment.failed',payload:{}});
  const invalidWebhook=await fetch(base+'/api/billing/webhook',{method:'POST',headers:{'Content-Type':'application/json','x-razorpay-signature':'0'.repeat(64)},body:raw});assert.equal(invalidWebhook.status,400);
  // A correctly signed ignored event tests the receiver without granting access.
  const validWebhook=await fetch(base+'/api/billing/webhook',{method:'POST',headers:{'Content-Type':'application/json','x-razorpay-signature':createHmac('sha256',credentials.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex')},body:raw});assert.equal(validWebhook.status,200);
  console.log('Test billing checks passed: provider authentication, INR499 monthly subscription creation, isolated accounts, fake-payment rejection, webhook signature validation and no public shop activation.');
  console.log('Payment authorization must still be exercised in the Android Razorpay checkout. No payment was authorized by this script.');
} finally {
  if(account){await call('DELETE','/account',{password,stopAutoPay:true},account.token);console.log('Temporary sandbox account removed'+(checkoutCreated?' and its unauthenticated Test subscription cancelled.':'.'));}
}
