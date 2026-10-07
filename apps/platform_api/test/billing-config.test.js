import test from 'node:test';
import assert from 'node:assert/strict';
import {billingConfiguration} from '../src/billing-config.js';
import {verifyCheckout,handleWebhook} from '../src/billing.js';

const testValues={RAZORPAY_KEY_ID:'rzp_test_example',RAZORPAY_KEY_SECRET:'test-api-secret',RAZORPAY_WEBHOOK_SECRET:'a'.repeat(64)};
test('Public marketplace refuses Test credentials by default',()=>{
  assert.equal(billingConfiguration(testValues).valid,false);
  assert.equal(billingConfiguration({...testValues,BILLING_ENVIRONMENT:'live'}).mode,'disabled');
});
test('Isolated test environment accepts only Test credentials and a strong webhook secret',()=>{
  assert.equal(billingConfiguration({...testValues,BILLING_ENVIRONMENT:'test'}).mode,'test');
  for(const variation of [{RAZORPAY_KEY_ID:'rzp_live_example'},{RAZORPAY_WEBHOOK_SECRET:'1234'},{RAZORPAY_KEY_SECRET:''},{BILLING_ENVIRONMENT:'typo'}]){
    assert.equal(billingConfiguration({...testValues,BILLING_ENVIRONMENT:'test',...variation}).valid,false);
  }
  assert.equal(billingConfiguration({...testValues,RAZORPAY_KEY_ID:'rzp_live_example'}).mode,'live');
});
test('Wrong-environment verification and webhooks fail before any database or provider access',async()=>{
  const names=['BILLING_ENVIRONMENT',...Object.keys(testValues)],old=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  Object.assign(process.env,testValues,{BILLING_ENVIRONMENT:'live'});
  const pool={query(){assert.fail('Production database must not be queried');},connect(){assert.fail('Production database must not be queried');}};
  try {
    await assert.rejects(verifyCheckout(pool,{id:'account'},{}),{status:503});
    await assert.rejects(handleWebhook(pool,Buffer.from('{}'),'anything','event'),{status:503});
  } finally {for(const name of names){if(old[name]===undefined)delete process.env[name];else process.env[name]=old[name];}}
});
