import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchListings, fetchShopPage, fetchShopDepth, SHOP_PAGE_SIZE } from "../api/client";
import {startPublicCatalogueRefresh,publicCatalogueUnavailable} from '../publicCatalogueRefresh';
import {useSite} from '../SiteContext';
import ListingCard from "../components/common/ListingCard";
import ShopSearchResults from "../components/common/ShopSearchResults";
import LocationInput, { stopAutomaticLocationForPage } from "../components/common/LocationInput";
import { isEmploymentFilter } from '../listingScope';
import {useAccount} from '../AccountContext';
import {useWishlist} from '../WishlistContext';
import './SearchFilters.css';
export default function ListingsPage({ favorites, onToggleFavorite }) {
  const {categories}=useSite();
  const [params, setParams] = useSearchParams(),
    [items, setItems] = useState([]),
    [shops, setShops] = useState([]),
    [shopError, setShopError] = useState(""),
    [shopLoading, setShopLoading] = useState(false),
    [shopPage, setShopPage] = useState({ nextOffset: 0, hasMore: false, loadingMore: false, moreError: '' }),
    [resultsKey, setResultsKey] = useState(null),
    [error, setError] = useState(""),
    [reload,setReload] = useState(0),
    [loading, setLoading] = useState(true);
  const unavailableCategory = isEmploymentFilter(params);
  const {user}=useAccount(),wishlist=useWishlist(),savedOnly=params.get('favorites')==='true';
  const searchKey = params.toString(), latestSearch = useRef(searchKey), shopSequence = useRef(0), moreLock = useRef(false), moreController = useRef(null);
  const loadedShopDepth = useRef(0),primaryShopBusy=useRef(false);
  useEffect(() => { loadedShopDepth.current = shopPage.nextOffset; }, [shopPage.nextOffset]);
  const [categoryDraft, setCategoryDraft] = useState(() => ({ key: searchKey, value: params.get('category') || '' }));
  const selectedCategory = categoryDraft.key === searchKey ? categoryDraft.value : params.get('category') || '';
  useEffect(() => {
    setCategoryDraft(previous => previous.key === searchKey ? previous : { key: searchKey, value: params.get('category') || '' });
  }, [params, searchKey]);
  latestSearch.current = searchKey;
  const resultsReady = savedOnly || resultsKey === searchKey;
  useEffect(() => {
    shopSequence.current++;
    moreController.current?.abort(); moreLock.current = false;
    if(resultsKey!==searchKey){loadedShopDepth.current=0;setShopPage({ nextOffset: 0, hasMore: false, loadingMore: false, moreError: '' });}
    if(savedOnly){setLoading(false);setError('');setShops([]);setShopError('');return;}
    const filters = Object.fromEntries(params);
    const searchShops = !params.get('shop_id')&&!isEmploymentFilter(params);
    setItems(previous => resultsKey === searchKey ? previous : []);
    setShops(previous => resultsKey === searchKey ? previous : []);
    setResultsKey(searchKey);
    const stop=startPublicCatalogueRefresh({
      load:signal=>{
        const version=++shopSequence.current;moreController.current?.abort();moreLock.current=false;
        primaryShopBusy.current=searchShops;
        const current=()=>!signal.aborted&&shopSequence.current===version&&latestSearch.current===searchKey&&document.visibilityState==='visible';
        const listingRequest=fetchListings(filters,{signal}).then(rows=>{
          if(current()){setItems(rows);setError('');setLoading(false);}return rows;
        },failure=>{
          if(current()&&failure.name!=='AbortError'){
            if(publicCatalogueUnavailable(failure)){setItems([]);setError('This shop or its listings are no longer available.');}
            else setError(failure.message);
            setLoading(false);
          }
          throw failure;
        });
        const shopRequest=(searchShops?fetchShopDepth(filters,loadedShopDepth.current,{signal}):Promise.resolve({items:[],nextOffset:0,hasMore:false})).then(page=>{
          if(current()){
            primaryShopBusy.current=false;loadedShopDepth.current=page.nextOffset;setShops(page.items);setShopPage({...page,loadingMore:false,moreError:''});setShopError('');setShopLoading(false);
          }
          return page;
        },failure=>{
          if(current()&&failure.name!=='AbortError'){
            primaryShopBusy.current=false;
            if(publicCatalogueUnavailable(failure)){setShops([]);loadedShopDepth.current=0;setShopPage({nextOffset:0,hasMore:false,loadingMore:false,moreError:''});}
            else setShopPage(previous=>({...previous,loadingMore:false}));
            setShopError(failure.message);setShopLoading(false);
          }
          throw failure;
        });
        return Promise.allSettled([
          listingRequest,shopRequest,
        ]);
      },
      onPending:()=>{setLoading(true);setShopLoading(searchShops);setError('');setShopError('');},
      // Aggregate settlement controls retry; each result above paints independently.
      onData:([listings,shopResult])=>(listings.status==='fulfilled'||publicCatalogueUnavailable(listings.reason))&&(shopResult.status==='fulfilled'||publicCatalogueUnavailable(shopResult.reason)),
      onError:failure=>setError(failure.message),
      onSettled:()=>{primaryShopBusy.current=false;setLoading(false);setShopLoading(false);},
    });
    return () => {
      stop();shopSequence.current++;moreController.current?.abort();moreLock.current=false;primaryShopBusy.current=false;
    };
  }, [params,savedOnly,reload,searchKey]);
  useEffect(()=>{
    const hidden=()=>{
      if(document.visibilityState==='visible')return;
      shopSequence.current++;moreController.current?.abort();moreLock.current=false;primaryShopBusy.current=false;
      setShopPage(previous=>({...previous,loadingMore:false}));
    };
    document.addEventListener('visibilitychange',hidden);
    return()=>document.removeEventListener('visibilitychange',hidden);
  },[]);
  async function loadMoreShops() {
    if (moreLock.current || primaryShopBusy.current || !resultsReady || !shopPage.hasMore||document.visibilityState!=='visible') return;
    const version = shopSequence.current, key = searchKey, abort = new AbortController();
    moreController.current = abort; moreLock.current = true;
    setShopPage(previous => ({ ...previous, loadingMore: true, moreError: '' }));
    try {
      const page = await fetchShopPage({ ...Object.fromEntries(params), limit: SHOP_PAGE_SIZE, offset: shopPage.nextOffset }, { signal: abort.signal });
      if (abort.signal.aborted||document.visibilityState!=='visible'||shopSequence.current !== version || latestSearch.current !== key) return;
      loadedShopDepth.current=page.nextOffset;
      setShops(previous => { const ids = new Set(previous.map(shop => shop.id)); return [...previous, ...page.items.filter(shop => !ids.has(shop.id))]; });
      setShopPage({ ...page, loadingMore: false, moreError: '' });
    } catch (failure) {
      if (document.visibilityState==='visible'&&shopSequence.current === version && latestSearch.current === key && failure.name !== 'AbortError') setShopPage(previous => ({ ...previous, loadingMore: false, moreError: failure.message }));
    } finally {
      if (shopSequence.current === version) moreLock.current = false;
    }
  }
  const searchValue=String(params.get('query')||params.get('q')||'').trim().toLowerCase(),locationValue=String(params.get('location')||'').trim().toLowerCase();
  const shown=savedOnly?wishlist.items.filter(item=>(!searchValue||[item.title,item.description,item.category].some(value=>String(value||'').toLowerCase().includes(searchValue)))&&(!locationValue||String(item.location||'').toLowerCase().includes(locationValue))&&(!params.get('category')||item.category===params.get('category'))).sort((a,b)=>params.get('sort')==='price_low'?Number(a.price)-Number(b.price):params.get('sort')==='price_high'?Number(b.price)-Number(a.price):new Date(b.created_at)-new Date(a.created_at)):items;
  function submit(e) {
    e.preventDefault();
    const data = new FormData(e.target);
    const q = new URLSearchParams(params);
    q.delete('q'); q.delete('offset'); q.delete('limit');
    for (const [k, v] of data) {
      if (String(v).trim()) q.set(k, String(v).trim());
      else q.delete(k);
    }
    if (q.toString() === params.toString()) setReload(previous => previous + 1);
    else setParams(q);
  }
  return (
    <section className="ait-page">
      <p className="ait-eyebrow">EXPLORE YOUR POSSIBILITIES</p>
      <h1>
        {params.get("favorites") === "true"
          ? "Your wishlist"
          : "Find your next great find."}
      </h1>
      {savedOnly&&<p className="ait-lead">Keep the products you love in one place. Your wishlist is saved to your account.</p>}
      <form key={params.toString()} onSubmit={submit} className="ait-search marketplace-search-filters">
        <label className="search-filter-field search-filter-query"><span>What are you looking for?</span><input type="search" name="query" aria-label="Search listings" maxLength={100} placeholder="Shop, product or service" defaultValue={params.get('query') || params.get('q') || ''}/></label>
        <div className="search-filter-field"><span>City or area (optional)</span><LocationInput defaultValue={params.get('location') || ''} cancelPendingOnSubmit placeholder="All areas"/></div>
        <label className="search-filter-field"><span>Category</span><select name="category" aria-label="Category" value={selectedCategory} onChange={event => setCategoryDraft({ key: searchKey, value: event.target.value })}>
          <option value="">All categories</option>
          {selectedCategory && !categories.includes(selectedCategory) && <option value={selectedCategory}>{selectedCategory}</option>}
          {categories.map(c => <option key={c}>{c}</option>)}
        </select></label>
        <label className="search-filter-field"><span>Sort by</span><select name="sort" aria-label="Sort" defaultValue={params.get('sort') || ''}><option value="">Newest first</option><option value="price_low">Price: low to high</option><option value="price_high">Price: high to low</option></select></label>
        <div className="search-filter-actions"><button type="submit" className="btn-primary">Search</button>{Boolean(searchValue || locationValue || params.get('category') || params.get('sort') || params.get('shop_id')) && <button type="button" className="btn-secondary" onClick={() => { stopAutomaticLocationForPage(); setParams(savedOnly ? { favorites: 'true' } : {}); }}>Clear filters</button>}</div>
        <p className="search-filter-hint">Search by shop name or product. Leave location blank for all areas, or add it to narrow results.</p>
      </form>
      {(searchValue || locationValue || params.get('category')) && <p className="search-applied-filters" aria-label="Applied search filters">{[params.get('query') || params.get('q'), params.get('location'), params.get('category')].filter(Boolean).map((value, index) => <span key={index}>{value}</span>)}</p>}
      {!savedOnly && !unavailableCategory && resultsReady && <ShopSearchResults shops={shops} error={shopError} loading={shopLoading} onRetry={()=>setReload(value=>value+1)} hasMore={shopPage.hasMore} loadingMore={shopPage.loadingMore} loadMoreError={shopPage.moreError} onLoadMore={loadMoreShops} />}
      {resultsReady && error && <p className="ait-error" role="alert">{error}<button className="ait-link" type="button" onClick={() => setReload(value => value + 1)}>Try again</button>{shown.length > 0 && <span> Your last loaded listings are shown below.</span>}</p>}
      {loading && shown.length > 0 && <p role="status" className="search-refresh-status">Refreshing listings…</p>}
      {savedOnly&&!user&&!wishlist.loading?<div className="ait-empty"><h2>Save your favourites for later.</h2><p>Log in to add products to your wishlist and find them again on any device.</p><Link className="btn-primary" to="/login?next=%2Flistings%3Ffavorites%3Dtrue">Login to save products</Link><Link className="btn-secondary" to="/listings">Browse products</Link></div>:unavailableCategory ? <div className="ait-empty"><h2>This listing category is unavailable.</h2><p>Browse products and services from local businesses.</p><Link className="btn-primary" to="/listings">Browse listings</Link></div> : (savedOnly&&wishlist.error) ? (
        <p className="ait-error" role="alert">
          {error||wishlist.error}
          <button className="ait-link" type="button" onClick={()=>savedOnly?wishlist.retry():setReload(value=>value+1)}>{savedOnly?'Reload saved products':'Try again'}</button>
        </p>
      ) : (!shown.length&&loading)||!resultsReady||(savedOnly&&wishlist.loading) ? (
        <p role="status">{savedOnly?'Loading your wishlist…':searchValue?'Searching shops and listings…':'Loading listings…'}</p>
      ) : shown.length ? (
        <>
          {shops.length > 0 && <h2>Products and services</h2>}
          <p className="ait-result-count">{shown.length} listing(s)</p>
          <div className="ait-listing-grid">
            {shown.map((i) => (
              <ListingCard
                key={i.id}
                item={i}
                favorites={favorites}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </>
      ) : (!savedOnly && (shops.length > 0 || shopError || error || shopLoading)) ? null : (
        <div className="ait-empty">
          <h2>{savedOnly?'Your wishlist is ready for new finds.':'No listings here yet.'}</h2>
          <p>
            {savedOnly?'Tap the heart on a product to save it here. Try clearing your filters if you have already saved something.':'Try another search, or check back for new shop listings.'}
          </p>
          {savedOnly&&<Link className="btn-primary" to="/listings">Explore products</Link>}
          {savedOnly&&(searchValue||locationValue||params.get('category'))&&<Link className="btn-secondary" to="/listings?favorites=true">Clear filters</Link>}
        </div>
      )}
    </section>
  );
}
