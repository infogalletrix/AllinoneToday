// Employment advertising is outside the platform's current product/service offering.
// Keep historical records, but never allow a renamed legacy module to reopen it.
const employmentWords = /(^|[^a-z])(jobs?|careers?|employment|recruitment)([^a-z]|$)/i;
const employmentSql = '(^|[^a-z])(jobs?|careers?|employment|recruitment)([^a-z]|$)';
export const isJobName = value => employmentWords.test(String(value || ''));
export function isSupportedCategory(category) {
  if (typeof category === 'string') return !isJobName(category);
  return Boolean(category) && category.id !== 'cat_jobs'
    && !isJobName(category.name) && !isJobName(category.slug)
    && ['product', 'service'].includes(String(category.module || 'product').trim().toLowerCase());
}
export function assertSupportedCategory(category, status=400) {
  if (!isSupportedCategory(category)) throw Object.assign(new Error('Job, recruitment and employment listings are not offered. Choose a product or service category.'), {status});
}
// Alias values are constants in server code, never request input.
export function supportedCategorySql(alias='c') {
  return `lower(btrim(${alias}.module)) IN ('product','service') AND ${alias}.id<>'cat_jobs' AND lower(${alias}.name) !~ '${employmentSql}' AND lower(${alias}.slug) !~ '${employmentSql}'`;
}
export async function requireAvailableCategory(db, name, status=400) {
  assertSupportedCategory(name, status);
  const category=(await db.query('SELECT id,name,slug,module FROM marketplace_categories WHERE name=$1 AND enabled=true',[name])).rows[0];
  if (!category) throw Object.assign(new Error('This category is no longer available. Choose an available product or service category.'),{status});
  assertSupportedCategory(category, status);
  return category;
}
function restrictedReference(item, blockedNames) {
  if (isJobName(item.category) || blockedNames.has(item.category) || isJobName(item.label)) return true;
  if (item.link) {
    try {
      const target=new URL(item.link,'https://allinonetoday.com');
      const category=target.searchParams.get('category');
      if (isJobName(category) || blockedNames.has(category)) return true;
    } catch { /* A malformed historical link is not an employment category. */ }
  }
  return false;
}
export function filterSiteOffering(site, categories) {
  const blockedNames=new Set(categories.filter(category=>!isSupportedCategory(category)).map(category=>category.name));
  return {...site,
    popular:(site.popular||[]).filter(item=>!restrictedReference(item,blockedNames)),
    sections:(site.sections||[]).filter(item=>!restrictedReference(item,blockedNames)),
  };
}
export function assertSiteOffering(site, categories) {
  const filtered=filterSiteOffering(site,categories);
  if (filtered.popular.length!==site.popular.length || filtered.sections.length!==site.sections.length)
    throw Object.assign(new Error('Remove employment categories and links from website content before publishing.'),{status:400});
}
