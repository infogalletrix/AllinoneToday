import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { safeUrl,siteSchema,defaultSite } from '../src/content.js';
import { needsAssessment,basicQuote,shopQuote } from '../src/assessments.js';
import { googleAccount } from '../src/google.js';
import {adminRouter} from '../src/admin.js';

test('CMS accepts safe links and rejects scripts and repeated sections',()=>{
  for(const path of ['/listings?category=Services','https://example.com/image.png',''])assert.equal(safeUrl.safeParse(path).success,true);
  for(const path of ['javascript:alert(1)','//other.example','data:text/html,evil','http://insecure.example'])assert.equal(safeUrl.safeParse(path).success,false);
  assert.equal(siteSchema.safeParse(defaultSite).success,true);
  assert.equal(siteSchema.safeParse({...defaultSite,sections:[defaultSite.sections[0],defaultSite.sections[0]]}).success,false);
});
test('Small shop monthly price is 499; larger shops cannot silently get that rate',()=>{
  const small={category:'Services',size:'small',branches:1,expected_photos:100};assert.equal(needsAssessment(small),false);assert.equal(basicQuote(small).amountMinor,49900);assert.equal(basicQuote(small).period,'month');
  for(const variation of [{size:'medium'},{branches:2},{expected_photos:101},{category:'Textiles'}])assert.equal(needsAssessment({...small,...variation}),true);
});
test('Shop quote requires approval and preserves existing mandate price',async()=>{
  const shop={id:'shop',category:'Textiles',size:'large',branches:5,expected_photos:1000};
  const pending={query:async()=>({rows:[]})};assert.equal((await shopQuote(pending,shop)).requiresReview,true);
  const approved={query:async sql=>({rows:sql.includes('FROM subscriptions')?[]:[{status:'approved',approved_amount_minor:149900,revision:2,reason:'Storage and branch capacity.'}]})};assert.equal((await shopQuote(approved,shop)).amountMinor,149900);
  const mandate={query:async()=>({rows:[{quote:{amountMinor:99900,period:'month'}}]})};assert.equal((await shopQuote(mandate,shop)).amountMinor,99900);
});
test('Buyer and merchant roles cannot read owner controls or pricing administration',async()=>{
  for(const role of ['buyer','merchant']){
    const app=express();app.use((req,res,next)=>{req.account={id:'test',role};next();});app.use('/admin',adminRouter({query:()=>assert.fail('Unauthorized database query')}));
    const server=app.listen(0,'127.0.0.1');await new Promise(done=>server.once('listening',done));try{const port=server.address().port;for(const path of ['website','accounts','pricing','assessments'])assert.equal((await fetch(`http://127.0.0.1:${port}/admin/${path}`)).status,403);}finally{await new Promise(done=>server.close(done));}
  }
});
test('Google rejects invalid JWT, unverified email and unsafe automatic email linking',async()=>{
  const saved=process.env.GOOGLE_WEB_CLIENT_ID;process.env.GOOGLE_WEB_CLIENT_ID='test-client.apps.googleusercontent.com';
  try{
    const pool={query:async sql=>({rows:sql.includes('email=')?[{id:'existing-account'}]:[]})};
    await assert.rejects(googleAccount(pool,'invalid','buyer',null,async()=>{throw Error('Invalid JWT');}),{status:401});
    await assert.rejects(googleAccount(pool,'jwt','buyer',null,async()=>({getPayload:()=>({sub:'1',email:'user@example.com',email_verified:false})})),{status:401});
    await assert.rejects(googleAccount(pool,'jwt','buyer',null,async()=>({getPayload:()=>({sub:'1',email:'user@example.com',email_verified:true})})),{status:409});
  }finally{if(saved===undefined)delete process.env.GOOGLE_WEB_CLIENT_ID;else process.env.GOOGLE_WEB_CLIENT_ID=saved;}
});
