import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {defaultSite} from '../apps/platform_api/src/content.js';
const root=resolve(import.meta.dirname,'..'),require=createRequire(resolve(root,'apps/web_app/package.json')),{chromium}=require('playwright');
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4178';
await mkdir(resolve(root,'artifacts/screenshots'),{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  for(const [name,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
    const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    const categories=[{id:'cat_services',name:'Services',slug:'services',subtitle:'Repairs',image_path:'/images/h7.png',position:0,enabled:true}];
    let site={...structuredClone(defaultSite),categories,revision:1},published=false;
    await page.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname.replace('/api','');let data=[];
      if(path==='/auth/session')data={id:'owner-fixture',name:'Owner Preview',email:'owner-preview@example.invalid',role:'admin'};
      else if(path==='/site')data=site;
      else if(path==='/auth/config')data={googleWebClientId:''};
      else if(path==='/admin/overview')data={accounts:0,shops:0,listings:0,reports:0,paid_subscriptions:0,billingEnabled:false,googleEnabled:false};
      else if(path==='/admin/categories')data=categories;
      else if(path==='/admin/website'){
        if(route.request().method()==='PUT'){const body=route.request().postDataJSON();assert.equal(body.revision,1);site={...body.value,categories,revision:2};published=true;}
        data={value:site,revision:site.revision};
      }
      await route.fulfill({json:{success:true,data}});
    });
    await page.goto(base+'/admin',{waitUntil:'networkidle'});
    await page.getByRole('heading',{name:'Your marketplace control center.'}).waitFor();
    assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth>innerWidth),false,'Owner overview overflow '+name);
    await page.getByRole('button',{name:'Website',exact:true}).click();
    try{await page.getByRole('heading',{name:'Website builder',exact:true}).waitFor({timeout:10000});}catch(error){console.log(JSON.stringify({errors,body:(await page.locator('body').innerText()).slice(0,4000)}));throw error;}
    await page.getByLabel('Title',{exact:true}).fill('Owner-controlled homepage headline');
    page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Publish website changes',exact:true}).click();
    await page.getByText('Changes saved.',{exact:true}).waitFor();assert(published);
    await page.screenshot({path:resolve(root,`artifacts/screenshots/owner-builder-${name}.png`),fullPage:true});
    assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth>innerWidth),false,'Owner CMS overflow '+name);
    await page.goto(base,{waitUntil:'networkidle'});await page.getByRole('heading',{name:'Owner-controlled homepage headline'}).waitFor();
    assert.equal(await page.getByRole('link',{name:'Post an Ad',exact:true}).count(),0);assert.equal(await page.getByRole('link',{name:'For shops',exact:true}).count(),0);
    assert.deepEqual(errors,[]);await page.close();console.log(name+' owner UI passed: CMS publishing, public component rendering and responsive layout.');
  }
}finally{await browser.close();}
