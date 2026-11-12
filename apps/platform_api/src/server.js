import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import pg from 'pg';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import { hashPassword, verifyPassword, newToken, tokenHash } from './security.js';
import { readPricing, quote, setPricing, publicPricing } from './pricing.js';
import { billingEnabled, createCheckout, verifyCheckout, handleWebhook, cancelSubscription } from './billing.js';
import { seedContent, publicContent } from './content.js';
import { adminRouter } from './admin.js';
import { googleAccount, googleConfig } from './google.js';
import { shopCapacity, needsAssessment, basicQuote, shopQuote } from './assessments.js';
import { billingConfiguration } from './billing-config.js';
import { shopTypes, registrationFields, validateBranches, shopImage, shopProfileSchema, updatedBranches } from './registration.js';
import { isOperator } from './roles.js';
import { enqueueEmail, startEmailDelivery } from './email.js';
import {validateListingModule} from './listing-modules.js';
import {supportRouter, recoveryRouter} from './operations.js';
import {storeImage, monitorStorage} from './storage.js';
import {requireAvailableCategory, supportedCategorySql} from './offering.js';
import {createReport} from './reports.js';
import {businessAppClientGuard, businessAppRouter} from './business-app.js';
import {familyClientGuard, familyReviewRouter, initializeFamilyMode,familyReviewVersion} from './family-mode.js';
import {createDemoCatalogue, rejectDemoMutation} from './demo-catalogue.js';
import {initializeAdminCatalogue} from './admin-catalogue.js';
import {loginSchema,requirePasswordReady,changeAccountPassword} from './owner-credentials.js';
import {ownerCatalogueRouter} from './owner-catalogue.js';
import {enquiryRecipient,withOwnerEnquiryMetadata,withConversationCapabilities,requireConversationReply} from './shop-chat.js';
import {shopPublicationAccessSql,managedListingOwnerSql} from './catalogue-policy.js';
import {catalogueSearchSql,catalogueLocationSql,shopPaginationSchema} from './catalogue-search.js';
import {locationRouter} from './locations.js';
import {publicShopVisible as publicShop,publicListingVisible as publicListing} from './catalogue-visibility.js';
import {initializeCatalogueVersion,catalogueVersionHandler} from './catalogue-version.js';

const publicAddress = new URL(process.env.PUBLIC_URL || 'http://localhost:5173');
const publicBasePath = publicAddress.pathname.replace(/\/$/, '');
const sessionPath = publicBasePath || '/';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const demoCatalogue=createDemoCatalogue(pool);
pg.types.setTypeParser(1700,Number);
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(familyClientGuard(pool,{demoCatalogue}));
app.use('/api', rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
// Apply the native business policy before every route, including raw webhooks.
app.use(businessAppClientGuard(accountFor));
app.post('/api/billing/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req,res) => {
  await handleWebhook(pool, req.body, req.get('x-razorpay-signature'), req.get('x-razorpay-event-id'));
  res.json({ success: true });
});
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({extended:false,limit:'4kb'}));
app.use(rejectDemoMutation);
app.use('/api',(req,res,next)=>{
  if(!['GET','HEAD'].includes(req.method) && req.get('origin') && req.get('origin')!==publicAddress.origin) throw fail(403,'Request origin is not allowed.');
  next();
});
app.use('/uploads', express.static(process.env.UPLOAD_DIR || './uploads', { dotfiles: 'deny', immutable: true, maxAge: '7d' }));
const ok = (res, data, message, status=200) => res.status(status).json({ success: true, data, message });
const fail = (status,message) => Object.assign(new Error(message), { status });
async function withEnquiryMetadata(rows) {return withOwnerEnquiryMetadata(pool,rows,demoCatalogue.id);}
const text = (min=1,max=200) => z.string().trim().min(min).max(max);
const uuid = z.string().uuid();
const password = z.string().min(10).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).regex(/[^a-zA-Z0-9\s]/);
const publicAccount = account => ({ id: account.id, name: account.name, email: account.email, phone: account.phone, role: account.role, user_id:account.user_id||null,must_change_password:Boolean(account.must_change_password),passwordSet:account.password_set, googleLinked:Boolean(account.google_sub) });
async function accountFor(req) {
  const cookie = req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('ait_session='))?.slice(12);
  const bearer = req.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{40,100})$/)?.[1];
  const token = bearer || cookie;
  if (!token) return null;
  return (await pool.query('SELECT a.*,s.auth_method,s.created_at AS authenticated_at FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>now() AND a.suspended=false', [tokenHash(token)])).rows[0] || null;
}
async function auth(req,res,next) {
  req.account = await accountFor(req);
  if (!req.account) throw fail(401, 'Sign in to continue.');
  requirePasswordReady(req.account,req.originalUrl);
  // Native bearer tokens are not subject to browser CSRF; cookie writes require our origin.
  if (!req.get('authorization') && !['GET','HEAD'].includes(req.method)) {
    if (req.get('origin') !== publicAddress.origin) throw fail(403,'Request origin is not allowed.');
  }
  next();
}
async function issueSession(res, account, method='password') {
  res.locals.actorId=account.id;
  const token = newToken();
  await pool.query("INSERT INTO sessions(token_hash,account_id,expires_at,auth_method) VALUES($1,$2,now()+interval '30 days',$3)",[tokenHash(token),account.id,method]);
  res.cookie('ait_session', token, { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'lax', maxAge:30*86400000, path:sessionPath });
  return { user: publicAccount(account), token };
}
const authLimit = rateLimit({ windowMs: 15*60000, limit: 15, standardHeaders:'draft-8', legacyHeaders:false });
app.use('/api/auth',(req,res,next)=>{res.set('Cache-Control','no-store');next();});
app.use((req,res,next)=>{
  if(!['GET','HEAD'].includes(req.method))res.once('finish',()=>{
    pool.query('INSERT INTO activity_events(id,actor_id,action,route,status) VALUES($1,$2,$3,$4,$5)',[randomUUID(),req.account?.id||res.locals.actorId||null,req.method,req.route?.path||req.path,res.statusCode]).catch(()=>console.error('activity_record_failed'));
  });next();
});
app.use('/api/support',auth,supportRouter(pool));
app.use('/api/auth',recoveryRouter(pool));
app.use('/api/business-app/login',authLimit);
app.use('/api/business-app',businessAppRouter({pool,auth,issueSession,publicAccount}));
app.get('/api/health', async (req,res)=> { await pool.query('SELECT 1'); ok(res,{ status:'ready', service:'allinonetoday', billingEnabled:billingEnabled(), paymentEnvironment:billingConfiguration().environment, billingMode:billingConfiguration().mode }); });
app.get('/api/site',async(req,res)=>ok(res,await publicContent(pool)));
app.get('/api/catalogue/version',catalogueVersionHandler(pool));
app.use('/api/locations',locationRouter());
app.get('/api/auth/config',(req,res)=>ok(res,googleConfig()));
app.post('/api/auth/google',authLimit,async(req,res)=>{
  const input=z.object({idToken:z.string().min(20).max(10000),role:z.enum(['buyer','merchant']).default('buyer')}).parse(req.body);
  const existing=await accountFor(req);requirePasswordReady(existing,req.originalUrl);
  const account=await googleAccount(pool,input.idToken,input.role,existing);
  ok(res,await issueSession(res,account,'google'));
});
app.post('/api/auth/web-handoff',authLimit,async(req,res)=>{
  if(typeof req.body.code==='string'){
    const grant=(await pool.query('DELETE FROM web_handoffs WHERE code_hash=$1 AND expires_at>now() RETURNING *',[tokenHash(z.string().min(40).max(100).parse(req.body.code))])).rows[0];
    if(!grant)throw fail(401,'This application login link has expired. Reopen the dashboard.');
    const account=(await pool.query('SELECT * FROM accounts WHERE id=$1 AND suspended=false',[grant.account_id])).rows[0];
    if(!account)throw fail(401,'Account unavailable.');requirePasswordReady(account,req.originalUrl);await issueSession(res,account,grant.auth_method);return res.redirect(303,publicBasePath+(isOperator(account.role)?'/admin?embedded=1':'/merchant'));
  }
  const account=await accountFor(req);if(!account||!['merchant','admin','support'].includes(account.role))throw fail(403,'A business account is required.');
  requirePasswordReady(account,req.originalUrl);
  const code=newToken();await pool.query("INSERT INTO web_handoffs VALUES($1,$2,now()+interval '30 seconds',$3)",[tokenHash(code),account.id,account.auth_method]);ok(res,{code});
});
app.post('/api/admin/claim-owner',auth,authLimit,async(req,res)=>{
  const p=z.object({code:z.string().min(40).max(100)}).parse(req.body);
  if(!process.env.OWNER_EMAIL||req.account.email!==process.env.OWNER_EMAIL.toLowerCase()||!process.env.OWNER_SETUP_TOKEN_HASH||tokenHash(p.code)!==process.env.OWNER_SETUP_TOKEN_HASH)throw fail(403,'The owner setup code or account is incorrect.');
  const client=await pool.connect();try{await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('owner-setup'))");if((await client.query("SELECT 1 FROM accounts WHERE role='admin'")).rowCount)throw fail(409,'The product owner is already configured.');
    const account=(await client.query("UPDATE accounts SET role='admin' WHERE id=$1 RETURNING *",[req.account.id])).rows[0];await client.query('INSERT INTO admin_audit VALUES($1,$2,$3,$4,now())',[randomUUID(),account.id,'owner.claim',account.id]);await client.query('COMMIT');ok(res,await issueSession(res,account,req.account.auth_method));
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
});
app.use('/api/admin',auth,familyReviewRouter(pool),adminRouter(pool));
app.use('/api/owner/catalogue',auth,ownerCatalogueRouter(pool));
app.post('/api/auth/register', authLimit, async (req,res)=> {
  const input=z.object({ name:text(2,100), email:z.email().max(254), phone:z.string().trim().max(30).default(''), password, role:z.enum(['buyer','merchant']).default('buyer') }).parse(req.body);
  const hash=await hashPassword(input.password);
  const account=(await pool.query('INSERT INTO accounts(id,name,email,phone,password_hash,role) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [randomUUID(),input.name,input.email.toLowerCase(),input.phone,hash,input.role])).rows[0];
  await enqueueEmail(pool,'welcome',account.id,`welcome:${account.id}`).catch(()=>console.error('welcome_email_queue_failed'));
  ok(res, await issueSession(res,account), 'Account created.',201);
});
app.post('/api/auth/login',authLimit, async(req,res)=> {
  const input=loginSchema.parse(req.body),identifier=(input.identifier||input.email).toLowerCase();
  const account=(await pool.query('SELECT * FROM accounts WHERE lower(email)=$1 OR lower(user_id)=$1',[identifier])).rows[0];
  if(!account || account.suspended || !account.password_set || !await verifyPassword(input.password,account.password_hash)) throw fail(401,'User ID, email or password is incorrect.');
  ok(res,await issueSession(res,account));
});
app.post('/api/auth/change-password',auth,authLimit,async(req,res)=>{
  const account=await changeAccountPassword(pool,req.account.id,req.body);
  await enqueueEmail(pool,'password_changed',account.id,`password-changed:${randomUUID()}`).catch(()=>console.error('password_email_queue_failed'));
  ok(res,await issueSession(res,account),'Password changed. Your shop account is ready.');
});
app.get('/api/auth/session',auth,(req,res)=>ok(res,publicAccount(req.account)));
app.post('/api/auth/logout',auth,async(req,res)=> {
  const token=req.get('authorization')?.slice(7) || req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('ait_session='))?.slice(12);
  if(token) await pool.query('DELETE FROM sessions WHERE token_hash=$1',[tokenHash(token)]);
  res.clearCookie('ait_session',{ path:sessionPath }); ok(res,null,'Signed out.');
});
app.get('/api/categories',async(req,res)=>ok(res,(await pool.query(`SELECT *,image_path AS image_url FROM marketplace_categories c WHERE c.enabled=true AND ${supportedCategorySql('c')} ORDER BY position,name`)).rows));
app.get('/api/demo-media/:name',async(req,res)=>demoCatalogue.sendMedia(req,res));
async function checkCategory(name){return requireAvailableCategory(pool,name);}
app.get('/api/billing/pricing',async(req,res)=> { const pricing=await publicPricing(pool); ok(res,{ ...pricing, checkoutEnabled:billingEnabled(), paymentMode:billingConfiguration().mode }); });
app.get('/api/shop-registration/config',async(req,res)=>ok(res,{shopTypes,sizes:['small','medium','large'],pricing:await publicPricing(pool)}));
app.post('/api/billing/quote',async(req,res)=> { const input=z.object({ category:text(2,50), branches:z.number().int().min(1).max(100),...shopCapacity.shape }).parse(req.body);await checkCategory(input.category);ok(res,needsAssessment(input)?{requiresReview:true,period:'month',currency:'INR',message:'Save your shop for an owner-approved quote based on size, branches and photo storage.'}:basicQuote(input)); });
const shopSchema=z.object({ name:text(2,120), category:text(2,50), branches:z.number().int().min(1).max(100), location:text(2,180), phone:text(7,30), description:z.string().trim().max(2000).default(''), image_path:shopImage.default(''),...shopCapacity.shape,...registrationFields });
app.post('/api/shops',auth,async(req,res)=> {
  if(req.account.role!=='merchant') throw fail(403,'A shop-owner account is required.');
  const p=shopSchema.parse(req.body);
  await checkCategory(p.category);
  if(p.image_path&&!(await pool.query('SELECT 1 FROM uploads WHERE path=$1 AND account_id=$2',[p.image_path,req.account.id])).rowCount)throw fail(400,'Upload your own shop image.');
  const branchDetails=validateBranches(p).map(branch=>({...branch,id:randomUUID()}));
  const existing=(await pool.query("SELECT id FROM shops WHERE owner_id=$1 AND status='pending_payment' LIMIT 1",[req.account.id])).rows[0];
  if(existing) throw fail(409,'You already have a pending shop. Continue its registration from your dashboard.');
  const shop=(await pool.query('INSERT INTO shops(id,owner_id,name,category,branches,location,phone,description,image_path,size,expected_photos,owner_name,shop_type,branch_details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',[randomUUID(),req.account.id,p.name,p.category,p.branches,p.location,p.phone,p.description,p.image_path,p.size,p.expected_photos,p.owner_name||req.account.name,p.shop_type,JSON.stringify(branchDetails)])).rows[0];
  if(needsAssessment(shop))await pool.query('INSERT INTO shop_assessments(shop_id) VALUES($1)',[shop.id]);
  ok(res,shop,'Shop details saved. Complete payment to publish your shop.',201);
});
app.get('/api/shops/mine',auth,async(req,res)=>ok(res,(await pool.query(`SELECT s.*, ${shopPublicationAccessSql('s')} AS publication_enabled, (SELECT row_to_json(b) FROM (SELECT id,provider_id,status,amount_minor,period,paid_until FROM subscriptions WHERE shop_id=s.id ORDER BY created_at DESC LIMIT 1) b) AS subscription FROM shops s WHERE owner_id=$1 AND s.status<>'deleted' ORDER BY created_at DESC`,[req.account.id])).rows));
app.patch('/api/shops/:id',auth,async(req,res)=>{
  if(req.account.role!=='merchant')throw fail(403,'A shop-owner account is required.');
  const p=shopProfileSchema.parse(req.body),id=uuid.parse(req.params.id);
  const existing=(await pool.query("SELECT * FROM shops WHERE id=$1 AND owner_id=$2 AND status<>'deleted'",[id,req.account.id])).rows[0];
  if(!existing)throw fail(404,'Shop not found.');
  if(existing.admin_managed&&!existing.provisioned_by)throw fail(403,'Use the administrator catalogue controls to edit this shop.');
  await checkCategory(existing.category);
  const branches=updatedBranches(existing,p.branch_details);
  if(p.image_path&&!(await pool.query('SELECT 1 FROM uploads WHERE path=$1 AND account_id=$2',[p.image_path,req.account.id])).rowCount)throw fail(400,'Upload your own shop image.');
  const shop=(await pool.query("UPDATE shops SET name=$1,location=$2,phone=$3,description=$4,image_path=$5,owner_name=COALESCE($6,owner_name),shop_type=COALESCE($7,shop_type),branch_details=$8 WHERE id=$9 AND owner_id=$10 AND status<>'deleted' RETURNING *",[p.name,p.location,p.phone,p.description,p.image_path,p.owner_name??null,p.shop_type??null,JSON.stringify(branches),id,req.account.id])).rows[0];if(!shop)throw fail(404,'Shop not found.');ok(res,shop);
});
app.get('/api/shops',async(req,res)=> {
  const values=[],where=[publicShop];
  if(req.query.id) {values.push(uuid.parse(req.query.id));where.push(`s.id=$${values.length}`);}
  const query=String(req.query.q || req.query.query || '').trim().slice(0,100);
  if(query)where.push(catalogueSearchSql(query,values));
  const category=String(req.query.category || '').trim().slice(0,50);
  if(category && category!=='All') {values.push(category);where.push(`lower(s.category)=lower($${values.length})`);}
  const location=String(req.query.location || '').trim().slice(0,180);
  if(location)where.push(catalogueLocationSql(location,values));
  const {limit,offset}=shopPaginationSchema.parse({limit:req.query.limit,offset:req.query.offset});
  values.push(limit,offset);const limitParameter='$'+(values.length-1),offsetParameter='$'+values.length;
  ok(res,await withEnquiryMetadata((await pool.query(`SELECT s.id,s.owner_id,s.name,s.category,s.branches,s.location,s.description,s.image_path, (SELECT count(*)::int FROM listings WHERE shop_id=s.id AND status='active') AS listings_count FROM shops s WHERE ${where.join(' AND ')} ORDER BY s.created_at DESC,s.id DESC LIMIT ${limitParameter} OFFSET ${offsetParameter}`,values)).rows));
});
app.get('/api/dealerships',async(req,res)=>ok(res,await withEnquiryMetadata((await pool.query(`SELECT id,owner_id,name,location,category,image_path,'' AS rating,'Listed shop' AS badge FROM shops s WHERE category='Vehicles' AND ${publicShop} LIMIT 100`)).rows)));
app.get('/api/businesses/trusted',async(req,res)=>ok(res,await withEnquiryMetadata((await pool.query(`SELECT id,owner_id,name,category,image_path,'' AS rating,0 AS verified_listings_count FROM shops s WHERE ${publicShop} LIMIT 100`)).rows)));
app.get('/api/shops/:id/quote',auth,async(req,res)=>{const shop=(await pool.query("SELECT * FROM shops WHERE id=$1 AND owner_id=$2 AND status<>'deleted'",[uuid.parse(req.params.id),req.account.id])).rows[0];if(!shop)throw fail(404,'Shop not found.');if(shop.admin_managed && req.account.role === 'admin')throw fail(409,'Administrator-managed shops do not require a subscription.');await checkCategory(shop.category);ok(res,await shopQuote(pool,shop));});
app.post('/api/billing/checkout',auth,async(req,res)=> { const input=z.object({ shopId:uuid,acceptedAmountMinor:z.number().int().min(100).max(10000000) }).parse(req.body); ok(res,await createCheckout(pool,req.account,input.shopId,input.acceptedAmountMinor)); });
app.post('/api/billing/verify',auth,async(req,res)=> { const input=z.object({ requestId:uuid,paymentId:text(1,100),subscriptionId:text(1,100),signature:text(64,64) }).parse(req.body); ok(res,await verifyCheckout(pool,req.account,input)); });
app.post('/api/billing/cancel',auth,async(req,res)=> { const input=z.object({ requestId:uuid }).parse(req.body); ok(res,await cancelSubscription(pool,req.account,input.requestId)); });
const listingSelect='SELECT l.*,a.name AS seller_name,false AS is_featured FROM listings l JOIN accounts a ON a.id=l.seller_id';
app.get('/api/listings',async(req,res)=> {
  const values=[]; const where=[publicListing];
  const category=String(req.query.category||'').trim().slice(0,50);
  if(category && category!=='All') {values.push(category);where.push(`lower(l.category)=lower($${values.length})`);}
  const subcategory=String(req.query.subcategory||'').trim().slice(0,80);
  if(subcategory && subcategory!=='All') {values.push(subcategory);where.push(`lower(l.subcategory)=lower($${values.length})`);}
  const query=String(req.query.q || req.query.query || '').trim().slice(0,100);
  if(query)where.push(catalogueSearchSql(query,values,{kind:'listing'}));
  const location=String(req.query.location||'').trim().slice(0,180);
  if(location)where.push(catalogueLocationSql(location,values,{kind:'listing'}));
  if(req.query.shop_id) {
    const shopId=uuid.parse(req.query.shop_id);
    if(!(await pool.query(`SELECT 1 FROM shops s WHERE s.id=$1 AND ${publicShop}`,[shopId])).rowCount)throw fail(404,'Shop not found.');
    values.push(shopId);where.push(`l.shop_id=$${values.length}`);
  }
  const sort={price_low:'l.price ASC',price_high:'l.price DESC'}[req.query.sort] || 'l.created_at DESC';
  ok(res,await withEnquiryMetadata(await demoCatalogue.mergeListings((await pool.query(`${listingSelect} WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT 100`,values)).rows,req.query)));
});
app.get('/api/listings/:id',async(req,res)=> { const item=req.params.id.toLowerCase()===demoCatalogue.id?await demoCatalogue.readListing():(await pool.query(`${listingSelect} WHERE l.id=$1 AND ${publicListing}`,[uuid.parse(req.params.id)])).rows[0]; if(!item) throw fail(404,'Listing not found.'); ok(res,(await withEnquiryMetadata([item]))[0]); });
app.get('/api/vehicles/:id',async(req,res)=> { const item=req.params.id.toLowerCase()===demoCatalogue.id?await demoCatalogue.readListing():(await pool.query(`${listingSelect} WHERE l.id=$1 AND ${publicListing}`,[uuid.parse(req.params.id)])).rows[0]; if(!item) throw fail(404,'Listing not found.'); ok(res,{...item,...item.specifications,...(await withEnquiryMetadata([item]))[0],listing_id:item.id,price:item.formatted_price,highlights:[]}); });
const listingSchema=z.object({ title:text(3,150),price:z.number().min(0).max(99999999999),location:text(2,180),category:text(2,50),subcategory:z.string().max(80).default(''),description:text(10,5000),image_path:z.string().regex(/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/).max(200),shop_id:uuid.nullable().optional(),branch_id:uuid.nullable().optional(),gallery:z.array(z.string().regex(/^\/uploads\/[a-f0-9-]+\.webp$/)).max(6).default([]),specifications:z.record(z.string().max(60),z.string().max(300)).refine(s=>Object.keys(s).length<=30).default({}) });
async function categoryModules(){return Object.fromEntries((await pool.query('SELECT name,module FROM marketplace_categories')).rows.map(c=>[c.name,c.module]));}
app.post('/api/listings',auth,async(req,res)=> {
  if(req.account.role!=='merchant')throw fail(403,'Only subscribed shop owners can publish listings. Public accounts are for browsing and contacting shops.');
  const p=listingSchema.parse(req.body);
  const kind=validateListingModule({...p,kind:req.body.kind},await categoryModules());
  await checkCategory(p.category);
  if(!(await pool.query('SELECT path FROM uploads WHERE path=$1 AND account_id=$2',[p.image_path,req.account.id])).rowCount) throw fail(400,'Upload your own listing photo first.');
  for(const path of p.gallery)if(!(await pool.query('SELECT 1 FROM uploads WHERE path=$1 AND account_id=$2',[path,req.account.id])).rowCount)throw fail(400,'Upload your own product gallery images.');
  if(!p.shop_id) throw fail(403,'Choose your subscribed shop before publishing.');
  if(p.shop_id) {
    const shop=(await pool.query(`SELECT s.id,s.branch_details FROM shops s WHERE s.id=$1 AND s.owner_id=$2 AND s.status='active' AND s.moderated_hidden=false AND EXISTS(SELECT 1 FROM marketplace_categories c WHERE c.name=s.category AND c.enabled=true AND ${supportedCategorySql('c')}) AND EXISTS(SELECT 1 FROM subscriptions WHERE shop_id=s.id AND paid_until>now())`,[p.shop_id,req.account.id])).rows[0];
    if(!shop) throw fail(403,'Your shop subscription must be active before publishing.');
    if(p.branch_id&&!shop.branch_details.some(branch=>branch.id===p.branch_id))throw fail(400,'Choose a branch registered to this shop.');
  }
  const formatted=`₹ ${p.price.toLocaleString('en-IN')}`;
  const item=(await pool.query('INSERT INTO listings(id,seller_id,shop_id,title,price,formatted_price,location,category,subcategory,image_path,description,specifications,gallery,branch_id,kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',[randomUUID(),req.account.id,p.shop_id || null,p.title,p.price,formatted,p.location,p.category,p.subcategory,p.image_path,p.description,p.specifications,JSON.stringify(p.gallery),p.branch_id||null,kind])).rows[0];
  ok(res,item,'Listing published.',201);
});
app.delete('/api/listings/:id',auth,async(req,res)=> { const result=await pool.query("UPDATE listings SET status='removed' WHERE id=$1 AND seller_id=$2 AND admin_managed=false AND status<>'deleted'",[uuid.parse(req.params.id),req.account.id]); if(!result.rowCount) throw fail(404,'Listing not found.'); ok(res,null,'Listing removed.'); });
app.patch('/api/listings/:id',auth,async(req,res)=> {
  if(req.account.role!=='merchant')throw fail(403,'Only subscribed shop owners can edit listings.');
  const id=uuid.parse(req.params.id),p=listingSchema.parse(req.body),kind=validateListingModule({...p,kind:req.body.kind},await categoryModules());
  const existing=(await pool.query("SELECT kind,category,admin_managed FROM listings WHERE id=$1 AND seller_id=$2 AND status='active'",[id,req.account.id])).rows[0];
  if(!existing)throw fail(404,'Active listing not found.');
  if(existing.admin_managed)throw fail(403,'Use the administrator catalogue controls to edit this listing.');
  if(!['product','service'].includes(existing.kind))throw fail(409,'Historical employment listings cannot be edited or republished.');
  await checkCategory(existing.category);
  await checkCategory(p.category);
  for(const path of new Set([p.image_path,...p.gallery]))if(!(await pool.query('SELECT 1 FROM uploads WHERE path=$1 AND account_id=$2',[path,req.account.id])).rowCount)throw fail(400,'Use your own listing photos.');
  const shop=(await pool.query(`SELECT s.branch_details FROM shops s WHERE s.id=$1 AND s.owner_id=$2 AND s.status='active' AND s.moderated_hidden=false AND EXISTS(SELECT 1 FROM marketplace_categories c WHERE c.name=s.category AND c.enabled=true AND ${supportedCategorySql('c')}) AND EXISTS(SELECT 1 FROM subscriptions WHERE shop_id=s.id AND paid_until>now())`,[p.shop_id,req.account.id])).rows[0];
  if(!shop)throw fail(403,'Your shop subscription must be active before editing.');
  if(p.branch_id&&!shop.branch_details.some(b=>b.id===p.branch_id))throw fail(400,'Choose a branch registered to this shop.');
  const item=(await pool.query("UPDATE listings SET title=$1,price=$2,formatted_price=$3,location=$4,category=$5,description=$6,image_path=$7,gallery=$8,specifications=$9,shop_id=$10,branch_id=$11,kind=$12,subcategory=$15 WHERE id=$13 AND seller_id=$14 AND status='active' RETURNING *",[p.title,p.price,`₹ ${p.price.toLocaleString('en-IN')}`,p.location,p.category,p.description,p.image_path,JSON.stringify(p.gallery),p.specifications,p.shop_id,p.branch_id||null,kind,id,req.account.id,p.subcategory])).rows[0];
  if(!item)throw fail(409,'This listing is no longer active.');ok(res,item,'Listing updated.');
});
app.get('/api/seller/catalogue',auth,async(req,res)=>ok(res,(await pool.query("SELECT l.* FROM listings l WHERE l.seller_id=$1 AND l.status<>'deleted' AND (l.shop_id IS NULL OR EXISTS(SELECT 1 FROM shops s WHERE s.id=l.shop_id AND s.status<>'deleted')) ORDER BY l.created_at DESC",[req.account.id])).rows.map(row=>({...row,seller_name:req.account.name,family_review_version:familyReviewVersion(row)}))));
app.get('/api/seller/metrics',auth,async(req,res)=> {
  const metrics=(await pool.query("SELECT (SELECT count(*)::int FROM listings WHERE seller_id=$1 AND status='active') active_listings,(SELECT count(*)::int FROM inquiries WHERE recipient_id=$1) enquiries,(SELECT count(*)::int FROM inquiries WHERE recipient_id=$1 AND created_at>=now()-interval '7 days') enquiries_this_week,(SELECT count(*)::int FROM shops WHERE owner_id=$1 AND status<>'deleted') shops,(SELECT COALESCE(sum(branches),0)::int FROM shops WHERE owner_id=$1 AND status<>'deleted') branches,(SELECT count(*)::int FROM shops s WHERE s.owner_id=$1 AND s.status<>'deleted' AND EXISTS(SELECT 1 FROM subscriptions b WHERE b.shop_id=s.id AND b.paid_until>now())) active_shops,(SELECT count(*)::int FROM favorites f JOIN listings l ON l.id=f.listing_id WHERE l.seller_id=$1) saved_products,(SELECT count(*)::int FROM messages WHERE sender_id=$1) replies",[req.account.id])).rows[0];ok(res,{...metrics,period:'All time'});
});
const upload=multer({ storage:multer.memoryStorage(),limits:{ fileSize:8*1024*1024,files:1 } });
const uploadLimit=rateLimit({windowMs:3600000,limit:30,standardHeaders:'draft-8',legacyHeaders:false});
let uploadsInProgress=0;
app.post('/api/uploads',auth,(req,res,next)=>{if(!['merchant','admin','support'].includes(req.account.role))throw fail(403,'Photo uploads are restricted to business accounts.');next();},uploadLimit,(req,res,next)=>{if(uploadsInProgress>=2)throw fail(429,'Photo processing is busy. Please retry shortly.');uploadsInProgress++;let released=false;const release=()=>{if(!released){released=true;uploadsInProgress--;}};res.once('finish',release);res.once('close',release);next();},upload.single('image'),async(req,res)=> {
  const data=req.file?.buffer; if(!data) throw fail(400,'Choose an image.');
  const ext=data.subarray(0,3).equals(Buffer.from([255,216,255]))?'jpg':data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':data.toString('ascii',0,4)==='RIFF' && data.toString('ascii',8,12)==='WEBP'?'webp':null;
  if(!ext) throw fail(400,'Use a JPEG, PNG, or WebP photo.');
  const allowance=Number((await pool.query('SELECT GREATEST(100,COALESCE(max(s.expected_photos),100)) AS allowance FROM shops s WHERE s.owner_id=$1 AND EXISTS(SELECT 1 FROM subscriptions b WHERE b.shop_id=s.id AND b.paid_until>now())',[req.account.id])).rows[0].allowance);
  if(Number((await pool.query('SELECT count(*) FROM uploads WHERE account_id=$1',[req.account.id])).rows[0].count)>=allowance)throw fail(429,'Your photo allowance is full. Contact support before uploading more.');
  let optimized;try{optimized=await sharp(data,{limitInputPixels:16000000}).rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();}catch{throw fail(400,'The image could not be processed. Choose a valid photo under 16 megapixels.');}
  const name=`${randomUUID()}.webp`;
  await storeImage(pool,req.account.id,name,optimized);
  ok(res,{ url:`/uploads/${name}` },'Image uploaded.',201);
});
app.post('/api/conversations',auth,async(req,res)=> {
  const input=z.object({ listing_id:uuid.optional(),shop_id:uuid.optional(),phone:text(7,30),message:text(2,2000),preferred_date:z.string().max(40).default('') }).strict().refine(p=>Boolean(p.listing_id)!==Boolean(p.shop_id)).parse(req.body);
  const target=input.listing_id?(await pool.query(`SELECT l.id,l.seller_id FROM listings l WHERE l.id=$1 AND ${publicListing}`,[input.listing_id])).rows[0]:(await pool.query(`SELECT s.id,s.owner_id FROM shops s WHERE s.id=$1 AND ${publicShop}`,[input.shop_id])).rows[0];
  if(!target) throw fail(404,'The listing or shop is unavailable.');
  const recipient=await enquiryRecipient(pool,target);
  if(recipient.id===req.account.id) throw fail(400,'You cannot start a conversation with your own shop.');
  if((await pool.query('SELECT 1 FROM blocks WHERE (account_id=$1 AND blocked_id=$2) OR (account_id=$2 AND blocked_id=$1)',[req.account.id,recipient.id])).rowCount)throw fail(403,'Messaging is blocked between these accounts.');
  const client=await pool.connect();let inquiry;
  try{await client.query('BEGIN');inquiry=(await client.query('INSERT INTO inquiries(id,listing_id,shop_id,sender_id,recipient_id,sender_name,phone,message,preferred_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[randomUUID(),input.listing_id||null,input.shop_id||null,req.account.id,recipient.id,req.account.name,input.phone,input.message,input.preferred_date])).rows[0];await client.query('INSERT INTO notifications(id,account_id,inquiry_id,title,body) VALUES($1,$2,$3,$4,$5)',[randomUUID(),recipient.id,inquiry.id,'New customer enquiry','Open All in One Today to view and reply.']);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  await enqueueEmail(pool,'enquiry',recipient.id,`enquiry:${inquiry.id}`).catch(()=>console.error('enquiry_email_queue_failed'));
  ok(res,inquiry,'Inquiry delivered.',201);
});
app.get('/api/conversations',auth,async(req,res)=>{const rows=(await pool.query('SELECT i.*,COALESCE(l.title,s.name) AS item_tag,COALESCE(l.image_path,s.image_path) AS item_thumbnail,a.name AS recipient_name FROM inquiries i LEFT JOIN listings l ON l.id=i.listing_id LEFT JOIN shops s ON s.id=i.shop_id JOIN accounts a ON a.id=i.recipient_id WHERE i.sender_id=$1 OR i.recipient_id=$1 ORDER BY i.created_at DESC',[req.account.id])).rows;ok(res,(await withConversationCapabilities(pool,rows)).map(i=>({...i,sender_avatar:'',last_message:i.message,timestamp:i.created_at,is_buying:i.sender_id===req.account.id,unread_count:0})));});
async function ownInquiry(req) { const item=(await pool.query('SELECT * FROM inquiries WHERE id=$1 AND (sender_id=$2 OR recipient_id=$2)',[uuid.parse(req.params.id),req.account.id])).rows[0]; if(!item) throw fail(404,'Conversation not found.'); return item; }
app.get('/api/conversations/:id',auth,async(req,res)=>{const inquiry=await ownInquiry(req);ok(res,(await withConversationCapabilities(pool,[inquiry]))[0]);});
app.get('/api/conversations/:id/messages',auth,async(req,res)=> { const inquiry=await ownInquiry(req); const messages=(await pool.query('SELECT * FROM messages WHERE inquiry_id=$1 ORDER BY created_at',[inquiry.id])).rows; ok(res,[{id:inquiry.id,sender_id:inquiry.sender_id,content:inquiry.message,sent_at:inquiry.created_at,is_from_me:inquiry.sender_id===req.account.id},...messages.map(m=>({...m,sent_at:m.created_at,is_from_me:m.sender_id===req.account.id}))]); });
app.post('/api/conversations/:id/messages',auth,async(req,res)=> {
  const inquiry=await ownInquiry(req);
  await requireConversationReply(pool,inquiry);
  if((await pool.query('SELECT 1 FROM blocks WHERE (account_id=$1 AND blocked_id=$2) OR (account_id=$2 AND blocked_id=$1)',[inquiry.sender_id,inquiry.recipient_id])).rowCount)throw fail(403,'Messaging is blocked between these accounts.');
  const p=z.object({content:text(1,2000)}).parse(req.body),client=await pool.connect();
  const recipientId=req.account.id===inquiry.sender_id?inquiry.recipient_id:inquiry.sender_id;
  let message;
  try {
    await client.query('BEGIN');
    message=(await client.query('INSERT INTO messages VALUES($1,$2,$3,$4,now()) RETURNING *',[randomUUID(),req.params.id,req.account.id,p.content])).rows[0];
    await client.query('INSERT INTO notifications(id,account_id,inquiry_id,title,body) VALUES($1,$2,$3,$4,$5)',[randomUUID(),recipientId,inquiry.id,'New enquiry reply','Open All in One Today to continue the conversation.']);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  await enqueueEmail(pool,'reply',recipientId,`reply:${message.id}`).catch(()=>console.error('reply_email_queue_failed'));
  ok(res,message,'Message sent.',201);
});
app.get('/api/notifications',auth,async(req,res)=>ok(res,(await pool.query('SELECT id,inquiry_id,title,body,read_at,created_at FROM notifications WHERE account_id=$1 ORDER BY created_at DESC LIMIT 100',[req.account.id])).rows));
app.post('/api/notifications/:id/read',auth,async(req,res)=>{const row=(await pool.query('UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND account_id=$2 RETURNING id',[uuid.parse(req.params.id),req.account.id])).rows[0];if(!row)throw fail(404,'Notification not found.');ok(res,row);});
app.get('/api/profile',auth,(req,res)=>ok(res,{...publicAccount(req.account),address:'',avatar_url:'',favorites_count:0,saved_searches_count:0,recently_viewed_count:0,active_enquiries_count:0}));
app.patch('/api/profile',auth,async(req,res)=> { const p=z.object({name:text(2,100),phone:text(7,30)}).parse(req.body); ok(res,publicAccount((await pool.query('UPDATE accounts SET name=$1,phone=$2 WHERE id=$3 RETURNING *',[p.name,p.phone,req.account.id])).rows[0])); });
app.get('/api/profile/favorites',auth,async(req,res)=>ok(res,(await pool.query(`SELECT l.* FROM favorites f JOIN listings l ON l.id=f.listing_id WHERE f.account_id=$1 AND ${publicListing}`,[req.account.id])).rows));
app.post('/api/profile/favorites',auth,async(req,res)=> { const p=z.object({listing_id:uuid}).parse(req.body); await pool.query('INSERT INTO favorites VALUES($1,$2) ON CONFLICT DO NOTHING',[req.account.id,p.listing_id]); ok(res,null); });
app.delete('/api/profile/favorites/:id',auth,async(req,res)=> { await pool.query('DELETE FROM favorites WHERE account_id=$1 AND listing_id=$2',[req.account.id,uuid.parse(req.params.id)]); ok(res,null); });
app.post('/api/reports',auth,rateLimit({windowMs:3600000,limit:20}),async(req,res)=>{await createReport(pool,req.account,req.body,publicListing);ok(res,null,'Report submitted for review.',201);});
app.post('/api/blocks',auth,async(req,res)=>{const p=z.object({accountId:uuid}).parse(req.body);if(p.accountId===req.account.id)throw fail(400,'You cannot block yourself.');await pool.query('INSERT INTO blocks VALUES($1,$2,now()) ON CONFLICT DO NOTHING',[req.account.id,p.accountId]);ok(res,null,'This account can no longer message you.');});
app.get('/api/blocks',auth,async(req,res)=>ok(res,(await pool.query('SELECT b.blocked_id,a.name FROM blocks b JOIN accounts a ON a.id=b.blocked_id WHERE b.account_id=$1',[req.account.id])).rows));
app.delete('/api/blocks/:id',auth,async(req,res)=>{await pool.query('DELETE FROM blocks WHERE account_id=$1 AND blocked_id=$2',[req.account.id,uuid.parse(req.params.id)]);ok(res,null,'Account unblocked.');});
app.delete('/api/account',auth,async(req,res)=>{
  const input=z.object({password:z.string().max(128).default(''),confirmation:z.string().max(20).default(''),stopAutoPay:z.boolean().default(false)}).parse(req.body);
  const recentGoogle=!req.account.password_set&&req.account.google_sub&&req.account.auth_method==='google'&&new Date(req.account.authenticated_at)>new Date(Date.now()-300000)&&input.confirmation==='DELETE';
  if(!recentGoogle&&(!req.account.password_set||!await verifyPassword(input.password,req.account.password_hash)))throw fail(401,req.account.password_set?'Password is incorrect.':'Sign in again with Google to confirm deletion.');
  if(isOperator(req.account.role))throw fail(409,'Protected operator accounts require a verified ownership transfer before deletion.');
  const mandates=(await pool.query("SELECT * FROM subscriptions WHERE account_id=$1 AND provider_id IS NOT NULL AND status NOT IN ('cancelled','completed','expired','failed')",[req.account.id])).rows;
  if(mandates.length&&!input.stopAutoPay)throw fail(409,'Confirm that account deletion should stop your shop AutoPay immediately.');
  for(const mandate of mandates){const result=await cancelSubscription(pool,req.account,mandate.id,true);if(!['cancelled','completed','expired'].includes(result.status))throw fail(409,'AutoPay cancellation is awaiting confirmation. Your account has not been deleted.');}
  const images=(await pool.query('SELECT path FROM uploads WHERE account_id=$1',[req.account.id])).rows;
  const client=await pool.connect();
  try{await client.query('BEGIN');
    // Keep the account ID for required financial records, but permanently revoke access
    // so a delayed billing event cannot make this deleted owner's content public again.
    await client.query("UPDATE accounts SET name='Deleted user',email=$1,phone='',password_hash=$2,password_set=false,owner_temporary_password=NULL,google_sub=NULL,suspended=true WHERE id=$3",[`deleted-${req.account.id}@invalid.example`,await hashPassword(newToken()),req.account.id]);
    await client.query('DELETE FROM sessions WHERE account_id=$1',[req.account.id]);
    await client.query('DELETE FROM web_handoffs WHERE account_id=$1',[req.account.id]);
    await client.query('DELETE FROM email_outbox WHERE account_id=$1',[req.account.id]);
    await client.query('DELETE FROM password_resets WHERE account_id=$1',[req.account.id]);
    await client.query("UPDATE support_messages SET content='Removed by sender' WHERE sender_id=$1",[req.account.id]);
    await client.query("UPDATE support_tickets SET subject='Deleted account request',status='resolved' WHERE account_id=$1",[req.account.id]);
    await client.query("UPDATE shops SET status=CASE WHEN status='deleted' THEN status ELSE 'inactive' END,moderated_hidden=true,name='Removed shop',owner_name='',branch_details='[]',phone='',location='',description='',image_path='' WHERE owner_id=$1",[req.account.id]);
    await client.query("UPDATE listings SET status=CASE WHEN status='deleted' THEN status ELSE 'removed' END,title='Removed listing',description='',location='',image_path='',gallery='[]',branch_id=NULL,subcategory='',price=0,formatted_price='',specifications='{}' WHERE seller_id=$1",[req.account.id]);
    await client.query("UPDATE inquiries SET sender_name='Deleted user',phone='',message='Removed by sender',preferred_date='' WHERE sender_id=$1",[req.account.id]);
    await client.query("UPDATE messages SET content='Removed by sender' WHERE sender_id=$1",[req.account.id]);
    await client.query('DELETE FROM favorites WHERE account_id=$1',[req.account.id]);
    await client.query('DELETE FROM blocks WHERE account_id=$1 OR blocked_id=$1',[req.account.id]);
    await client.query('DELETE FROM notifications WHERE account_id=$1',[req.account.id]);
    await client.query('DELETE FROM uploads WHERE account_id=$1',[req.account.id]);
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  for(const image of images){if(/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/.test(image.path))await unlink(resolve(process.env.UPLOAD_DIR || './uploads',basename(image.path))).catch(()=>{});}
  res.clearCookie('ait_session',{path:sessionPath});ok(res,null,'Your personal account data has been removed. Required financial records may be retained.');
});
app.get('/api/products',(req,res)=>ok(res,[]));
app.all(['/api/cart','/api/orders'],(req,res)=>res.status(501).json({success:false,message:'All in One Today connects buyers and sellers. Purchases are arranged directly with the seller.'}));
app.use((req,res)=>res.status(404).json({success:false,message:'Endpoint not found.'}));
app.use((error,req,res,next)=> {
  const status=error instanceof z.ZodError?400:error.code==='23505'?409:error.status || 500;
  const message=error instanceof z.ZodError?(error.issues?.[0]?.message || 'Please check the submitted details.'):error.code==='23505'?'This email or record already exists. Sign in to continue.':status<500?error.message:[503,507].includes(status)?error.message:'The service could not complete this request. Please try again.';
  if(status>=500) console.error('request_failed',{method:req.method,path:req.path,type:error.name});
  res.status(status).json({success:false,message,...(error.code==='PASSWORD_CHANGE_REQUIRED'?{code:error.code}:{})});
});
await pool.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
await initializeAdminCatalogue(pool);
await seedContent(pool);
await initializeFamilyMode(pool);
await initializeCatalogueVersion(pool);
const persistedPricing=(await pool.query("SELECT value FROM platform_settings WHERE key='pricing'")).rows[0];
if(persistedPricing)setPricing(persistedPricing.value);
await mkdir(process.env.UPLOAD_DIR || './uploads',{recursive:true});
const server=app.listen(Number(process.env.PORT || 8080),'0.0.0.0',()=>console.log('All in One Today API ready'));
const stopEmailDelivery=startEmailDelivery(pool);
const storageTimer=setInterval(()=>monitorStorage(pool).catch(()=>console.error('storage_monitor_failed')),300000);storageTimer.unref();
await monitorStorage(pool);
process.on('SIGTERM',()=>{clearInterval(storageTimer);server.close(async()=>{await stopEmailDelivery();await pool.end();process.exit(0);});});
