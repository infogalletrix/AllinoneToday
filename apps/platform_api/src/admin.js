import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { categorySchema, siteSchema } from './content.js';
import { readPricing, setPricing } from './pricing.js';
import { billingEnabled } from './billing.js';
import { aiConfigured, suggestPrice } from './assessments.js';
import { isOperator } from './roles.js';
import {smtpConfiguration} from './email.js';
import {storageStatus} from './storage.js';
import {assertSupportedCategory, assertSiteOffering, requireAvailableCategory} from './offering.js';
import {reportContext} from './reports.js';
import {adminCatalogueRouter} from './admin-catalogue.js';
import {requireCatalogueAdministrator} from './catalogue-policy.js';
import {ownerLoginAdminRouter} from './owner-login-admin.js';

export function adminRouter(pool) {
  const router=Router();
  router.use((req,res,next)=>isOperator(req.account.role)?next():res.status(403).json({success:false,message:'Operator access is required.'}));
  router.use('/catalogue',adminCatalogueRouter(pool));
  router.use(ownerLoginAdminRouter(pool));
  const ok=(res,data)=>res.json({success:true,data});
  const audit=(req,action,target)=>pool.query('INSERT INTO admin_audit(id,actor_id,action,target) VALUES($1,$2,$3,$4)',[randomUUID(),req.account.id,action,String(target)]);
  const offset=req=>Math.max(0,Math.min(Number(req.query.offset)||0,100000));
  router.get('/overview',async(req,res)=>{
    const totals=(await pool.query("SELECT (SELECT count(*)::int FROM accounts WHERE NOT email LIKE 'deleted-%@invalid.example') accounts,(SELECT count(*)::int FROM shops s JOIN accounts a ON a.id=s.owner_id WHERE NOT a.email LIKE 'deleted-%@invalid.example' AND s.status<>'deleted') shops,(SELECT count(*)::int FROM listings WHERE status='active') listings,(SELECT count(*)::int FROM reports r WHERE r.status='pending') reports,(SELECT count(*)::int FROM subscriptions WHERE paid_until>now()) paid_subscriptions")).rows[0];
    ok(res,{...totals,billingEnabled:billingEnabled(),googleEnabled:Boolean(process.env.GOOGLE_WEB_CLIENT_ID),smtpEnabled:smtpConfiguration().valid,aiEnabled:aiConfigured()});
  });
  router.get('/categories',async(req,res)=>ok(res,(await pool.query('SELECT * FROM marketplace_categories ORDER BY position,name')).rows));
  router.get('/enquiry-analytics',async(req,res)=>{
    const totals=(await pool.query("SELECT count(*)::int AS enquiries,count(*) FILTER (WHERE created_at>=now()-interval '7 days')::int AS this_week FROM inquiries")).rows[0];
    const byShop=(await pool.query('SELECT s.id,s.name,s.category,s.size,count(DISTINCT i.id)::int AS enquiries FROM shops s LEFT JOIN listings l ON l.shop_id=s.id LEFT JOIN inquiries i ON i.listing_id=l.id OR (i.listing_id IS NULL AND i.shop_id=s.id) GROUP BY s.id ORDER BY enquiries DESC,s.name LIMIT 20')).rows;
    const byProduct=(await pool.query('SELECT l.id,l.title,s.name AS shop_name,count(i.id)::int AS enquiries FROM listings l LEFT JOIN shops s ON s.id=l.shop_id LEFT JOIN inquiries i ON i.listing_id=l.id GROUP BY l.id,s.name ORDER BY enquiries DESC,l.title LIMIT 20')).rows;
    const daily=(await pool.query("SELECT created_at::date AS day,count(*)::int AS enquiries FROM inquiries WHERE created_at>=now()-interval '30 days' GROUP BY created_at::date ORDER BY day")).rows;
    const registrations=(await pool.query("SELECT count(*) FILTER (WHERE status='pending_payment')::int AS pending_payment,count(*) FILTER (WHERE moderated_hidden=true)::int AS hidden FROM shops")).rows[0];
    ok(res,{...totals,byShop,byProduct,daily,...registrations});
  });
  router.post('/categories',async(req,res)=>{
    const p=categorySchema.parse(req.body),id=randomUUID();
    const item=(await pool.query('INSERT INTO marketplace_categories(id,name,slug,subtitle,image_path,position,enabled,module) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[id,p.name,p.slug,p.subtitle,p.image_path,p.position,p.enabled,p.module||(p.name==='Services'?'service':'product')])).rows[0];
    await audit(req,'category.create',id);ok(res,item);
  });
  router.patch('/categories/:id',async(req,res)=>{
    const p=categorySchema.parse(req.body);const client=await pool.connect();let item;
    try{await client.query('BEGIN');const old=(await client.query('SELECT id,name,slug,module FROM marketplace_categories WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!old)throw Object.assign(new Error('Category not found.'),{status:404});
      assertSupportedCategory(old,409);
      item=(await client.query('UPDATE marketplace_categories SET name=$1,slug=$2,subtitle=$3,image_path=$4,position=$5,enabled=$6,module=$7 WHERE id=$8 RETURNING *',[p.name,p.slug,p.subtitle,p.image_path,p.position,p.enabled,p.module||old.module,req.params.id])).rows[0];
      if(old.name!==p.name){
        await client.query('UPDATE listings SET category=$1 WHERE category=$2',[p.name,old.name]);await client.query('UPDATE shops SET category=$1 WHERE category=$2',[p.name,old.name]);
        const configuration=(await client.query("SELECT value FROM platform_settings WHERE key='website' FOR UPDATE")).rows[0];
        if(configuration){const site=configuration.value;site.popular=site.popular.map(item=>item.category===old.name?{...item,category:p.name,label:item.label===old.name?p.name:item.label}:item);site.sections=site.sections.map(item=>item.category===old.name?{...item,category:p.name}:item);await client.query("UPDATE platform_settings SET value=$1,revision=revision+1,updated_at=now() WHERE key='website'",[site]);}
      }
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    await audit(req,'category.update',req.params.id);ok(res,item);
  });
  router.get('/website',async(req,res)=>ok(res,(await pool.query("SELECT value,revision FROM platform_settings WHERE key='website'")).rows[0]));
  router.put('/website',async(req,res)=>{
    const p=z.object({revision:z.number().int(),value:siteSchema}).parse(req.body);
    assertSiteOffering(p.value,(await pool.query('SELECT id,name,slug,module FROM marketplace_categories')).rows);
    const row=(await pool.query("UPDATE platform_settings SET value=$1,revision=revision+1,updated_at=now() WHERE key='website' AND revision=$2 RETURNING value,revision",[p.value,p.revision])).rows[0];
    if(!row)throw Object.assign(new Error('Another owner changed this page. Reload before saving.'),{status:409});await audit(req,'website.publish',row.revision);ok(res,row);
  });
  router.get('/accounts',async(req,res)=>ok(res,(await pool.query("SELECT id,name,email,phone,role,suspended,created_at,user_id,must_change_password FROM accounts WHERE NOT email LIKE 'deleted-%@invalid.example' ORDER BY created_at DESC LIMIT 100 OFFSET $1",[offset(req)])).rows));
  router.patch('/accounts/:id',async(req,res)=>{
    const p=z.object({suspended:z.boolean()}).parse(req.body);
    if(req.params.id===req.account.id)throw Object.assign(new Error('You cannot suspend your own owner account.'),{status:400});
    const row=(await pool.query("UPDATE accounts SET suspended=$1 WHERE id=$2 AND role NOT IN ('admin','support') RETURNING id,suspended",[p.suspended,z.string().uuid().parse(req.params.id)])).rows[0];
    if(!row)throw Object.assign(new Error('Account not found or protected owner account.'),{status:404});
    if(p.suspended)await pool.query('DELETE FROM sessions WHERE account_id=$1',[req.params.id]);await audit(req,'account.suspension',req.params.id);ok(res,row);
  });
  router.get('/shops',async(req,res)=>ok(res,(await pool.query("SELECT s.*,a.name AS owner_name,a.email AS owner_email,a.user_id AS owner_user_id,a.must_change_password AS owner_password_pending FROM shops s JOIN accounts a ON a.id=s.owner_id WHERE NOT a.email LIKE 'deleted-%@invalid.example' AND s.status<>'deleted' ORDER BY s.created_at DESC LIMIT 100 OFFSET $1",[offset(req)])).rows));
  router.patch('/shops/:id',async(req,res)=>{
    const p=z.object({status:z.enum(['active','inactive'])}).parse(req.body),id=z.string().uuid().parse(req.params.id);
    const managed=(await pool.query('SELECT owner_id,admin_managed,provisioned_by FROM shops WHERE id=$1',[id])).rows[0];
    if(managed?.admin_managed){
      const admin=await requireCatalogueAdministrator(pool,req.account);
      if(managed.owner_id!==admin.id&&managed.provisioned_by!==admin.id)throw Object.assign(new Error('This shop is not in your administrator-managed catalogue.'),{status:403});
    }
    if(p.status==='active'){
      const shop=(await pool.query('SELECT category FROM shops WHERE id=$1',[id])).rows[0];
      if(!shop)throw Object.assign(new Error('Shop not found.'),{status:404});
      await requireAvailableCategory(pool,shop.category,409);
    }
    if(p.status==='active'&&!managed?.admin_managed&&!(await pool.query('SELECT 1 FROM subscriptions WHERE shop_id=$1 AND paid_until>now()',[id])).rowCount)throw Object.assign(new Error('Only a paid shop can be published. Payment access cannot be bypassed.'),{status:409});
    const row=(await pool.query("UPDATE shops SET status=$1,moderated_hidden=$2 WHERE id=$3 AND status<>'deleted' RETURNING id,status",[p.status,p.status==='inactive',id])).rows[0];if(!row)throw Object.assign(new Error('Shop not found.'),{status:404});await audit(req,'shop.visibility',id);ok(res,row);
  });
  router.get('/listings',async(req,res)=>ok(res,(await pool.query("SELECT l.*,a.name AS seller_name FROM listings l JOIN accounts a ON a.id=l.seller_id WHERE NOT a.email LIKE 'deleted-%@invalid.example' AND l.status<>'deleted' AND (l.shop_id IS NULL OR EXISTS(SELECT 1 FROM shops parent WHERE parent.id=l.shop_id AND parent.status<>'deleted')) ORDER BY l.created_at DESC LIMIT 100 OFFSET $1",[offset(req)])).rows));
  router.patch('/listings/:id',async(req,res)=>{
    const p=z.object({status:z.enum(['active','removed']),title:z.string().trim().min(3).max(180).optional(),description:z.string().max(5000).optional()}).parse(req.body);
    const managed=(await pool.query('SELECT l.seller_id,l.admin_managed,s.provisioned_by FROM listings l LEFT JOIN shops s ON s.id=l.shop_id AND s.owner_id=l.seller_id WHERE l.id=$1',[z.string().uuid().parse(req.params.id)])).rows[0];
    if(managed?.admin_managed){
      const admin=await requireCatalogueAdministrator(pool,req.account);
      if(managed.seller_id!==admin.id&&managed.provisioned_by!==admin.id)throw Object.assign(new Error('This product is not in your administrator-managed catalogue.'),{status:403});
    }
    if(p.status==='active'){
      const listing=(await pool.query('SELECT kind,category FROM listings WHERE id=$1',[z.string().uuid().parse(req.params.id)])).rows[0];
      if(!listing)throw Object.assign(new Error('Listing not found.'),{status:404});
      if(!['product','service'].includes(listing.kind))throw Object.assign(new Error('Employment listings cannot be reactivated.'),{status:409});
      await requireAvailableCategory(pool,listing.category,409);
    }
    const row=(await pool.query("UPDATE listings SET status=$1,title=COALESCE($2,title),description=COALESCE($3,description) WHERE id=$4 AND status<>'deleted' AND (shop_id IS NULL OR EXISTS(SELECT 1 FROM shops parent WHERE parent.id=listings.shop_id AND parent.status<>'deleted')) RETURNING *",[p.status,p.title??null,p.description??null,z.string().uuid().parse(req.params.id)])).rows[0];if(!row)throw Object.assign(new Error('Listing not found.'),{status:404});await audit(req,'listing.update',row.id);ok(res,row);
  });
  router.get('/subscriptions',async(req,res)=>ok(res,(await pool.query('SELECT b.id,b.shop_id,s.name AS shop_name,a.email,b.provider_id,b.amount_minor,b.currency,b.period,b.status,b.paid_until,b.created_at FROM subscriptions b JOIN shops s ON s.id=b.shop_id JOIN accounts a ON a.id=b.account_id ORDER BY b.created_at DESC LIMIT 100 OFFSET $1',[offset(req)])).rows));
  router.get('/audit',async(req,res)=>ok(res,(await pool.query('SELECT u.action,u.target,u.created_at,a.name AS actor FROM admin_audit u JOIN accounts a ON a.id=u.actor_id ORDER BY u.created_at DESC LIMIT 100 OFFSET $1',[offset(req)])).rows));
  router.get('/reports',async(req,res)=>ok(res,(await pool.query("SELECT r.*,CASE WHEN r.inquiry_id IS NOT NULL THEN 'Conversation / user: '||COALESCE(a.name,'Deleted user') WHEN r.target_account_id IS NOT NULL THEN 'Seller: '||COALESCE(a.name,'Deleted user') ELSE l.title END AS title FROM reports r LEFT JOIN listings l ON l.id=r.listing_id LEFT JOIN accounts a ON a.id=r.target_account_id WHERE r.status='pending' ORDER BY r.created_at")).rows));
  router.get('/reports/:id/context',async(req,res)=>ok(res,await reportContext(pool,req.params.id)));
  router.post('/reports/:id',async(req,res)=>{
    const p=z.object({remove:z.boolean()}).parse(req.body),id=z.string().uuid().parse(req.params.id);
    const report=(await pool.query("UPDATE reports SET status=$1 WHERE id=$2 AND ($3=false OR (listing_id IS NOT NULL AND target_account_id IS NULL)) RETURNING *",[p.remove?'removed':'reviewed',id,p.remove])).rows[0];
    if(!report)throw Object.assign(new Error('Report not found, or use account moderation for a user report.'),{status:404});if(p.remove)await pool.query("UPDATE listings SET status='removed' WHERE id=$1 AND status<>'deleted'",[report.listing_id]);await audit(req,'report.review',id);ok(res,null);
  });
  router.get('/pricing',(req,res)=>ok(res,readPricing()));
  router.get('/storage',async(req,res)=>ok(res,await storageStatus()));
  router.get('/activity',async(req,res)=>ok(res,(await pool.query('SELECT e.action,e.route,e.status,e.created_at,a.name AS actor,a.role FROM activity_events e LEFT JOIN accounts a ON a.id=e.actor_id ORDER BY e.created_at DESC LIMIT 100 OFFSET $1',[offset(req)])).rows));
  router.get('/assessments',async(req,res)=>ok(res,(await pool.query("SELECT q.*,s.name,s.category,s.branches,s.size,s.expected_photos FROM shop_assessments q JOIN shops s ON s.id=q.shop_id JOIN accounts a ON a.id=s.owner_id WHERE NOT a.email LIKE 'deleted-%@invalid.example' AND s.status<>'deleted' ORDER BY q.updated_at DESC LIMIT 100 OFFSET $1",[offset(req)])).rows));
  router.post('/assessments/:id/suggest',async(req,res)=>{
    const id=z.string().uuid().parse(req.params.id);
    const shop=(await pool.query("SELECT * FROM shops WHERE id=$1 AND status<>'deleted'",[id])).rows[0];if(!shop)throw Object.assign(new Error('Shop not found.'),{status:404});
    const suggestion=await suggestPrice(shop);
    await pool.query('UPDATE shop_assessments SET suggestion=$1,updated_at=now() WHERE shop_id=$2',[suggestion,id]);
    await audit(req,'pricing.ai-suggestion',id);ok(res,suggestion);
  });
  router.put('/assessments/:id',async(req,res)=>{
    const id=z.string().uuid().parse(req.params.id),p=z.object({amountMinor:z.number().int().min(49900).max(10000000),reason:z.string().trim().min(10).max(1500),revision:z.number().int().min(1)}).parse(req.body);
    const client=await pool.connect();let row;
    try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[id]);
      if((await client.query("SELECT 1 FROM subscriptions WHERE shop_id=$1 AND status NOT IN ('cancelled','completed','expired','failed')",[id])).rowCount)throw Object.assign(new Error('This shop already has a checkout or mandate. Its agreed price cannot be changed here.'),{status:409});
      row=(await client.query("UPDATE shop_assessments SET status='approved',approved_amount_minor=$1,reason=$2,revision=revision+1,updated_at=now() WHERE shop_id=$3 AND revision=$4 RETURNING *",[p.amountMinor,p.reason,id,p.revision])).rows[0];
      if(!row)throw Object.assign(new Error('The quote changed. Reload before approving.'),{status:409});await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    await audit(req,'pricing.quote-approved',id);ok(res,row);
  });
  router.put('/pricing',async(req,res)=>{
    if(req.account.role!=='admin')throw Object.assign(new Error('Only the product owner can change registration fees.'),{status:403});
    const amount=z.number().int().min(49900).max(10000000);
    const p=z.object({approved:z.boolean(),version:z.string().min(1).max(80),period:z.literal('month'),currency:z.literal('INR'),startingAmountMinor:amount,tiers:z.object({small:amount,medium:amount,large:amount}),additionalBranchAmountMinor:z.number().int().min(0).max(10000000),categories:z.array(z.object({category:z.string().min(2).max(50),baseAmountMinor:amount,additionalBranchAmountMinor:z.number().int().min(0).max(10000000)})).max(100).default([])}).refine(p=>p.startingAmountMinor===p.tiers.small).parse(req.body);
    for(const rate of p.categories)await requireAvailableCategory(pool,rate.category);
    if(new Set(p.categories.map(c=>c.category)).size!==p.categories.length)throw Object.assign(new Error('Categories cannot be repeated.'),{status:400});
    await pool.query("INSERT INTO platform_settings(key,value) VALUES('pricing',$1) ON CONFLICT(key) DO UPDATE SET value=$1,revision=platform_settings.revision+1,updated_at=now()",[p]);setPricing(p);await audit(req,'pricing.update',p.version);ok(res,p);
  });
  return router;
}
