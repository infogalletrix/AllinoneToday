import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {requireAvailableCategory} from './offering.js';
import {validateListingModule} from './listing-modules.js';
import {familyReviewVersion} from './family-mode.js';
import {catalogueError,requireCatalogueAdministrator} from './catalogue-policy.js';
import {ownerAccountSchema,provisionOwner} from './owner-credentials.js';

const text=(min,max)=>z.string().trim().min(min).max(max);
const image=z.string().regex(/^\/uploads\/[a-f0-9-]+\.webp$/).max(200);
const contentVersion=z.string().regex(/^[a-f0-9]{64}$/);
export const catalogueShopSchema=z.object({
  name:text(2,120),category:text(2,50),location:z.string().trim().max(180).default(''),
  phone:z.union([text(7,30),z.literal('')]).default(''),description:z.string().trim().max(2000).default(''),
  image_path:image.or(z.literal('')).default(''),branches:z.number().int().min(1).max(100).default(1),status:z.enum(['active','inactive']),
  subscription_amount:z.number().min(0).max(100000).optional().nullable(),
}).strict();
export const catalogueShopCreateSchema=catalogueShopSchema.extend({owner:ownerAccountSchema.optional()});
export const catalogueListingSchema=z.object({
  kind:z.enum(['product','service']),title:text(3,150),price:z.number().min(0).max(99999999999).refine(value=>Number(value.toFixed(2))===value,'Use at most two decimal places.'),
  category:text(2,50),subcategory:z.string().trim().max(80).default(''),location:z.string().trim().max(180).default(''),
  description:text(10,5000),image_path:image,gallery:z.array(image).max(6).default([]),
  specifications:z.record(z.string().max(60),z.string().max(300)).refine(value=>Object.keys(value).length<=30).default({}),
  shop_id:z.string().uuid().nullable().optional(),status:z.enum(['active','removed']),
}).strict();
export async function initializeAdminCatalogue(pool){await pool.query(await readFile(new URL('./admin-catalogue-schema.sql',import.meta.url),'utf8'));}
async function ownImages(db,accountId,paths){
  const unique=[...new Set(paths.filter(Boolean))];if(!unique.length)return;
  const owners=Array.isArray(accountId)?accountId:[accountId];
  const rows=(await db.query('SELECT path FROM uploads WHERE account_id=ANY($1::uuid[]) AND path=ANY($2::text[])',[owners,unique])).rows;
  if(rows.length!==unique.length)throw catalogueError(400,'Use photos uploaded by the platform administrator.');
}
async function savedParent(db,p,adminId){
  if(!p.shop_id)return;
  const shop=(await db.query('SELECT * FROM shops WHERE id=$1 AND (owner_id=$2 OR provisioned_by=$2) AND admin_managed=true FOR SHARE',[p.shop_id,adminId])).rows[0];
  if(!shop||shop.status==='deleted')throw catalogueError(400,'Choose a shop from the administrator-managed catalogue.');
  if(p.status==='active'){
    if(shop.status!=='active'||shop.moderated_hidden)throw catalogueError(409,'Publish the parent shop before publishing its products or services.');
    await requireAvailableCategory(db,shop.category,409);
  }
  return shop;
}
export function adminCatalogueRouter(pool){
  const router=Router();
  router.use(async(req,res,next)=>{req.catalogueAdmin=await requireCatalogueAdministrator(pool,req.account);next();});
  const respond=(res,row,status=200)=>{const {credentials,owner_user_id,...stored}=row;if(credentials)res.set('Cache-Control','no-store');return res.status(status).json({success:true,data:{...stored,family_review_version:familyReviewVersion(stored),...(owner_user_id?{owner_user_id}:{}),...(credentials?{credentials}:{})}});};
  async function transaction(req,action,save){
    const client=await pool.connect();try{
      await client.query('BEGIN');await requireCatalogueAdministrator(client,req.account);
      const row=await save(client);await client.query('INSERT INTO admin_audit(id,actor_id,action,target) VALUES($1,$2,$3,$4)',[randomUUID(),req.account.id,action,row.id]);await client.query('COMMIT');return row;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async function existing(client,table,id,req,version){
    const row=(await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[id])).rows[0];
    if(!row||row.status==='deleted')throw catalogueError(404,'Catalogue item not found.');
    const owner=table==='shops'?row.owner_id:row.seller_id;
    const provisioned=table==='shops'?row.provisioned_by===req.catalogueAdmin.id:row.shop_id&&Boolean((await client.query('SELECT 1 FROM shops WHERE id=$1 AND owner_id=$2 AND provisioned_by=$3 AND admin_managed=true',[row.shop_id,owner,req.catalogueAdmin.id])).rowCount);
    if(!row.admin_managed||(owner!==req.catalogueAdmin.id&&!provisioned))throw catalogueError(403,'This item is not in your administrator-managed catalogue.');
    if(familyReviewVersion(row)!==version)throw catalogueError(409,'The catalogue item changed. Reload it before saving.');return row;
  }
  router.post('/shops',async(req,res)=>{
    const p=catalogueShopCreateSchema.parse(req.body);
    const row=await transaction(req,'catalogue.shop.create',async client=>{
      await requireAvailableCategory(client,p.category);await ownImages(client,req.account.id,[p.image_path]);
      const provisioned=p.owner?await provisionOwner(client,p.owner,{provisionedBy:req.catalogueAdmin.id}):null;
      const subMinor = p.subscription_amount && p.subscription_amount > 0 ? Math.round(p.subscription_amount * 100) : null;
      const shop=(await client.query('INSERT INTO shops(id,owner_id,name,category,branches,location,phone,description,image_path,status,moderated_hidden,admin_managed,family_safe,provisioned_by,subscription_amount_minor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,false,$12,$13) RETURNING *',[randomUUID(),provisioned?.account.id||req.catalogueAdmin.id,p.name,p.category,p.branches,p.location,p.phone,p.description,p.image_path,p.status,p.status==='inactive',req.catalogueAdmin.id,subMinor])).rows[0];
      return {...shop,...(provisioned?{owner_user_id:provisioned.account.user_id,owner_email:provisioned.account.email,credentials:provisioned.credentials}:{})};
    });respond(res,row,201);
  });
  router.patch('/shops/:id',async(req,res)=>{
    const id=z.string().uuid().parse(req.params.id),p=catalogueShopSchema.extend({contentVersion}).parse(req.body);
    const row=await transaction(req,'catalogue.shop.update',async client=>{
      const saved=await existing(client,'shops',id,req,p.contentVersion);await requireAvailableCategory(client,p.category);await ownImages(client,[req.account.id,saved.owner_id],[p.image_path]);
      const subMinor = p.subscription_amount !== undefined ? (p.subscription_amount && p.subscription_amount > 0 ? Math.round(p.subscription_amount * 100) : null) : saved.subscription_amount_minor;
      return (await client.query('UPDATE shops SET name=$1,category=$2,branches=$3,location=$4,phone=$5,description=$6,image_path=$7,status=$8,moderated_hidden=$9,subscription_amount_minor=$10 WHERE id=$11 RETURNING *',[p.name,p.category,p.branches,p.location,p.phone,p.description,p.image_path,p.status,p.status==='inactive',subMinor,id])).rows[0];
    });respond(res,row);
  });
  async function listingValues(client,p,req){
    const category=await requireAvailableCategory(client,p.category);validateListingModule(p,{[category.name]:category.module});
    const parent=await savedParent(client,p,req.catalogueAdmin.id);await ownImages(client,[req.account.id,parent?.owner_id||req.account.id],[p.image_path,...p.gallery]);
    return {values:[p.title,p.price,'\u20b9 '+p.price.toLocaleString('en-IN',{maximumFractionDigits:2}),p.location,p.category,p.subcategory,p.description,p.image_path,JSON.stringify(p.gallery),p.specifications,p.shop_id||null,p.kind,p.status],sellerId:parent?.owner_id||req.catalogueAdmin.id};
  }
  router.post('/listings',async(req,res)=>{
    const p=catalogueListingSchema.parse(req.body);
    const row=await transaction(req,'catalogue.listing.create',async client=>{
      const {values,sellerId}=await listingValues(client,p,req);
      return (await client.query('INSERT INTO listings(title,price,formatted_price,location,category,subcategory,description,image_path,gallery,specifications,shop_id,kind,status,id,seller_id,admin_managed,family_safe) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,false) RETURNING *',[...values,randomUUID(),sellerId])).rows[0];
    });respond(res,row,201);
  });
  router.patch('/listings/:id',async(req,res)=>{
    const id=z.string().uuid().parse(req.params.id),p=catalogueListingSchema.extend({contentVersion}).parse(req.body);
    const row=await transaction(req,'catalogue.listing.update',async client=>{
      await existing(client,'listings',id,req,p.contentVersion);const {values,sellerId}=await listingValues(client,p,req);
      return (await client.query('UPDATE listings SET title=$1,price=$2,formatted_price=$3,location=$4,category=$5,subcategory=$6,description=$7,image_path=$8,gallery=$9,specifications=$10,shop_id=$11,kind=$12,status=$13,seller_id=$15 WHERE id=$14 RETURNING *',[...values,id,sellerId])).rows[0];
    });respond(res,row);
  });
  async function deletionTarget(client,table,id,req,version){
    const row=(await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[id])).rows[0];
    if(!row||row.status==='deleted')throw catalogueError(404,'Catalogue item not found.');
    const owner=table==='shops'?row.owner_id:row.seller_id;
    if(row.admin_managed && req.account?.role !== 'admin'){
      const provisioned=table==='shops'?row.provisioned_by===req.catalogueAdmin?.id:row.shop_id&&Boolean((await client.query('SELECT 1 FROM shops WHERE id=$1 AND owner_id=$2 AND provisioned_by=$3 AND admin_managed=true',[row.shop_id,owner,req.catalogueAdmin?.id])).rowCount);
      if(owner!==req.catalogueAdmin?.id&&!provisioned)throw catalogueError(403,'This item is not in your administrator-managed catalogue.');
    }
    if(version && familyReviewVersion(row)!==version)throw catalogueError(409,'The catalogue item changed. Refresh the records before deleting.');
    return row;
  }
  const deleteInput=z.object({contentVersion:contentVersion.optional().or(z.literal(''))});
  router.delete('/shops/:id',async(req,res)=>{
    const id=z.string().uuid().parse(req.params.id),input=deleteInput.parse(req.body);
    const result=await transaction(req,'catalogue.shop.delete',async client=>{
      // Match checkout creation's lock so no new mandate can start during deletion.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[id]);
      await deletionTarget(client,'shops',id,req,input.contentVersion);
      const subs=(await client.query("SELECT provider_id FROM subscriptions WHERE shop_id=$1 AND provider_id IS NOT NULL AND status NOT IN ('cancelled','completed','expired')",[id])).rows;
      for(const sub of subs){
        try{
          if(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET){
            const auth=Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
            await fetch(`https://api.razorpay.com/v1/subscriptions/${sub.provider_id}/cancel`,{
              method:'POST',
              headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/json'},
              body:JSON.stringify({cancel_at_cycle_end:0}),
              signal:AbortSignal.timeout(5000)
            });
          }
        }catch(_){}
      }
      await client.query("UPDATE subscriptions SET status='cancelled' WHERE shop_id=$1 AND status NOT IN ('cancelled','completed','expired')",[id]);
      const products=await client.query("UPDATE listings SET status='deleted',family_safe=false WHERE shop_id=$1 AND status<>'deleted' RETURNING id",[id]);
      await client.query("UPDATE shops SET status='deleted',moderated_hidden=true,family_safe=false WHERE id=$1",[id]);
      return {id,deleted:true,deletedProducts:products.rowCount};
    });res.json({success:true,data:result});
  });
  router.delete('/listings/:id',async(req,res)=>{
    const id=z.string().uuid().parse(req.params.id),input=deleteInput.parse(req.body);
    const result=await transaction(req,'catalogue.listing.delete',async client=>{
      await deletionTarget(client,'listings',id,req,input.contentVersion);
      await client.query("UPDATE listings SET status='deleted',family_safe=false WHERE id=$1",[id]);
      return {id,deleted:true};
    });res.json({success:true,data:result});
  });
  return router;
}
