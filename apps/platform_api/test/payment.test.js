import test from 'node:test';import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';import {verifyCheckout,handleWebhook} from '../src/billing.js';
const subscription={id:'request-test',account_id:'account-test',shop_id:'shop-test',provider_id:'sub_test',amount_minor:49900,status:'created'};
async function verification(amount,invoiceSubscription='sub_test'){
  const originalFetch=global.fetch,originalSecret=process.env.RAZORPAY_KEY_SECRET,writes=[];
  process.env.RAZORPAY_KEY_SECRET='test-only-secret';
  global.fetch=async url=>({ok:true,json:async()=>String(url).includes('/payments/')?{status:'captured',currency:'INR',amount,invoice_id:'inv_test'}:String(url).includes('/invoices/')?{subscription_id:invoiceSubscription}:{status:'active',current_end:Math.floor(Date.now()/1000)+86400}});
  const pool={query:async()=>({rows:[subscription]}),connect:async()=>({query:async(sql)=>{writes.push(sql);return {rows:[]};},release(){}})};
  const signature=createHmac('sha256','test-only-secret').update('pay_test|sub_test').digest('hex');
  try{return {result:await verifyCheckout(pool,{id:'account-test'},{requestId:'request-test',paymentId:'pay_test',subscriptionId:'sub_test',signature}),writes};}finally{global.fetch=originalFetch;if(originalSecret===undefined)delete process.env.RAZORPAY_KEY_SECRET;else process.env.RAZORPAY_KEY_SECRET=originalSecret;}
}
test('A small captured verification charge cannot activate the shop',async()=>{const {result,writes}=await verification(500);assert.equal(result.verified,false);assert.deepEqual(writes,[]);});
test('A payment from another subscription cannot activate the shop',async()=>assert.rejects(verification(49900,'sub_other'),/does not belong/));
test('Full captured payment with matching invoice grants paid access transactionally',async()=>{const {result,writes}=await verification(49900);assert.equal(result.verified,true);assert.equal(writes[0],'BEGIN');assert(writes.some(s=>s.includes('GREATEST(paid_until')));assert(writes.some(s=>s.startsWith('UPDATE shops')));assert.equal(writes.at(-1),'COMMIT');});
test('Duplicate signed webhook does not repeat activation',async()=>{
  const oldSecret=process.env.RAZORPAY_WEBHOOK_SECRET;process.env.RAZORPAY_WEBHOOK_SECRET='test-webhook-secret';
  const raw=Buffer.from(JSON.stringify({event:'subscription.charged',payload:{subscription:{entity:{id:'sub_test',current_end:Math.floor(Date.now()/1000)+86400}},payment:{entity:{id:'pay_test',amount:49900,currency:'INR',status:'captured'}}}}));
  const signature=createHmac('sha256','test-webhook-secret').update(raw).digest('hex'),writes=[];
  const client={query:async sql=>{writes.push(sql);return sql.startsWith('SELECT')?{rows:[subscription]}:{rows:[],rowCount:0};},release(){}};
  try{await handleWebhook({connect:async()=>client},raw,signature,'duplicate-test');assert(!writes.some(s=>s.startsWith('UPDATE')));assert.equal(writes.at(-1),'COMMIT');}finally{if(oldSecret===undefined)delete process.env.RAZORPAY_WEBHOOK_SECRET;else process.env.RAZORPAY_WEBHOOK_SECRET=oldSecret;}
});
