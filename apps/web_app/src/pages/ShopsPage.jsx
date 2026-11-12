import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Building2, Layers, MapPin, PackageOpen, RefreshCw, Search, Store } from "lucide-react";
import { fetchShopPage, fetchShopDepth, resolveImageUrl, SHOP_PAGE_SIZE } from "../api/client";
import {watchPublicCatalogue} from '../publicCatalogueRefresh';
import { useSite } from "../SiteContext";
import "./ShopsPage.css";
import "./SearchFilters.css";
import LocationInput, { stopAutomaticLocationForPage } from "../components/common/LocationInput";

function ShopPhoto({ shop }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [shop.image_path]);
  return <div className="public-shop-photo">
    {shop.image_path && !failed ? <img src={resolveImageUrl(shop.image_path)} alt={shop.name} loading="lazy" onError={() => setFailed(true)} /> : <div className="public-shop-photo-placeholder"><Store size={52} strokeWidth={1.3} aria-hidden="true" /><span>{shop.category || "Local business"}</span></div>}
    <span className="public-shop-category">{shop.category}</span>
  </div>;
}

export default function ShopsPage() {
  const [params] = useSearchParams(), location = useLocation();
  const legacyId = params.get("shop") || (location.hash.startsWith("#shop-") ? location.hash.slice(6) : "");
  return legacyId ? <Navigate replace to={"/shops/" + encodeURIComponent(legacyId)} /> : <ShopDirectory />;
}

function ShopDirectory() {
  const [params, setParams] = useSearchParams();
  const { categories: siteCategories } = useSite();
  const [state, setState] = useState({ key: '', items: [], error: '', loading: true, refreshing: false, nextOffset: 0, hasMore: false, loadingMore: false, moreError: '' });
  const query = (params.get("query") || params.get("q") || "").trim(), category = params.get("category") || "", area = (params.get("location") || "").trim();
  const filterKey = JSON.stringify([query, category, area]);
  const alive = useRef(false), inFlight = useRef(false), controller = useRef(null), sequence = useRef(0), latestKey = useRef(filterKey);
  const loadedDepth = useRef(0),pendingRefresh=useRef(false),retryNeeded=useRef(false);
  useEffect(() => { loadedDepth.current = state.key === filterKey ? state.nextOffset : 0; }, [state.key, state.nextOffset, filterKey]);
  latestKey.current = filterKey;
  const load = useCallback(async function refreshShops({preserveDepth=false}={}) {
    if(!alive.current||latestKey.current!==filterKey||document.visibilityState!=='visible')return;
    if (inFlight.current) {if(preserveDepth)pendingRefresh.current=true;return;}
    inFlight.current = true;
    const version = ++sequence.current;
    const abort = new AbortController(); controller.current = abort;
    setState(previous => ({ ...previous, key: filterKey, items: previous.key === filterKey ? previous.items : [], error: '', loading: previous.key !== filterKey || previous.items.length === 0, refreshing: true, hasMore: previous.key === filterKey && previous.hasMore, loadingMore: false, moreError: '' }));
    try {
      const page = await fetchShopDepth({ query, category, location: area },preserveDepth?loadedDepth.current:SHOP_PAGE_SIZE, { signal: abort.signal });
      if (!alive.current || sequence.current !== version || latestKey.current !== filterKey) return;
      loadedDepth.current=page.nextOffset;
      retryNeeded.current=false;
      setState({ key: filterKey, ...page, error: '', loading: false, refreshing: false, loadingMore: false, moreError: '' });
    } catch (failure) {
      if (alive.current && sequence.current === version && latestKey.current === filterKey && failure.name !== 'AbortError') {retryNeeded.current=true;setState(previous => ({ ...previous, error: failure.message || 'We could not load shops. Please try again.', loading: false, refreshing: false }));}
    } finally {
      if (sequence.current === version) {inFlight.current = false;if(pendingRefresh.current){pendingRefresh.current=false;queueMicrotask(()=>refreshShops({preserveDepth:true}));}}
    }
  }, [query, category, area, filterKey]);
  useEffect(() => {
    alive.current = true;
    const timer = setTimeout(load, 0);
    const unwatch=watchPublicCatalogue(()=>load({preserveDepth:true}),{needsRefresh:()=>retryNeeded.current&&!inFlight.current});
    const hidden=()=>{if(document.visibilityState!=='visible'){sequence.current++;controller.current?.abort();inFlight.current=false;pendingRefresh.current=false;retryNeeded.current=true;}};
    document.addEventListener('visibilitychange',hidden);
    return () => {
      clearTimeout(timer);unwatch();alive.current = false; sequence.current += 1; controller.current?.abort(); inFlight.current = false;pendingRefresh.current=false;
      document.removeEventListener('visibilitychange',hidden);
    };
  }, [load]);
  const current = state.key === filterKey;
  const shops = current ? state.items : [], error = current ? state.error : '', loading = !current || state.loading, refreshing = current && state.refreshing;
  const filtered = Boolean(query || category || area);
  const categories = [...new Set([...siteCategories, category, ...shops.map(shop => shop.category)].filter(Boolean))].sort();
  // The API includes related category and word-form matches, so do not narrow them with a literal browser filter.
  const visible = shops;
  async function loadMore() {
    if (inFlight.current || !current || !state.hasMore||document.visibilityState!=='visible') return;
    inFlight.current = true;
    const version = sequence.current, abort = new AbortController(); controller.current = abort;
    setState(previous => ({ ...previous, loadingMore: true, moreError: '' }));
    try {
      const page = await fetchShopPage({ query, category, location: area, offset: state.nextOffset }, { signal: abort.signal });
      if (!alive.current || sequence.current !== version || latestKey.current !== filterKey) return;
      loadedDepth.current=page.nextOffset;
      setState(previous => {
        const ids = new Set(previous.items.map(shop => shop.id));
        return { ...previous, items: [...previous.items, ...page.items.filter(shop => !ids.has(shop.id))], nextOffset: page.nextOffset, hasMore: page.hasMore, loadingMore: false, moreError: '' };
      });
    } catch (failure) {
      if (alive.current && sequence.current === version && latestKey.current === filterKey && failure.name !== 'AbortError') setState(previous => ({ ...previous, loadingMore: false, moreError: failure.message || 'Please try again.' }));
    } finally {
      if (sequence.current === version) {inFlight.current = false;if(pendingRefresh.current){pendingRefresh.current=false;queueMicrotask(()=>load({preserveDepth:true}));}}
    }
  }

  return <section className="ait-page public-shops-page">
    <header className="public-shops-heading"><div><p className="ait-eyebrow">Discover local businesses</p><h1>Good shops. Great discoveries.</h1><p>Find a local business, explore what they offer, and discover something nearby.</p></div><button type="button" className="public-shops-refresh" onClick={load} disabled={refreshing} aria-label="Refresh shops"><RefreshCw size={17} className={refreshing ? "is-refreshing" : ""} aria-hidden="true" />{refreshing ? "Refreshing…" : "Refresh shops"}</button></header>
    <form key={filterKey} className="ait-search marketplace-search-filters public-shop-search-form" onSubmit={event => {
      event.preventDefault(); const next = new URLSearchParams();
      for (const [name, value] of new FormData(event.currentTarget)) if (String(value).trim()) next.set(name, String(value).trim());
      const nextKey = JSON.stringify([next.get('query') || '', next.get('category') || '', next.get('location') || '']);
      if (nextKey === filterKey) load(); else setParams(next);
    }}>
      <label className="search-filter-field search-filter-query"><span>Search shops</span><input name="query" aria-label="Search shops" type="search" maxLength={100} placeholder="Shop name or what they offer" defaultValue={query}/></label>
      <div className="search-filter-field"><span>City or area (optional)</span><LocationInput defaultValue={area} placeholder="All areas" cancelPendingOnSubmit/></div>
      <label className="search-filter-field public-shops-filter"><span>Category</span><select name="category" aria-label="Filter by category" defaultValue={category}><option value="">All categories</option>{categories.map(name => <option key={name}>{name}</option>)}</select></label>
      <div className="search-filter-actions"><button type="submit" className="btn-primary"><Search size={16} aria-hidden="true"/>Search</button>{filtered && <button type="button" className="btn-secondary" onClick={() => { stopAutomaticLocationForPage(); setParams({}); }}>Clear filters</button>}</div>
      <p className="search-filter-hint">Search by shop name. Add a category or location only to narrow results.</p>
    </form>
    {filtered && <p className="search-applied-filters" aria-label="Applied search filters">{[query, area, category].filter(Boolean).map((value, index) => <span key={index}>{value}</span>)}</p>}
    {error && <div className="public-shops-error" role="alert"><div><strong>We couldn’t refresh the shops.</strong><p>{error}{shops.length ? " Your last loaded shops are still shown below." : ""}</p></div><button type="button" onClick={load} disabled={refreshing}>Try again</button></div>}
    <div className="public-shops-results"><p aria-live="polite">{loading ? "Finding local shops…" : visible.length + (visible.length === 1 ? " shop to explore" : " shops to explore")}</p></div>
    {loading ? <div className="public-shops-loading" role="status"><Store size={32} aria-hidden="true" /><p>Loading shops…</p></div> : visible.length ? <div className="public-shops-grid">{visible.map(shop => {
      const count = Math.max(0, Number(shop.listings_count) || 0), branches = Math.max(1, Number(shop.branches) || 1);
      const shopUrl = "/shops/" + encodeURIComponent(shop.id);
      return <article className="public-shop-card" key={shop.id} aria-label={shop.name}>
        <Link className="public-shop-image-link" to={shopUrl} aria-label={"View " + shop.name}><ShopPhoto shop={shop} /></Link>
        <div className="public-shop-body"><h2><Link to={shopUrl}>{shop.name}</Link></h2><p className="public-shop-location"><MapPin size={15} aria-hidden="true" />{shop.location || "Location not provided"}</p><p className="public-shop-description">{shop.description || "Explore this local business on All in One Today."}</p>
          <div className="public-shop-meta"><span><Building2 size={15} aria-hidden="true" />{branches} {branches === 1 ? "branch" : "branches"}</span><span><Layers size={15} aria-hidden="true" />{count} {count === 1 ? "listing" : "listings"}</span></div>
          <div className="public-shop-footer">{!count && <span className="public-shop-coming"><PackageOpen size={16} aria-hidden="true" />No products yet</span>}<Link className="public-shop-action" to={shopUrl}>View shop<ArrowUpRight size={17} aria-hidden="true" /></Link></div>
        </div>
      </article>;
    })}</div> : !error && <div className="public-shops-empty"><Store size={40} strokeWidth={1.4} aria-hidden="true" /><h2>{filtered || shops.length ? "No shops match your search." : "Our shop community starts here."}</h2><p>{filtered || shops.length ? "Try another shop name, category or location." : "Published shops will appear here when available."}</p>{(filtered || shops.length > 0) && <button type="button" className="btn-secondary" onClick={() => { stopAutomaticLocationForPage(); setParams({}); }}>Show all shops</button>}</div>}
    {current && state.moreError && <div className="public-shops-error" role="alert"><div><strong>We couldn’t load more shops.</strong><p>{state.moreError}</p></div><button type="button" onClick={loadMore}>Try loading more shops</button></div>}
    {current && state.hasMore && !state.moreError && <div className="public-shops-more"><button type="button" className="btn-secondary" onClick={loadMore} disabled={state.loadingMore || refreshing}>{state.loadingMore ? 'Loading more shops…' : 'Load more shops'}</button></div>}
  </section>;
}
