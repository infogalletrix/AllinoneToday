import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { catalogueListingSchema } from './admin-catalogue.js';
import { catalogueError, shopPublicationAccessSql } from './catalogue-policy.js';
import { requireAvailableCategory } from './offering.js';
import { validateListingModule } from './listing-modules.js';
import { familyReviewVersion } from './family-mode.js';

const contentVersion = z.string().regex(/^[a-f0-9]{64}$/);
const amount = value => {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 && result <= 99999999999 && Number(result.toFixed(2)) === result ? result : null;
};

export function validateOwnerPricing(product) {
  const specs = product.specifications || {};
  if (Object.hasOwn(specs, 'MRP')) {
    const mrp = amount(specs.MRP);
    if (mrp === null || mrp < product.price) throw catalogueError(400, 'MRP must be at least the selling price.');
  }
  if (Object.hasOwn(specs, 'Offer price')) {
    const offer = amount(specs['Offer price']);
    if (!Object.hasOwn(specs, 'MRP') || offer === null || offer !== product.price) {
      throw catalogueError(400, 'Offer price must match the selling price and include a valid MRP.');
    }
  }
}

export async function ownerShop(db, accountId, shopId, publish = false) {
  if (!shopId) throw catalogueError(400, 'Choose one of your shops.');
  const shop = (await db.query(`SELECT s.*, ${shopPublicationAccessSql('s')} AS publication_access FROM shops s WHERE s.id=$1 AND s.owner_id=$2 FOR SHARE OF s`, [shopId, accountId])).rows[0];
  if (!shop || shop.status === 'deleted') throw catalogueError(404, 'Shop not found in your account.');
  if (publish) {
    if (shop.status !== 'active' || shop.moderated_hidden || !shop.publication_access) {
      throw catalogueError(409, 'Your shop must have active publishing access before making products public. You can save the product as hidden.');
    }
    await requireAvailableCategory(db, shop.category, 409);
  }
  return shop;
}

export function ownerCatalogueRouter(pool) {
  const router = Router();
  router.use((req, res, next) => {
    if (req.account?.role !== 'merchant' || req.account.suspended) throw catalogueError(403, 'A shop-owner account is required.');
    if (req.account.must_change_password) throw catalogueError(403, 'Change your temporary password before managing products.');
    next();
  });
  const respond = (res, row, status = 200) => res.status(status).json({ success: true, data: { ...row, family_review_version: familyReviewVersion(row) } });
  async function transaction(save) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = await save(client);
      await client.query('COMMIT');
      return row;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async function existing(db, req, version) {
    const row = (await db.query('SELECT * FROM listings WHERE id=$1 AND seller_id=$2 FOR UPDATE', [z.string().uuid().parse(req.params.id), req.account.id])).rows[0];
    if (!row || row.status === 'deleted') throw catalogueError(404, 'Product not found in your account.');
    if (!['product', 'service'].includes(row.kind)) throw catalogueError(409, 'This historical listing cannot be edited.');
    if (familyReviewVersion(row) !== version) throw catalogueError(409, 'This product changed. Refresh your catalogue before saving.');
    return row;
  }
  async function values(db, req, product, previous) {
    const category = await requireAvailableCategory(db, product.category);
    validateListingModule(product, { [category.name]: category.module });
    validateOwnerPricing(product);
    const shop = await ownerShop(db, req.account.id, product.shop_id, product.status === 'active');
    // Existing photos may have been supplied by the administrator who created the product.
    const retained = new Set(previous ? [previous.image_path, ...(previous.gallery || [])] : []);
    const paths = [...new Set([product.image_path, ...product.gallery])].filter(path => !retained.has(path));
    if (paths.length) {
      const images = (await db.query('SELECT path FROM uploads WHERE account_id=$1 AND path=ANY($2::text[])', [req.account.id, paths])).rows;
      if (images.length !== paths.length) throw catalogueError(400, 'Use your own uploaded product photos.');
    }
    return [product.title, product.price, '₹ ' + product.price.toLocaleString('en-IN', { maximumFractionDigits: 2 }), product.location,
      product.category, product.subcategory, product.description, product.image_path, JSON.stringify(product.gallery), product.specifications,
      shop.id, product.kind, product.status, Boolean(shop.admin_managed)];
  }
  router.post('/listings', async (req, res) => {
    const product = catalogueListingSchema.parse(req.body);
    const row = await transaction(async db => {
      const fields = await values(db, req, product);
      return (await db.query('INSERT INTO listings(title,price,formatted_price,location,category,subcategory,description,image_path,gallery,specifications,shop_id,kind,status,admin_managed,id,seller_id,family_safe) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,false) RETURNING *', [...fields, randomUUID(), req.account.id])).rows[0];
    });
    respond(res, row, 201);
  });
  router.patch('/listings/:id', async (req, res) => {
    const product = catalogueListingSchema.extend({ contentVersion }).parse(req.body);
    const row = await transaction(async db => {
      const previous = await existing(db, req, product.contentVersion);
      const fields = await values(db, req, product, previous);
      return (await db.query('UPDATE listings SET title=$1,price=$2,formatted_price=$3,location=$4,category=$5,subcategory=$6,description=$7,image_path=$8,gallery=$9,specifications=$10,shop_id=$11,kind=$12,status=$13,admin_managed=$14 WHERE id=$15 AND seller_id=$16 RETURNING *', [...fields, previous.id, req.account.id])).rows[0];
    });
    respond(res, row);
  });
  router.patch('/listings/:id/visibility', async (req, res) => {
    const input = z.object({ status: z.enum(['active', 'removed']), contentVersion }).strict().parse(req.body);
    const row = await transaction(async db => {
      const previous = await existing(db, req, input.contentVersion);
      await ownerShop(db, req.account.id, previous.shop_id, input.status === 'active');
      if (input.status === 'active') await requireAvailableCategory(db, previous.category, 409);
      return (await db.query('UPDATE listings SET status=$1 WHERE id=$2 AND seller_id=$3 RETURNING *', [input.status, previous.id, req.account.id])).rows[0];
    });
    respond(res, row);
  });
  return router;
}
