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
import { readPricing, quote, setPricing } from './pricing.js';
import { billingEnabled, createCheckout, verifyCheckout, handleWebhook, cancelSubscription } from './billing.js';
import { seedContent, publicContent } from './content.js';
import { adminRouter } from './admin.js';
import { googleAccount, googleConfig } from './google.js';
import { shopCapacity, needsAssessment, basicQuote, shopQuote } from './assessments.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
pg.types.setTypeParser(1700,Number);
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use('/api', rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
app.post('/api/billing/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req,res) => {
  await handleWebhook(pool, req.body, req.get('x-razorpay-signature'), req.get('x-razorpay-event-id'));
  res.json({ success: true });
});
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({extended:false,limit:'4kb'}));
app.use('/api',(req,res,next)=>{
  if(!['GET','HEAD'].includes(req.method) && req.get('origin') && req.get('origin')!==(process.env.PUBLIC_URL || 'http://localhost:5173')) throw fail(403,'Request origin is not allowed.');
  next();
});
app.use('/uploads', express.static(process.env.UPLOAD_DIR || './uploads', { dotfiles: 'deny', immutable: true, maxAge: '7d' }));
const ok = (res, data, message, status=200) => res.status(status).json({ success: true, data, message });
const fail = (status,message) => Object.assign(new Error(message), { status });
const text = (min=1,max=200) => z.string().trim().min(min).max(max);
const uuid = z.string().uuid();
const password = z.string().min(10).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).regex(/[^a-zA-Z0-9\s]/);
const publicAccount = account => ({ id: account.id, name: account.name, email: account.email, phone: account.phone, role: account.role, passwordSet:account.password_set, googleLinked:Boolean(account.google_sub) });
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
  // Native bearer tokens are not subject to browser CSRF; cookie writes require our origin.
  if (!req.get('authorization') && !['GET','HEAD'].includes(req.method)) {
    if (req.get('origin') !== (process.env.PUBLIC_URL || 'http://localhost:5173')) throw fail(403,'Request origin is not allowed.');
  }
  next();
}
async function issueSession(res, account, method='password') {
  const token = newToken();
  await pool.query("INSERT INTO sessions(token_hash,account_id,expires_at,auth_method) VALUES($1,$2,now()+interval '30 days',$3)",[tokenHash(token),account.id,method]);
  res.cookie('ait_session', token, { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'lax', maxAge:30*86400000, path:'/' });
  return { user: publicAccount(account), token };
}
const authLimit = rateLimit({ windowMs: 15*60000, limit: 15, standardHeaders:'draft-8', legacyHeaders:false });
app.get('/api/health', async (req,res)=> { await pool.query('SELECT 1'); ok(res,{ status:'ready', service:'allinonetoday', billingEnabled:billingEnabled() }); });
app.get('/api/site',async(req,res)=>ok(res,await publicContent(pool)));
app.get('/api/auth/config',(req,res)=>ok(res,googleConfig()));
app.post('/api/auth/google',authLimit,async(req,res)=>{
  const input=z.object({idToken:z.string().min(20).max(10000),role:z.enum(['buyer','merchant']).default('buyer')}).parse(req.body);
  const account=await googleAccount(pool,input.idToken,input.role,await accountFor(req));
  ok(res,await issueSession(res,account,'google'));
});
app.post('/api/auth/web-handoff',authLimit,async(req,res)=>{
  if(typeof req.body.code==='string'){
    const grant=(await pool.query('DELETE FROM web_handoffs WHERE code_hash=$1 AND expires_at>now() RETURNING *',[tokenHash(z.string().min(40).max(100).parse(req.body.code))])).rows[0];
    if(!grant)throw fail(401,'This application login link has expired. Reopen the dashboard.');
    const account=(await pool.query('SELECT * FROM accounts WHERE id=$1 AND suspended=false',[grant.account_id])).rows[0];
    if(!account)throw fail(401,'Account unavailable.');await issueSession(res,account,grant.auth_method);return res.redirect(303,account.role==='admin'?'/admin?embedded=1':'/merchant');
  }
  const account=await accountFor(req);if(!account||!['merchant','admin'].includes(account.role))throw fail(403,'A business account is required.');
  const code=newToken();await pool.query("INSERT INTO web_handoffs VALUES($1,$2,now()+interval '30 seconds',$3)",[tokenHash(code),account.id,account.auth_method]);ok(res,{code});
});
app.post('/api/admin/claim-owner',auth,authLimit,async(req,res)=>{
  const p=z.object({code:z.string().min(40).max(100)}).parse(req.body);
  if(!process.env.OWNER_EMAIL||req.account.email!==process.env.OWNER_EMAIL.toLowerCase()||!process.env.OWNER_SETUP_TOKEN_HASH||tokenHash(p.code)!==process.env.OWNER_SETUP_TOKEN_HASH)throw fail(403,'The owner setup code or account is incorrect.');
  const client=await pool.connect();try{await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('owner-setup'))");if((await client.query("SELECT 1 FROM accounts WHERE role='admin'")).rowCount)throw fail(409,'The product owner is already configured.');
    const account=(await client.query("UPDATE accounts SET role='admin' WHERE id=$1 RETURNING *",[req.account.id])).rows[0];await client.query('INSERT INTO admin_audit VALUES($1,$2,$3,$4,now())',[randomUUID(),account.id,'owner.claim',account.id]);await client.query('COMMIT');ok(res,await issueSession(res,account,req.account.auth_method));
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
});
app.use('/api/admin',auth,adminRouter(pool));
app.post('/api/auth/register', authLimit, async (req,res)=> {
  const input=z.object({ name:text(2,100), email:z.email().max(254), phone:z.string().trim().max(30).default(''), password, role:z.enum(['buyer','merchant']).default('buyer') }).parse(req.body);
  const hash=await hashPassword(input.password);
  const account=(await pool.query('INSERT INTO accounts(id,name,email,phone,password_hash,role) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [randomUUID(),input.name,input.email.toLowerCase(),input.phone,hash,input.role])).rows[0];
  ok(res, await issueSession(res,account), 'Account created.',201);
});
app.post('/api/auth/login',authLimit, async(req,res)=> {
  const input=z.object({ email:z.email().max(254), password:z.string().min(1).max(128) }).parse(req.body);
  const account=(await pool.query('SELECT * FROM accounts WHERE email=$1',[input.email.toLowerCase()])).rows[0];
  if(!account || account.suspended || !account.password_set || !await verifyPassword(input.password,account.password_hash)) throw fail(401,'Email or password is incorrect.');
  ok(res,await issueSession(res,account));
});
app.get('/api/auth/session',auth,(req,res)=>ok(res,publicAccount(req.account)));
app.post('/api/auth/logout',auth,async(req,res)=> {
  const token=req.get('authorization')?.slice(7) || req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('ait_session='))?.slice(12);
  if(token) await pool.query('DELETE FROM sessions WHERE token_hash=$1',[tokenHash(token)]);
  res.clearCookie('ait_session',{ path:'/' }); ok(res,null,'Signed out.');
});
app.get('/api/categories',async(req,res)=>ok(res,(await pool.query('SELECT *,image_path AS image_url FROM marketplace_categories WHERE enabled=true ORDER BY position,name')).rows));
async function checkCategory(name){if(!(await pool.query('SELECT 1 FROM marketplace_categories WHERE name=$1 AND enabled=true',[name])).rowCount)throw fail(400,'Choose an available category.');}
app.get('/api/billing/pricing',(req,res)=> { const pricing=readPricing(); ok(res,{ ...pricing, checkoutEnabled:billingEnabled() }); });
app.post('/api/billing/quote',async(req,res)=> { const input=z.object({ category:text(2,50), branches:z.number().int().min(1).max(100),...shopCapacity.shape }).parse(req.body);await checkCategory(input.category);ok(res,needsAssessment(input)?{requiresReview:true,period:'month',currency:'INR',message:'Save your shop for an owner-approved quote based on size, branches and photo storage.'}:basicQuote(input)); });
const shopSchema=z.object({ name:text(2,120), category:text(2,50), branches:z.number().int().min(1).max(100), location:text(2,180), phone:text(7,30), description:z.string().trim().max(2000).default(''), image_path:z.string().max(500).default(''),...shopCapacity.shape });
app.post('/api/shops',auth,async(req,res)=> {
  if(req.account.role!=='merchant') throw fail(403,'A shop-owner account is required.');
  const p=shopSchema.parse(req.body);
  await checkCategory(p.category);
  const existing=(await pool.query("SELECT id FROM shops WHERE owner_id=$1 AND status='pending_payment' LIMIT 1",[req.account.id])).rows[0];
  if(existing) throw fail(409,'You already have a pending shop. Continue its registration from your dashboard.');
  const shop=(await pool.query('INSERT INTO shops(id,owner_id,name,category,branches,location,phone,description,image_path,size,expected_photos) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[randomUUID(),req.account.id,p.name,p.category,p.branches,p.location,p.phone,p.description,p.image_path,p.size,p.expected_photos])).rows[0];
  if(needsAssessment(shop))await pool.query('INSERT INTO shop_assessments(shop_id) VALUES($1)',[shop.id]);
  ok(res,shop,'Shop details saved. Complete payment to publish your shop.',201);
});
app.get('/api/shops/mine',auth,async(req,res)=>ok(res,(await pool.query('SELECT s.*, (SELECT row_to_json(b) FROM (SELECT id,provider_id,status,amount_minor,period,paid_until FROM subscriptions WHERE shop_id=s.id ORDER BY created_at DESC LIMIT 1) b) AS subscription FROM shops s WHERE owner_id=$1 ORDER BY created_at DESC',[req.account.id])).rows));
app.patch('/api/shops/:id',auth,async(req,res)=>{
  const p=z.object({name:text(2,120),location:text(2,180),phone:text(7,30),description:z.string().trim().max(2000),image_path:z.string().regex(/^\/uploads\/[a-f0-9-]+\.webp$/).or(z.literal('')).default('')}).parse(req.body);
  if(p.image_path&&!(await pool.query('SELECT 1 FROM uploads WHERE path=$1 AND account_id=$2',[p.image_path,req.account.id])).rowCount)throw fail(400,'Upload your own shop image.');
  const shop=(await pool.query('UPDATE shops SET name=$1,location=$2,phone=$3,description=$4,image_path=$5 WHERE id=$6 AND owner_id=$7 RETURNING *',[p.name,p.location,p.phone,p.description,p.image_path,uuid.parse(req.params.id),req.account.id])).rows[0];if(!shop)throw fail(404,'Shop not found.');ok(res,shop);
});
const publicShop="s.status='active' AND s.moderated_hidden=false AND EXISTS(SELECT 1 FROM accounts a WHERE a.id=s.owner_id AND a.suspended=false) AND EXISTS(SELECT 1 FROM marketplace_categories c WHERE c.name=s.category AND c.enabled=true) AND EXISTS(SELECT 1 FROM subscriptions WHERE shop_id=s.id AND paid_until>now())";
app.get('/api/shops',async(req,res)=>ok(res,(await pool.query(`SELECT s.id,s.name,s.category,s.branches,s.location,s.description,s.image_path, (SELECT count(*)::int FROM listings WHERE shop_id=s.id AND status='active') AS listings_count FROM shops s WHERE ${publicShop} ORDER BY created_at DESC LIMIT 100`)).rows));
app.get('/api/dealerships',async(req,res)=>ok(res,(await pool.query(`SELECT id,name,location,category,image_path,'' AS rating,'Registered shop' AS badge FROM shops s WHERE category='Vehicles' AND ${publicShop} LIMIT 100`)).rows));
app.get('/api/businesses/trusted',async(req,res)=>ok(res,(await pool.query(`SELECT id,name,category,image_path,'' AS rating,0 AS verified_listings_count FROM shops s WHERE ${publicShop} LIMIT 100`)).rows));
app.get('/api/shops/:id/quote',auth,async(req,res)=>{const shop=(await pool.query('SELECT * FROM shops WHERE id=$1 AND owner_id=$2',[uuid.parse(req.params.id),req.account.id])).rows[0];if(!shop)throw fail(404,'Shop not found.');ok(res,await shopQuote(pool,shop));});
app.post('/api/billing/checkout',auth,async(req,res)=> { const input=z.object({ shopId:uuid,acceptedAmountMinor:z.number().int().min(49900).max(10000000) }).parse(req.body); ok(res,await createCheckout(pool,req.account,input.shopId,input.acceptedAmountMinor)); });
app.post('/api/billing/verify',auth,async(req,res)=> { const input=z.object({ requestId:uuid,paymentId:text(1,100),subscriptionId:text(1,100),signature:text(64,64) }).parse(req.body); ok(res,await verifyCheckout(pool,req.account,input)); });
app.post('/api/billing/cancel',auth,async(req,res)=> { const input=z.object({ requestId:uuid }).parse(req.body); ok(res,await cancelSubscription(pool,req.account,input.requestId)); });
const listingSelect='SELECT l.*,a.name AS seller_name,false AS is_featured FROM listings l JOIN accounts a ON a.id=l.seller_id';
const publicListing="l.status='active' AND EXISTS(SELECT 1 FROM accounts owner WHERE owner.id=l.seller_id AND owner.suspended=false) AND EXISTS(SELECT 1 FROM marketplace_categories c WHERE c.name=l.category AND c.enabled=true) AND (l.shop_id IS NULL OR EXISTS(SELECT 1 FROM subscriptions b JOIN shops s ON s.id=b.shop_id WHERE s.id=l.shop_id AND s.status='active' AND s.moderated_hidden=false AND b.paid_until>now()))";
app.get('/api/listings',async(req,res)=> {
  const values=[]; const where=[publicListing];
  if(req.query.category && req.query.category!=='All') { values.push(String(req.query.category).slice(0,50)); where.push(`lower(l.category)=lower($${values.length})`); }
  const query=String(req.query.q || req.query.query || '').slice(0,100);
  if(query) { values.push(`%${query}%`); where.push(`(l.title ILIKE $${values.length} OR l.location ILIKE $${values.length})`); }
  if(req.query.location) {values.push(`%${String(req.query.location).slice(0,180)}%`);where.push(`l.location ILIKE $${values.length}`);}
  if(req.query.shop_id) { values.push(uuid.parse(req.query.shop_id)); where.push(`l.shop_id=$${values.length}`); }
  const sort={price_low:'l.price ASC',price_high:'l.price DESC'}[req.query.sort] || 'l.created_at DESC';
  ok(res,(await pool.query(`${listingSelect} WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT 100`,values)).rows);
});
app.get('/api/listings/:id',async(req,res)=> { const item=(await pool.query(`${listingSelect} WHERE l.id=$1 AND ${publicListing}`,[uuid.parse(req.params.id)])).rows[0]; if(!item) throw fail(404,'Listing not found.'); ok(res,item); });
app.get('/api/vehicles/:id',async(req,res)=> { const item=(await pool.query(`${listingSelect} WHERE l.id=$1 AND ${publicListing}`,[uuid.parse(req.params.id)])).rows[0]; if(!item) throw fail(404,'Listing not found.'); ok(res,{...item,...item.specifications,listing_id:item.id,price:item.formatted_price,highlights:[]}); });
const listingSchema=z.object({ title:text(3,150),price:z.number().min(0).max(99999999999),location:text(2,180),category:text(2,50),subcategory:z.string().max(80).default(''),description:text(10,5000),image_path:z.string().regex(/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/).max(200),shop_id:uuid.nullable().optional(),specifications:z.record(z.string(),z.string().max(300)).default({}) });
app.post('/api/listings',auth,async(req,res)=> {
  const p=listingSchema.parse(req.body);
  await checkCategory(p.category);
  if(!(await pool.query('SELECT path FROM uploads WHERE path=$1 AND account_id=$2',[p.image_path,req.account.id])).rowCount) throw fail(400,'Upload your own listing photo first.');
  if(req.account.role==='merchant' && !p.shop_id) throw fail(403,'Choose your subscribed shop before publishing.');
  if(p.shop_id) {
    const shop=(await pool.query("SELECT s.id FROM shops s WHERE s.id=$1 AND s.owner_id=$2 AND s.status='active' AND EXISTS(SELECT 1 FROM subscriptions WHERE shop_id=s.id AND paid_until>now())",[p.shop_id,req.account.id])).rows[0];
    if(!shop) throw fail(403,'Your shop subscription must be active before publishing.');
  }
  const formatted=`₹ ${p.price.toLocaleString('en-IN')}`;
  const item=(await pool.query('INSERT INTO listings(id,seller_id,shop_id,title,price,formatted_price,location,category,subcategory,image_path,description,specifications) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[randomUUID(),req.account.id,p.shop_id || null,p.title,p.price,formatted,p.location,p.category,p.subcategory,p.image_path,p.description,p.specifications])).rows[0];
  ok(res,item,'Listing published.',201);
});
app.delete('/api/listings/:id',auth,async(req,res)=> { const result=await pool.query("UPDATE listings SET status='removed' WHERE id=$1 AND seller_id=$2",[uuid.parse(req.params.id),req.account.id]); if(!result.rowCount) throw fail(404,'Listing not found.'); ok(res,null,'Listing removed.'); });
app.get('/api/seller/catalogue',auth,async(req,res)=>ok(res,(await pool.query(`${listingSelect} WHERE l.seller_id=$1 ORDER BY l.created_at DESC`,[req.account.id])).rows));
app.get('/api/seller/metrics',auth,async(req,res)=> { const listings=Number((await pool.query("SELECT count(*) FROM listings WHERE seller_id=$1 AND status='active'",[req.account.id])).rows[0].count); const inquiries=Number((await pool.query('SELECT count(*) FROM inquiries WHERE recipient_id=$1',[req.account.id])).rows[0].count); ok(res,{active_listings:listings,total_views:0,enquiries:inquiries,messages:inquiries,growth_percent:0,period:'All time'}); });
const upload=multer({ storage:multer.memoryStorage(),limits:{ fileSize:8*1024*1024,files:1 } });
const uploadLimit=rateLimit({windowMs:3600000,limit:30,standardHeaders:'draft-8',legacyHeaders:false});
let uploadsInProgress=0;
app.post('/api/uploads',auth,uploadLimit,(req,res,next)=>{if(uploadsInProgress>=2)throw fail(429,'Photo processing is busy. Please retry shortly.');uploadsInProgress++;let released=false;const release=()=>{if(!released){released=true;uploadsInProgress--;}};res.once('finish',release);res.once('close',release);next();},upload.single('image'),async(req,res)=> {
  const data=req.file?.buffer; if(!data) throw fail(400,'Choose an image.');
  const ext=data.subarray(0,3).equals(Buffer.from([255,216,255]))?'jpg':data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':data.toString('ascii',0,4)==='RIFF' && data.toString('ascii',8,12)==='WEBP'?'webp':null;
  if(!ext) throw fail(400,'Use a JPEG, PNG, or WebP photo.');
  const allowance=Number((await pool.query('SELECT GREATEST(100,COALESCE(max(s.expected_photos),100)) AS allowance FROM shops s WHERE s.owner_id=$1 AND EXISTS(SELECT 1 FROM subscriptions b WHERE b.shop_id=s.id AND b.paid_until>now())',[req.account.id])).rows[0].allowance);
  if(Number((await pool.query('SELECT count(*) FROM uploads WHERE account_id=$1',[req.account.id])).rows[0].count)>=allowance)throw fail(429,'Your photo allowance is full. Contact support before uploading more.');
  let optimized;try{optimized=await sharp(data,{limitInputPixels:16000000}).rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();}catch{throw fail(400,'The image could not be processed. Choose a valid photo under 16 megapixels.');}
  const name=`${randomUUID()}.webp`;
  await writeFile(`${process.env.UPLOAD_DIR || './uploads'}/${name}`,optimized,{flag:'wx'});
  await pool.query('INSERT INTO uploads VALUES($1,$2,now())',[`/uploads/${name}`,req.account.id]);
  ok(res,{ url:`/uploads/${name}` },'Image uploaded.',201);
});
app.post('/api/conversations',auth,async(req,res)=> {
  const input=z.object({ listing_id:uuid.optional(),shop_id:uuid.optional(),phone:text(7,30),message:text(2,2000),preferred_date:z.string().max(40).default('') }).refine(p=>p.listing_id || p.shop_id).parse(req.body);
  const recipient=input.listing_id?(await pool.query(`SELECT l.seller_id AS id FROM listings l WHERE l.id=$1 AND ${publicListing}`,[input.listing_id])).rows[0]:(await pool.query(`SELECT owner_id AS id FROM shops s WHERE s.id=$1 AND ${publicShop}`,[input.shop_id])).rows[0];
  if(!recipient) throw fail(404,'The listing or shop is unavailable.');
  if(recipient.id===req.account.id) throw fail(400,'This is your own listing.');
  if((await pool.query('SELECT 1 FROM blocks WHERE (account_id=$1 AND blocked_id=$2) OR (account_id=$2 AND blocked_id=$1)',[req.account.id,recipient.id])).rowCount)throw fail(403,'Messaging is blocked between these accounts.');
  const inquiry=(await pool.query('INSERT INTO inquiries(id,listing_id,shop_id,sender_id,recipient_id,sender_name,phone,message,preferred_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[randomUUID(),input.listing_id||null,input.shop_id||null,req.account.id,recipient.id,req.account.name,input.phone,input.message,input.preferred_date])).rows[0];
  ok(res,inquiry,'Inquiry delivered.',201);
});
app.get('/api/conversations',auth,async(req,res)=>ok(res,(await pool.query('SELECT i.*,l.title AS item_tag,l.image_path AS item_thumbnail,a.name AS recipient_name FROM inquiries i LEFT JOIN listings l ON l.id=i.listing_id JOIN accounts a ON a.id=i.recipient_id WHERE i.sender_id=$1 OR i.recipient_id=$1 ORDER BY i.created_at DESC',[req.account.id])).rows.map(i=>({...i,sender_avatar:'',last_message:i.message,timestamp:i.created_at,is_buying:i.sender_id===req.account.id,unread_count:0}))));
async function ownInquiry(req) { const item=(await pool.query('SELECT * FROM inquiries WHERE id=$1 AND (sender_id=$2 OR recipient_id=$2)',[uuid.parse(req.params.id),req.account.id])).rows[0]; if(!item) throw fail(404,'Conversation not found.'); return item; }
app.get('/api/conversations/:id/messages',auth,async(req,res)=> { const inquiry=await ownInquiry(req); const messages=(await pool.query('SELECT * FROM messages WHERE inquiry_id=$1 ORDER BY created_at',[inquiry.id])).rows; ok(res,[{id:inquiry.id,sender_id:inquiry.sender_id,content:inquiry.message,sent_at:inquiry.created_at,is_from_me:inquiry.sender_id===req.account.id},...messages.map(m=>({...m,sent_at:m.created_at,is_from_me:m.sender_id===req.account.id}))]); });
app.post('/api/conversations/:id/messages',auth,async(req,res)=> { const inquiry=await ownInquiry(req);if((await pool.query('SELECT 1 FROM blocks WHERE (account_id=$1 AND blocked_id=$2) OR (account_id=$2 AND blocked_id=$1)',[inquiry.sender_id,inquiry.recipient_id])).rowCount)throw fail(403,'Messaging is blocked between these accounts.');const p=z.object({content:text(1,2000)}).parse(req.body); ok(res,(await pool.query('INSERT INTO messages VALUES($1,$2,$3,$4,now()) RETURNING *',[randomUUID(),req.params.id,req.account.id,p.content])).rows[0],'Message sent.',201); });
app.get('/api/profile',auth,(req,res)=>ok(res,{...publicAccount(req.account),address:'',avatar_url:'',favorites_count:0,saved_searches_count:0,recently_viewed_count:0,active_enquiries_count:0}));
app.patch('/api/profile',auth,async(req,res)=> { const p=z.object({name:text(2,100),phone:text(7,30)}).parse(req.body); ok(res,publicAccount((await pool.query('UPDATE accounts SET name=$1,phone=$2 WHERE id=$3 RETURNING *',[p.name,p.phone,req.account.id])).rows[0])); });
app.get('/api/profile/favorites',auth,async(req,res)=>ok(res,(await pool.query('SELECT l.* FROM favorites f JOIN listings l ON l.id=f.listing_id WHERE f.account_id=$1',[req.account.id])).rows));
app.post('/api/profile/favorites',auth,async(req,res)=> { const p=z.object({listing_id:uuid}).parse(req.body); await pool.query('INSERT INTO favorites VALUES($1,$2) ON CONFLICT DO NOTHING',[req.account.id,p.listing_id]); ok(res,null); });
app.delete('/api/profile/favorites/:id',auth,async(req,res)=> { await pool.query('DELETE FROM favorites WHERE account_id=$1 AND listing_id=$2',[req.account.id,uuid.parse(req.params.id)]); ok(res,null); });
app.post('/api/reports',auth,async(req,res)=>{const p=z.object({listingId:uuid,reason:text(10,2000)}).parse(req.body);await pool.query('INSERT INTO reports VALUES($1,$2,$3,$4,\'pending\',now())',[randomUUID(),req.account.id,p.listingId,p.reason]);ok(res,null,'Report submitted.',201);});
app.post('/api/blocks',auth,async(req,res)=>{const p=z.object({accountId:uuid}).parse(req.body);if(p.accountId===req.account.id)throw fail(400,'You cannot block yourself.');await pool.query('INSERT INTO blocks VALUES($1,$2,now()) ON CONFLICT DO NOTHING',[req.account.id,p.accountId]);ok(res,null,'This account can no longer message you.');});
app.get('/api/blocks',auth,async(req,res)=>ok(res,(await pool.query('SELECT b.blocked_id,a.name FROM blocks b JOIN accounts a ON a.id=b.blocked_id WHERE b.account_id=$1',[req.account.id])).rows));
app.delete('/api/blocks/:id',auth,async(req,res)=>{await pool.query('DELETE FROM blocks WHERE account_id=$1 AND blocked_id=$2',[req.account.id,uuid.parse(req.params.id)]);ok(res,null,'Account unblocked.');});
app.delete('/api/account',auth,async(req,res)=>{
  const input=z.object({password:z.string().max(128).default(''),confirmation:z.string().max(20).default(''),stopAutoPay:z.boolean().default(false)}).parse(req.body);
  const recentGoogle=!req.account.password_set&&req.account.google_sub&&req.account.auth_method==='google'&&new Date(req.account.authenticated_at)>new Date(Date.now()-300000)&&input.confirmation==='DELETE';
  if(!recentGoogle&&(!req.account.password_set||!await verifyPassword(input.password,req.account.password_hash)))throw fail(401,req.account.password_set?'Password is incorrect.':'Sign in again with Google to confirm deletion.');
  if(req.account.role==='admin')throw fail(409,'The product owner cannot delete their account here. Transfer ownership through a verified operator first.');
  const mandates=(await pool.query("SELECT * FROM subscriptions WHERE account_id=$1 AND provider_id IS NOT NULL AND status NOT IN ('cancelled','completed','expired','failed')",[req.account.id])).rows;
  if(mandates.length&&!input.stopAutoPay)throw fail(409,'Confirm that account deletion should stop your shop AutoPay immediately.');
  for(const mandate of mandates){const result=await cancelSubscription(pool,req.account,mandate.id,true);if(!['cancelled','completed','expired'].includes(result.status))throw fail(409,'AutoPay cancellation is awaiting confirmation. Your account has not been deleted.');}
  const images=(await pool.query('SELECT path FROM uploads WHERE account_id=$1',[req.account.id])).rows;
  const client=await pool.connect();
  try{await client.query('BEGIN');
    await client.query("UPDATE accounts SET name='Deleted user',email=$1,phone='',password_hash=$2 WHERE id=$3",[`deleted-${req.account.id}@invalid.example`,await hashPassword(newToken()),req.account.id]);
    await client.query('DELETE FROM sessions WHERE account_id=$1',[req.account.id]);
    await client.query('UPDATE accounts SET google_sub=NULL WHERE id=$1',[req.account.id]);
    await client.query("UPDATE shops SET status='inactive',name='Removed shop',phone='',location='',description='',image_path='' WHERE owner_id=$1",[req.account.id]);
    await client.query("UPDATE listings SET status='removed',title='Removed listing',description='',location='',image_path='',specifications='{}' WHERE seller_id=$1",[req.account.id]);
    await client.query("UPDATE inquiries SET sender_name='Deleted user',phone='',message='Removed by sender' WHERE sender_id=$1",[req.account.id]);
    await client.query("UPDATE messages SET content='Removed by sender' WHERE sender_id=$1",[req.account.id]);
    await client.query('DELETE FROM favorites WHERE account_id=$1',[req.account.id]);
    await client.query('DELETE FROM blocks WHERE account_id=$1 OR blocked_id=$1',[req.account.id]);
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  for(const image of images){if(/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/.test(image.path))await unlink(resolve(process.env.UPLOAD_DIR || './uploads',basename(image.path))).catch(()=>{});}
  await pool.query('DELETE FROM uploads WHERE account_id=$1',[req.account.id]);
  res.clearCookie('ait_session',{path:'/'});ok(res,null,'Your personal account data has been removed. Required financial records may be retained.');
});
app.get('/api/products',(req,res)=>ok(res,[]));
app.all(['/api/cart','/api/orders'],(req,res)=>res.status(501).json({success:false,message:'All in One Today connects buyers and sellers. Purchases are arranged directly with the seller.'}));
app.use((req,res)=>res.status(404).json({success:false,message:'Endpoint not found.'}));
app.use((error,req,res,next)=> {
  const status=error instanceof z.ZodError?400:error.code==='23505'?409:error.status || 500;
  const message=error instanceof z.ZodError?'Please check the submitted details. Passwords need at least 10 characters, uppercase, lowercase, a number and a special character.':error.code==='23505'?'This email or record already exists. Sign in to continue.':status<500?error.message:status===503?error.message:'The service could not complete this request. Please try again.';
  if(status>=500) console.error('request_failed',{method:req.method,path:req.path,type:error.name});
  res.status(status).json({success:false,message});
});
await pool.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
await seedContent(pool);
const persistedPricing=(await pool.query("SELECT value FROM platform_settings WHERE key='pricing'")).rows[0];
if(persistedPricing)setPricing(persistedPricing.value);
await mkdir(process.env.UPLOAD_DIR || './uploads',{recursive:true});
const server=app.listen(Number(process.env.PORT || 8080),'0.0.0.0',()=>console.log('All in One Today API ready'));
process.on('SIGTERM',()=>server.close(async()=>{await pool.end();process.exit(0);}));
