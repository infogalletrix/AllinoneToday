import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { categorySchema, siteSchema } from './content.js';
import { readPricing, setPricing } from './pricing.js';
import { billingEnabled } from './billing.js';
import { aiConfigured, suggestPrice } from './assessments.js';

export function adminRouter(pool) {
  const router=Router();
  router.use((req,res,next)=>req.account.role==='admin'?next():res.status(403).json({success:false,message:'Product-owner access is required.'}));
  const ok=(res,data)=>res.json({success:true,data});
  const audit=(req,action,target)=>pool.query('INSERT INTO admin_audit(id,actor_id,action,target) VALUES($1,$2,$3,$4)',[randomUUID(),req.account.id,action,String(target)]);
  const offset=req=>Math.max(0,Math.min(Number(req.query.offset)||0,100000));
  router.get('/overview',async(req,res)=>{
    const totals=(await pool.query("SELECT (SELECT count(*)::int FROM accounts WHERE NOT email LIKE 'deleted-%@invalid.example') accounts,(SELECT count(*)::int FROM shops s JOIN accounts a ON a.id=s.owner_id WHERE NOT a.email LIKE 'deleted-%@invalid.example') shops,(SELECT count(*)::int FROM listings WHERE status='active') listings,(SELECT count(*)::int FROM reports r JOIN listings l ON l.id=r.listing_id WHERE r.status='pending' AND l.status='active') reports,(SELECT count(*)::int FROM subscriptions WHERE paid_until>now()) paid_subscriptions")).rows[0];
    ok(res,{...totals,billingEnabled:billingEnabled(),googleEnabled:Boolean(process.env.GOOGLE_WEB_CLIENT_ID),aiEnabled:aiConfigured()});
  });
  router.get('/categories',async(req,res)=>ok(res,(await pool.query('SELECT * FROM marketplace_categories ORDER BY position,name')).rows));
  router.post('/categories',async(req,res)=>{
    const p=categorySchema.parse(req.body),id=randomUUID();
    const item=(await pool.query('INSERT INTO marketplace_categories VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[id,p.name,p.slug,p.subtitle,p.image_path,p.position,p.enabled])).rows[0];
    await audit(req,'category.create',id);ok(res,item);
  });
  router.patch('/categories/:id',async(req,res)=>{
    const p=categorySchema.parse(req.body);const client=await pool.connect();let item;
    try{await client.query('BEGIN');const old=(await client.query('SELECT name FROM marketplace_categories WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!old)throw Object.assign(new Error('Category not found.'),{status:404});
      item=(await client.query('UPDATE marketplace_categories SET name=$1,slug=$2,subtitle=$3,image_path=$4,position=$5,enabled=$6 WHERE id=$7 RETURNING *',[p.name,p.slug,p.subtitle,p.image_path,p.position,p.enabled,req.params.id])).rows[0];
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
    const row=(await pool.query("UPDATE platform_settings SET value=$1,revision=revision+1,updated_at=now() WHERE key='website' AND revision=$2 RETURNING value,revision",[p.value,p.revision])).rows[0];
    if(!row)throw Object.assign(new Error('Another owner changed this page. Reload before saving.'),{status:409});await audit(req,'website.publish',row.revision);ok(res,row);
  });
  router.get('/accounts',async(req,res)=>ok(res,(await pool.query("SELECT id,name,email,phone,role,suspended,created_at FROM accounts WHERE NOT email LIKE 'deleted-%@invalid.example' ORDER BY created_at DESC LIMIT 100 OFFSET $1",[offset(req)])).rows));
  router.patch('/accounts/:id',async(req,res)=>{
    const p=z.object({suspended:z.boolean()}).parse(req.body);
    if(req.params.id===req.account.id)throw Object.assign(new Error('You cannot suspend your own owner account.'),{status:400});
    const row=(await pool.query("UPDATE accounts SET suspended=$1 WHERE id=$2 AND role!='admin' RETURNING id,suspended",[p.suspended,z.string().uuid().parse(req.params.id)])).rows[0];
    if(!row)throw Object.assign(new Error('Account not found or protected owner account.'),{status:404});
    if(p.suspended)await pool.query('DELETE FROM sessions WHERE account_id=$1',[req.params.id]);await audit(req,'account.suspension',req.params.id);ok(res,row);
  });
  router.get('/shops',async(req,res)=>ok(res,(await pool.query("SELECT s.*,a.name AS owner_name,a.email AS owner_email FROM shops s JOIN accounts a ON a.id=s.owner_id WHERE NOT a.email LIKE 'deleted-%@invalid.example' ORDER BY s.created_at DESC LIMIT 100 OFFSET $1",[offset(req)])).rows));
  router.patch('/shops/:id',async(req,res)=>{
    const p=z.object({status:z.enum(['active','inactive'])}).parse(req.body),id=z.string().uuid().parse(req.params.id);
    if(p.status==='active'&&!(await pool.query('SELECT 1 FROM subscriptions WHERE shop_id=$1 AND paid_until>now()',[id])).rowCount)throw Object.assign(new Error('Only a paid shop can be published. Payment access cannot be bypassed.'),{status:409});
    const row=(await pool.query('UPDATE shops SET status=$1,moderated_hidden=$2 WHERE id=$3 RETURNING id,status',[p.status,p.status==='inactive',id])).rows[0];if(!row)throw Object.assign(new Error('Shop not found.'),{status:404});await audit(req,'shop.visibility',id);ok(res,row);
  });
  router.get('/listings',async(req,res)=>ok(res,(await pool.query('SELECT l.*,a.name AS seller_name FROM listings l JOIN accounts a ON a.id=l.seller_id ORDER BY l.created_at DESC LIMIT 100 OFFSET $1',[offset(req)])).rows));
  router.patch('/listings/:id',async(req,res)=>{
    const p=z.object({status:z.enum(['active','removed']),title:z.string().trim().min(3).max(180).optional(),description:z.string().max(5000).optional()}).parse(req.body);
    const row=(await pool.query('UPDATE listings SET status=$1,title=COALESCE($2,title),description=COALESCE($3,description) WHERE id=$4 RETURNING *',[p.status,p.title??null,p.description??null,z.string().uuid().parse(req.params.id)])).rows[0];if(!row)throw Object.assign(new Error('Listing not found.'),{status:404});await audit(req,'listing.update',row.id);ok(res,row);
  });
  router.get('/subscriptions',async(req,res)=>ok(res,(await pool.query('SELECT b.id,b.shop_id,s.name AS shop_name,a.email,b.provider_id,b.amount_minor,b.currency,b.period,b.status,b.paid_until,b.created_at FROM subscriptions b JOIN shops s ON s.id=b.shop_id JOIN accounts a ON a.id=b.account_id ORDER BY b.created_at DESC LIMIT 100 OFFSET $1',[offset(req)])).rows));
  router.get('/audit',async(req,res)=>ok(res,(await pool.query('SELECT u.action,u.target,u.created_at,a.name AS actor FROM admin_audit u JOIN accounts a ON a.id=u.actor_id ORDER BY u.created_at DESC LIMIT 100 OFFSET $1',[offset(req)])).rows));
  router.get('/reports',async(req,res)=>ok(res,(await pool.query("SELECT r.*,l.title FROM reports r JOIN listings l ON l.id=r.listing_id WHERE r.status='pending' AND l.status='active' ORDER BY r.created_at")).rows));
  router.post('/reports/:id',async(req,res)=>{
    const p=z.object({remove:z.boolean()}).parse(req.body),id=z.string().uuid().parse(req.params.id);
    const report=(await pool.query('UPDATE reports SET status=$1 WHERE id=$2 RETURNING *',[p.remove?'removed':'reviewed',id])).rows[0];
    if(!report)throw Object.assign(new Error('Report not found.'),{status:404});if(p.remove)await pool.query("UPDATE listings SET status='removed' WHERE id=$1",[report.listing_id]);await audit(req,'report.review',id);ok(res,null);
  });
  router.get('/pricing',(req,res)=>ok(res,readPricing()));
  router.get('/assessments',async(req,res)=>ok(res,(await pool.query("SELECT q.*,s.name,s.category,s.branches,s.size,s.expected_photos FROM shop_assessments q JOIN shops s ON s.id=q.shop_id JOIN accounts a ON a.id=s.owner_id WHERE NOT a.email LIKE 'deleted-%@invalid.example' ORDER BY q.updated_at DESC LIMIT 100 OFFSET $1",[offset(req)])).rows));
  router.post('/assessments/:id/suggest',async(req,res)=>{
    const id=z.string().uuid().parse(req.params.id);
    const shop=(await pool.query('SELECT * FROM shops WHERE id=$1',[id])).rows[0];if(!shop)throw Object.assign(new Error('Shop not found.'),{status:404});
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
    const p=z.object({approved:z.boolean(),version:z.string().min(1).max(80),period:z.enum(['month','year']),currency:z.literal('INR'),startingAmountMinor:z.literal(49900),categories:z.array(z.object({category:z.string().min(2).max(50),baseAmountMinor:z.number().int().min(49900).max(10000000),additionalBranchAmountMinor:z.number().int().min(0).max(10000000)})).min(1).max(100)}).parse(req.body);
    for(const rate of p.categories)if(!(await pool.query('SELECT 1 FROM marketplace_categories WHERE name=$1',[rate.category])).rowCount)throw Object.assign(new Error('Choose an existing category.'),{status:400});
    if(new Set(p.categories.map(c=>c.category)).size!==p.categories.length)throw Object.assign(new Error('Categories cannot be repeated.'),{status:400});
    await pool.query("INSERT INTO platform_settings(key,value) VALUES('pricing',$1) ON CONFLICT(key) DO UPDATE SET value=$1,revision=platform_settings.revision+1,updated_at=now()",[p]);setPricing(p);await audit(req,'pricing.update',p.version);ok(res,p);
  });
  return router;
}
