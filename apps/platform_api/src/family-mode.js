import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, lstat, realpath } from 'node:fs/promises';
import { resolve, basename, sep } from 'node:path';
import { z } from 'zod';
import { supportedCategorySql, isSupportedCategory } from './offering.js';
import { rejectDemoMutation } from './demo-catalogue.js';
import {requireCatalogueAdministrator} from './catalogue-policy.js';
import {categoryVisible,familyShopVisible,familyListingVisible} from './catalogue-visibility.js';
import {readCatalogueVersion} from './catalogue-version.js';
export {familyShopVisible,familyListingVisible} from './catalogue-visibility.js';

export const familyClient = 'public-family';
const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const mediaName = /^[a-f0-9-]+\.(?:jpg|png|webp)$/;
const uploadPath = /^\/uploads\/([a-f0-9-]+\.(?:jpg|png|webp))$/;
const types = { categories: 'marketplace_categories', shops: 'shops', listings: 'listings' };
const reportSchema = z.object({ targetType: z.enum(['categories', 'shops', 'listings']), targetId: z.string().min(1).max(100), reason: z.enum(['unsafe', 'inappropriate', 'misleading', 'other']) }).strict();
function familyTargetSql(type, parameter) {
  if (type === 'categories') return `SELECT 1 FROM marketplace_categories c WHERE c.id=${parameter} AND c.family_safe=true AND ${categoryVisible}`;
  if (type === 'shops') return `SELECT 1 FROM shops s WHERE s.id=${parameter}::uuid AND s.family_safe=true AND ${familyShopVisible}`;
  return `SELECT 1 FROM listings l WHERE l.id=${parameter}::uuid AND l.family_safe=true AND ${familyListingVisible}`;
}
// Ignore joined admin presentation fields. The shops admin list replaces the
// private owner_name with the account name; neither is exposed to family mode.
export function familyReviewVersion(row) {
  const derived = ['family_safe', 'family_review_version', 'seller_name', 'owner_name', 'owner_email', 'owner_user_id', 'owner_password_pending', 'listings_count'];
  const content = Object.fromEntries(Object.keys(row).sort().filter(key => !derived.includes(key)).map(key => [key, row[key]]));
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}
export async function initializeFamilyMode(pool) {
  await pool.query(await readFile(new URL('./family-schema.sql', import.meta.url), 'utf8'));
}
const denied = (res, status = 403, message = 'Family browsing only allows reviewed catalogue content.') => res.status(status).json({ success: false, code: 'FAMILY_BROWSING_ONLY', message });
const safeLabel = value => String(value || '').replace(/(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\d\s().-]{6,}\d)/gi, '').trim();
export function familyImageUrl(path, publicUrl = process.env.PUBLIC_URL || 'https://allinonetoday.com') {
  const match = String(path || '').match(uploadPath);
  if (!match) return '';
  return `${new URL(publicUrl).origin}/api/family-media/${match[1]}`;
}
export function familyListing(row, publicUrl) {
  return { id: row.id, title: safeLabel(row.title), category: safeLabel(row.category), subcategory: safeLabel(row.subcategory), kind: row.kind, price: row.price, formatted_price: safeLabel(row.formatted_price), image_path: familyImageUrl(row.image_path, publicUrl), gallery: (Array.isArray(row.gallery) ? row.gallery : []).map(path => familyImageUrl(path, publicUrl)).filter(Boolean), shop_id: row.shop_id || null, is_featured: false };
}
export function familyShop(row, publicUrl) {
  return { id: row.id, name: safeLabel(row.name), category: safeLabel(row.category), image_path: familyImageUrl(row.image_path, publicUrl), listings_count: row.listings_count || 0 };
}

// This runs before raw webhooks, general body parsing, auth, session issuance and the
// activity recorder. A family request cannot fall through to an older alias.
export function familyClientGuard(pool, { publicUrl, uploadDir = process.env.UPLOAD_DIR || './uploads', rateLimits = {}, demoCatalogue } = {}) {
  const router = Router();
  router.use((req, res, next) => {
    res.vary('X-AIT-Client');
    if (req.get('x-ait-client') !== familyClient) return next();
    res.set('Cache-Control', 'private, no-store, max-age=0');
    res.set('Pragma', 'no-cache');
    delete req.headers.cookie;
    delete req.headers.authorization;
    next();
  });
  // Default MemoryStore holds short-lived IP counters for abuse prevention.
  // Counters are neither database records nor child accounts/identifiers.
  const limitOptions = { standardHeaders: 'draft-8', legacyHeaders: false, handler: (req, res) => res.status(429).json({ success: false, code: 'FAMILY_RATE_LIMITED', message: 'Please wait before trying again.' }) };
  router.use(rateLimit({ ...limitOptions, windowMs: 60000, limit: rateLimits.catalogue || 120, skip: req => req.get('x-ait-client') !== familyClient }));
  router.post('/api/family-reports', (req, res, next) => {
    if (req.get('x-ait-client') !== familyClient) return denied(res);
    if (req.get('origin') && req.get('origin') !== new URL(publicUrl || process.env.PUBLIC_URL || 'https://allinonetoday.com').origin) return denied(res);
    if (Object.keys(req.query).length) return denied(res, 400, 'Do not include query parameters with a family report.');
    next();
  }, rateLimit({ ...limitOptions, windowMs: 3600000, limit: rateLimits.reports || 12 }), json({ limit: '1kb', strict: true }), rejectDemoMutation, async (req, res) => {
    const input = reportSchema.parse(req.body);
    if (input.targetType !== 'categories') z.string().uuid().parse(input.targetId);
    const result = await pool.query(`INSERT INTO family_content_reports(id,target_type,target_id,reason) SELECT $1::uuid,$2::text,$3::text,$4::text WHERE EXISTS(${familyTargetSql(input.targetType, '$3')}) RETURNING id`, [randomUUID(), input.targetType, input.targetId, input.reason]);
    if (!result.rowCount) return denied(res, 404, 'Reviewed content not found.');
    return res.status(201).json({ success: true, data: null, message: 'Report submitted for review.' });
  });
  router.use(async (req, res, next) => {
    if (req.get('x-ait-client') !== familyClient) return next();
    if (req.method !== 'GET') return denied(res);
    const path = req.path;
    const listingDetail = path.match(new RegExp(`^/api/(listings|vehicles)/(${uuidPattern})$`, 'i'));
    const media = path.match(/^\/api\/family-media\/([^/]+)$/);
    if (!['/api/categories', '/api/listings', '/api/shops', '/api/dealerships', '/api/businesses/trusted', '/api/catalogue/version'].includes(path) && !listingDetail && !media) return denied(res);
    const allowedKeys = path === '/api/listings' ? ['category', 'shop_id'] : [];
    if (Object.keys(req.query).some(key => !allowedKeys.includes(key)) || Object.values(req.query).some(value => typeof value !== 'string')) return denied(res, 400, 'Use the local family catalogue filters.');
    if(path==='/api/catalogue/version')return res.json({success:true,data:await readCatalogueVersion(pool,{family:true})});
    if (media) {
      const name = media[1];
      if (!mediaName.test(name) || basename(name) !== name) return denied(res, 404, 'Reviewed image not found.');
      if (demoCatalogue && name === demoCatalogue.mediaName) return demoCatalogue.sendMedia(req, res, { family: true, name });
      const original = '/uploads/' + name;
      const allowed = await pool.query(`SELECT 1 WHERE EXISTS(SELECT 1 FROM listings l WHERE l.family_safe=true AND ${familyListingVisible} AND (l.image_path=$1 OR l.gallery ? $1)) OR EXISTS(SELECT 1 FROM shops s WHERE s.family_safe=true AND ${familyShopVisible} AND s.image_path=$1)`, [original]);
      if (!allowed.rowCount) return denied(res, 404, 'Reviewed image not found.');
      const root = await realpath(resolve(uploadDir));
      const file = resolve(root, name);
      try {
        const info = await lstat(file);
        if (!info.isFile() || info.isSymbolicLink() || !(await realpath(file)).startsWith(root + sep)) return denied(res, 404, 'Reviewed image not found.');
      } catch (error) { if (error.code === 'ENOENT') return denied(res, 404, 'Reviewed image not found.'); throw error; }
      return res.sendFile(file, { cacheControl: false, lastModified: false, acceptRanges: false, dotfiles: 'deny', headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
    }
    let data;
    if (path === '/api/categories') {
      const rows = (await pool.query(`SELECT c.* FROM marketplace_categories c WHERE c.family_safe=true AND ${categoryVisible} ORDER BY c.position,c.name`)).rows;
      data = rows.map(row => ({ id: row.id, name: safeLabel(row.name), slug: row.slug, module: row.module, position: row.position, subtitle: '', image_path: '', image_url: '' }));
    } else if (path === '/api/listings' || listingDetail) {
      const values = [], where = ['l.family_safe=true', familyListingVisible];
      if (listingDetail) { values.push(listingDetail[2]); where.push(`l.id=$${values.length}`); }
      if (req.query.category && req.query.category !== 'All') { values.push(String(req.query.category).slice(0, 50)); where.push(`lower(l.category)=lower($${values.length})`); }
      if (req.query.shop_id) {
        const shopId=z.string().uuid().parse(req.query.shop_id);
        if(!(await pool.query(`SELECT 1 FROM shops s WHERE s.id=$1 AND s.family_safe=true AND ${familyShopVisible}`,[shopId])).rowCount)return denied(res,404,'Reviewed shop not found.');
        values.push(shopId);where.push(`l.shop_id=$${values.length}`);
      }
      let rows = (await pool.query(`SELECT l.* FROM listings l WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC LIMIT 100`, values)).rows;
      if (demoCatalogue) {
        if (listingDetail && listingDetail[2].toLowerCase() === demoCatalogue.id) { const demo = await demoCatalogue.readListing({ family: true }); rows = demo ? [demo] : []; }
        else if (!listingDetail) rows = await demoCatalogue.mergeListings(rows, req.query, { family: true });
      }
      if (listingDetail && !rows.length) return denied(res, 404, 'Reviewed listing not found.');
      data = listingDetail ? familyListing(rows[0], publicUrl) : rows.map(row => familyListing(row, publicUrl));
    } else {
      const vehicle = path === '/api/dealerships' ? " AND s.category='Vehicles'" : '';
      const rows = (await pool.query(`SELECT s.*,(SELECT count(*)::int FROM listings l WHERE l.shop_id=s.id AND l.family_safe=true AND ${familyListingVisible}) AS listings_count FROM shops s WHERE s.family_safe=true AND ${familyShopVisible}${vehicle} ORDER BY s.created_at DESC LIMIT 100`)).rows;
      data = rows.map(row => familyShop(row, publicUrl));
    }
    return res.json({ success: true, data });
  });
  return router;
}

export function familyReviewRouter(pool) {
  const router = Router();
  router.use((req, res, next) => {
    if (req.method === 'GET' && /^\/(categories|shops|listings)\/?$/.test(req.path)) {
      const json = res.json.bind(res);
      res.json = body => json(body?.success && Array.isArray(body.data) ? { ...body, data: body.data.map(row => ({ ...row, family_review_version: familyReviewVersion(row) })) } : body);
    }
    next();
  });
  const adminOnly = (req, res, next) => req.account?.role === 'admin' && !req.account.suspended ? next() : res.status(403).json({ success: false, message: 'Only the platform administrator can review family content.' });
  router.get('/family-reports', adminOnly, async (req, res) => {
    const offset = Math.max(0, Math.min(Number(req.query.offset) || 0, 100000));
    const rows = (await pool.query("SELECT r.*,COALESCE(c.name,s.name,l.title,'Removed content') AS target_label FROM family_content_reports r LEFT JOIN marketplace_categories c ON r.target_type='categories' AND c.id=r.target_id LEFT JOIN shops s ON r.target_type='shops' AND s.id::text=r.target_id LEFT JOIN listings l ON r.target_type='listings' AND l.id::text=r.target_id ORDER BY (r.status='pending') DESC,r.created_at DESC LIMIT 100 OFFSET $1", [offset])).rows;
    res.json({ success: true, data: rows });
  });
  router.post('/family-reports/:id/resolve', adminOnly, async (req, res) => {
    const id = z.string().uuid().parse(req.params.id), input = z.object({ remove: z.boolean() }).strict().parse(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const report = (await client.query('SELECT * FROM family_content_reports WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!report) throw Object.assign(new Error('Family report not found.'), { status: 404 });
      if (report.status !== 'pending') throw Object.assign(new Error('This family report has already been resolved.'), { status: 409 });
      if (input.remove) await client.query(`UPDATE ${types[report.target_type]} SET family_safe=false WHERE id=$1`, [report.target_id]);
      const updated = (await client.query("UPDATE family_content_reports SET status='resolved',removed=$2,resolved_at=now() WHERE id=$1 RETURNING *", [id, input.remove])).rows[0];
      await client.query('INSERT INTO admin_audit(id,actor_id,action,target) VALUES($1,$2,$3,$4)', [randomUUID(), req.account.id, input.remove ? 'family.report.remove' : 'family.report.resolve', `${id}:${report.target_type}:${report.target_id}`]);
      await client.query('COMMIT');
      res.json({ success: true, data: updated });
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  });
  router.post('/family-review/:type/:id', async (req, res) => {
    if (req.account?.role !== 'admin' || req.account.suspended) return res.status(403).json({ success: false, message: 'Only the platform administrator can review family content.' });
    const table = types[req.params.type];
    if (!table) return res.status(404).json({ success: false, message: 'Review type not found.' });
    const input = z.object({ approved: z.boolean(), contentVersion: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(req.body);
    const id = req.params.type === 'categories' ? z.string().min(1).max(100).parse(req.params.id) : z.string().uuid().parse(req.params.id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = (await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id])).rows[0];
      if (!row) throw Object.assign(new Error('Content not found.'), { status: 404 });
      if(row.admin_managed){
        const administrator=await requireCatalogueAdministrator(client,req.account);
        const ownerId=req.params.type==='shops'?row.owner_id:row.seller_id;
        const provisioned=req.params.type==='shops'?row.provisioned_by===administrator.id:
          row.shop_id&&Boolean((await client.query('SELECT 1 FROM shops WHERE id=$1 AND owner_id=$2 AND provisioned_by=$3 AND admin_managed=true',[row.shop_id,ownerId,administrator.id])).rowCount);
        if(ownerId!==administrator.id&&!provisioned)throw Object.assign(new Error('This item is not in your administrator-managed catalogue.'),{status:403});
      }
      if (familyReviewVersion(row) !== input.contentVersion) throw Object.assign(new Error('Content changed. Reload and review the current text and images before approving.'), { status: 409 });
      if (input.approved) {
        let eligible;
        if (req.params.type === 'categories') eligible = row.enabled && isSupportedCategory(row);
        else eligible = (await client.query(req.params.type === 'shops' ? `SELECT 1 FROM shops s WHERE s.id=$1 AND ${familyShopVisible}` : `SELECT 1 FROM listings l WHERE l.id=$1 AND ${familyListingVisible}`, [id])).rowCount > 0;
        if (!eligible) throw Object.assign(new Error('Review and publish its category and parent shop first. Hidden, expired or unsupported content cannot be approved.'), { status: 409 });
      }
      const updated = (await client.query(`UPDATE ${table} SET family_safe=$1 WHERE id=$2 RETURNING *`, [input.approved, id])).rows[0];
      await client.query('INSERT INTO admin_audit(id,actor_id,action,target) VALUES($1,$2,$3,$4)', [randomUUID(), req.account.id, input.approved ? 'family.approve' : 'family.revoke', `${req.params.type}:${id}:${input.contentVersion}`]);
      await client.query('COMMIT');
      res.json({ success: true, data: { ...updated, family_review_version: familyReviewVersion(updated) } });
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  });
  return router;
}
