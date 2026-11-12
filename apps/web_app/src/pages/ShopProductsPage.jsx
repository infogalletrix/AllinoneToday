import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Inbox, MapPin, MessageCircle, PackageOpen, Plus, RefreshCw, ShieldCheck, Store } from "lucide-react";
import ListingCard from "../components/common/ListingCard";
import { request,fetchPublicShop,fetchListings } from "../api/client";
import { isSupportedListing } from "../listingScope";
import {watchPublicCatalogue,publicCatalogueDetailFailure,publicCatalogueUnavailable} from '../publicCatalogueRefresh';
import {useAccount} from '../AccountContext';
import {adminChatDisclosure,enquiryUnavailableReason} from '../catalogueAccess';
import "./ShopProductsPage.css";

export default function ShopProductsPage({ favorites = [], onToggleFavorite, onOpenContact }) {
  const { id } = useParams();
  const [params]=useSearchParams(),{user,loading:accountLoading}=useAccount(),autoOpened=useRef('');
  const [state, setState] = useState({ id, loading: true, shop: null, items: [], error: "", unavailable: false });
  const [categoryFilter, setCategoryFilter] = useState({ shopId: id, category: "" });
  const [ownedManagedShops, setOwnedManagedShops] = useState({ userId: null, ids: [] });
  const alive = useRef(false), inFlight = useRef(false), controller = useRef(null), sequence = useRef(0),pendingRefresh=useRef(false),latestId=useRef(id),retryNeeded=useRef(false);
  useEffect(()=>{latestId.current=id;},[id]);
  const load = useCallback(async function refreshShop() {
    if(!alive.current||latestId.current!==id||document.visibilityState!=='visible')return;
    if (inFlight.current) {pendingRefresh.current=true;return;}
    inFlight.current = true;
    const version = ++sequence.current, abort = new AbortController();
    controller.current = abort;
    setState(previous=>previous.id===id?{...previous,loading:!previous.shop,error:''}:{ id, loading: true, shop: null, items: [], error: "", unavailable: false });
    try {
      const shop = await fetchPublicShop(id,{signal:abort.signal});
      if (!alive.current || sequence.current !== version) return;
      if (!shop) {
        retryNeeded.current=false;
        setState({ id, loading: false, shop: null, items: [], error: "", unavailable: true });
        onOpenContact?.(null);
        return;
      }
      const data = await fetchListings({shop_id:id},{signal:abort.signal});
      if (!alive.current || sequence.current !== version) return;
      if (!Array.isArray(data)) throw Error("Products are temporarily unavailable. Please try again.");
      // Keep the route scoped to this shop even if an upstream response is broader.
      const items = data.filter(item => item.shop_id === id && isSupportedListing(item));
      retryNeeded.current=false;
      setState({ id, loading: false, shop, items, error: "", unavailable: false });
    } catch (error) {
      if (alive.current && sequence.current === version && error.name !== "AbortError") {
        retryNeeded.current=!publicCatalogueUnavailable(error);
        setState(previous=>publicCatalogueDetailFailure(previous.id===id?previous:{id,shop:null,items:[]},error));
        if(publicCatalogueUnavailable(error))onOpenContact?.(null);
      }
    } finally {
      if (sequence.current === version) {inFlight.current = false;if(pendingRefresh.current){pendingRefresh.current=false;queueMicrotask(refreshShop);}}
    }
  }, [id,onOpenContact]);
  useEffect(() => {
    alive.current = true; load();
    const unwatch=watchPublicCatalogue(load,{needsRefresh:()=>retryNeeded.current&&!inFlight.current});
    const hidden=()=>{if(document.visibilityState!=='visible'){sequence.current++;controller.current?.abort();inFlight.current=false;pendingRefresh.current=false;retryNeeded.current=true;}};
    document.addEventListener('visibilitychange',hidden);
    return () => {
      unwatch();alive.current = false; sequence.current += 1; controller.current?.abort(); inFlight.current = false;pendingRefresh.current=false;
      document.removeEventListener('visibilitychange',hidden);
    };
  }, [load]);
  useEffect(() => {
    let current = true;
    const abort = new AbortController();
    setOwnedManagedShops({ userId: null, ids: [] });
    if (user?.role === 'admin') {
      request('/shops/mine', { cache: 'no-store', signal: abort.signal })
        .then(shops => {
          if (!current) return;
          const ids = Array.isArray(shops) ? shops.filter(shop => shop.admin_managed === true && shop.owner_id === user.id).map(shop => shop.id) : [];
          setOwnedManagedShops({ userId: user.id, ids });
        })
        .catch(() => { if (current) setOwnedManagedShops({ userId: user.id, ids: [] }); });
    }
    return () => { current = false; abort.abort(); };
  }, [user?.id, user?.role]);

  const current = state.id === id ? state : { loading: true, shop: null, items: [], error: "", unavailable: false };
  const productCategories = [...new Set(current.items.map(item => item.category).filter(Boolean))].sort();
  const selectedCategory = categoryFilter.shopId === id ? categoryFilter.category : "";
  const shownItems = selectedCategory ? current.items.filter(item => item.category === selectedCategory) : current.items;
  const shopTarget=current.shop?{...current.shop,title:current.shop.name,chat_target:'shop'}:null;
  const administrator=user?.role==='admin';
  const shopOwner=Boolean(user?.id&&user.id===current.shop?.enquiry_recipient_id);
  const catalogueAdministrator=administrator&&user.id===current.shop?.enquiry_recipient_id
    &&ownedManagedShops.userId===user.id&&ownedManagedShops.ids.includes(id);
  const addProductPath='/admin?shop_id='+encodeURIComponent(id)+'&action=add-product';
  const chatUnavailable=shopTarget?enquiryUnavailableReason(shopTarget,user):'This shop is unavailable.';
  const signInPath='/login?next='+encodeURIComponent('/shops/'+id+'?chat=1');
  useEffect(()=>{
    if(!user||administrator||!current.shop||current.loading||current.error||params.get('chat')!=='1'||enquiryUnavailableReason({...current.shop,chat_target:'shop'},user))return;
    const key=user.id+':'+current.shop.id;
    if(autoOpened.current===key)return;
    autoOpened.current=key;
    onOpenContact?.({...current.shop,title:current.shop.name,chat_target:'shop'});
  },[user,administrator,current.shop,current.loading,current.error,params,onOpenContact]);
  useEffect(() => {
    if (current.loading || current.error || !current.shop) return;
    if (categoryFilter.shopId !== id || (categoryFilter.category && !current.items.some(item => item.category === categoryFilter.category))) {
      setCategoryFilter({ shopId: id, category: "" });
    }
  }, [id, current.loading, current.error, current.shop, current.items, categoryFilter]);
  function selectCategory(category) { setCategoryFilter({ shopId: id, category }); }
  return <section className="ait-page shop-products-page">
    <Link className="shop-products-back" to="/shops"><ArrowLeft size={16} aria-hidden="true" />All shops</Link>
    {current.error&&current.shop&&<p className="ait-error" role="alert">We couldn’t refresh this shop. {current.error} Your last loaded products are still shown. <button type="button" className="ait-link" onClick={load}>Try again</button></p>}
    {current.loading ? <><header className="shop-products-heading"><div><p className="ait-eyebrow">Shop products</p><h1>Loading shop…</h1></div></header><div className="shop-products-state" role="status"><Store size={35} strokeWidth={1.4} aria-hidden="true" /><p>Loading products…</p></div></> : current.error&&!current.shop ? <div className="shop-products-state is-error" role="alert"><Store size={35} strokeWidth={1.4} aria-hidden="true" /><h1>We couldn’t load this shop</h1><p>{current.error}</p><button type="button" className="btn-primary" onClick={load}>Try again</button></div> : current.unavailable ? <div className="shop-products-state"><Store size={35} strokeWidth={1.4} aria-hidden="true" /><h1>Shop unavailable</h1><p>This shop is not currently available to the public.</p><Link className="btn-secondary" to="/shops">Explore other shops</Link><button type="button" className="ait-link" onClick={load}>Check again</button></div> : <>
      <header className="shop-products-heading">
        <div><p className="ait-eyebrow">Shop products</p><h1>{current.shop.name}</h1><p className="shop-products-meta"><span>{current.shop.category}</span>{current.shop.location && <span><MapPin size={14} aria-hidden="true" />{current.shop.location}</span>}</p></div>
        <div className="shop-products-actions">
          {catalogueAdministrator && <Link className="btn-primary shop-add-product" to={addProductPath}><Plus size={18} aria-hidden="true" />Add product</Link>}
          {administrator||shopOwner ? <Link className="btn-secondary shop-chat-action" to="/messages"><Inbox size={18} aria-hidden="true" />Open customer messages</Link>
            : accountLoading ? <button className="btn-primary shop-chat-action" disabled><MessageCircle size={18} aria-hidden="true" />Chat with seller</button>
            : chatUnavailable ? <button className="btn-primary shop-chat-action" disabled><MessageCircle size={18} aria-hidden="true" />Chat with seller</button>
            : !user ? <Link className="btn-primary shop-chat-action" to={signInPath}><MessageCircle size={18} aria-hidden="true" />Chat with seller</Link>
            : <button className="btn-primary shop-chat-action" onClick={()=>onOpenContact?.(shopTarget)}><MessageCircle size={18} aria-hidden="true" />Chat with seller</button>}
          <button type="button" className="shop-products-refresh" onClick={load} aria-label="Refresh shop products"><RefreshCw size={16} aria-hidden="true" />Refresh</button>
        </div>
      </header>
      <p className="shop-chat-note"><ShieldCheck size={17}/>{shopOwner?'Your customer chats arrive in Messages. Open your inbox to read and reply.':administrator?'Chats go directly to this shop’s owner. Your own conversations are in Messages.':chatUnavailable||adminChatDisclosure}</p>
      {current.items.length ? <>
        <div className="shop-product-categories" role="group" aria-label="Filter products by category">
          <button type="button" className={!selectedCategory ? "is-active" : ""} aria-pressed={!selectedCategory} onClick={() => selectCategory("")}><span>All categories</span><span className="shop-category-count">{current.items.length}</span></button>
          {productCategories.map(category => <button type="button" key={category} className={selectedCategory === category ? "is-active" : ""} aria-pressed={selectedCategory === category} onClick={() => selectCategory(category)}><span>{category}</span><span className="shop-category-count">{current.items.filter(item => item.category === category).length}</span></button>)}
        </div>
        <p className="shop-products-count" aria-live="polite">{shownItems.length}{selectedCategory ? " of " + current.items.length : ""} {shownItems.length === 1 ? "product" : "products"}{selectedCategory ? " in " + selectedCategory : ""}</p>
        {shownItems.length ? <div className="ait-listing-grid shop-products-grid">{shownItems.map(item => <ListingCard key={item.id} item={item} favorites={favorites} onToggleFavorite={onToggleFavorite} />)}</div> : <div className="shop-products-state"><PackageOpen size={44} strokeWidth={1.35} aria-hidden="true" /><h2>No products in this category</h2><p>Explore the other products available in this shop.</p><button type="button" className="btn-secondary" onClick={() => selectCategory("")}>Show all categories</button></div>}
      </> : <div className="shop-products-state"><PackageOpen size={44} strokeWidth={1.35} aria-hidden="true" /><h2>No products</h2><p>{catalogueAdministrator ? "Add your first product using Add product above. You can choose a different category for each product." : "This shop hasn’t added any products yet. Please check back later."}</p><Link className="btn-secondary" to="/shops">Explore other shops</Link></div>}
    </>}
  </section>;
}
