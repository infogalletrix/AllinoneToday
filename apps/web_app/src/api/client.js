import { isEmploymentFilter, isSupportedCategory, isSupportedListing } from '../listingScope.js';

export const categories = [
  "Vehicles",
  "Groceries",
  "Electronics",
  "Mobiles",
  "Services",
  "Furniture",
];
export async function request(path, options = {}) {
  const response = await fetch("/api" + path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const result = await response
    .json()
    .catch(() => ({ message: "The service is temporarily unavailable." }));
  if (!response.ok || !result.success)
    throw Object.assign(new Error(result.message || "Request failed."), { status: response.status, code: result.code });
  return result.data;
}
export const post = (path, body) =>
  request(path, { method: "POST", body: JSON.stringify(body) });
export function resolveImageUrl(path) {
  return path?.startsWith("assets/")
    ? "/" + path.slice(7)
    : path || "/images/h.png";
}
export const fetchCategories = () => request("/categories").then(items => items.filter(isSupportedCategory));
export const SHOP_PAGE_SIZE = 100;
async function searchRequest(path, options = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
  try { return await request(path, { cache: 'no-store', ...options, signal: controller.signal }); }
  catch (error) { if (timedOut) throw new Error('Search took too long. Check your connection and try again.'); throw error; }
  finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', cancel); }
}
export async function fetchShopPage(params = {}, options = {}) {
  const filters = { ...params, limit: params.limit ?? SHOP_PAGE_SIZE, offset: params.offset ?? 0 };
  const q = new URLSearchParams(Object.entries(params).filter(([key, value]) =>
    ['query', 'q', 'location', 'category'].includes(key) && value));
  q.set('limit', filters.limit);
  q.set('offset', filters.offset);
  if (isEmploymentFilter(q)) return { items: [], nextOffset: 0, hasMore: false };
  const rows = await searchRequest('/shops?' + q, options);
  if (!Array.isArray(rows)) throw new Error('Shop information is temporarily unavailable.');
  return {
    items: rows.filter(shop => isSupportedCategory(shop.category)),
    nextOffset: Number(filters.offset) + rows.length,
    hasMore: rows.length === Number(filters.limit),
  };
}
export const fetchShops = (params = {}, options = {}) => fetchShopPage(params, options).then(page => page.items);
export async function fetchShopDepth(params = {}, depth = SHOP_PAGE_SIZE, options = {}) {
  const items=[],seen=new Set();
  let page,nextOffset=0;
  do {
    page=await fetchShopPage({...params,limit:SHOP_PAGE_SIZE,offset:nextOffset},options);
    for(const shop of page.items)if(!seen.has(shop.id)){seen.add(shop.id);items.push(shop);}
    nextOffset=page.nextOffset;
  } while(page.hasMore&&nextOffset<Math.max(SHOP_PAGE_SIZE,depth));
  return {items,nextOffset,hasMore:page.hasMore};
}
export function fetchListings(params = {}, options = {}) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  if (isEmploymentFilter(q)) return Promise.resolve([]);
  return searchRequest("/listings?" + q, options).then(items => {
    if (!Array.isArray(items)) throw new Error('Listing information is temporarily unavailable.');
    return items.filter(isSupportedListing);
  });
}
export const fetchPublicShop = (id, options = {}) => searchRequest('/shops?' + new URLSearchParams({id}),options).then(rows=>{
  if(!Array.isArray(rows))throw new Error('Shop information is temporarily unavailable.');
  return rows.find(shop=>shop.id===id&&isSupportedCategory(shop.category))||null;
});
export const fetchListing = (id, options = {}) => searchRequest("/listings/" + id,options).then(item => {
  if (!isSupportedListing(item)) throw Object.assign(new Error('Listing not found.'),{status:404});
  return item;
});
export const fetchVehicleDetails = (id) => request("/vehicles/" + id);
export const fetchDealerships = () => request("/dealerships");
export const createListing = (body) => isSupportedListing(body)
  ? post("/listings", body)
  : Promise.reject(new Error('Choose a supported product or service category.'));
export const sendInquiry = (body) => post("/conversations", body);
export async function uploadImage(file) {
  const body = new FormData();
  body.append("image", file);
  return (await request("/uploads", { method: "POST", body })).url;
}
