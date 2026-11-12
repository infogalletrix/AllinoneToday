import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, ChevronRight, CircleAlert, CreditCard, ExternalLink, Eye, EyeOff, LayoutDashboard, MapPin, MessageSquare, Package, Pencil, Plus, RefreshCw, Search, ShieldCheck, Store } from "lucide-react";
import { useAccount } from "../AccountContext";
import { request, resolveImageUrl, uploadImage } from "../api/client";
import { isSupportedListing } from '../listingScope';
import {useSite} from '../SiteContext';
import {ListingEditor} from './AdminCatalogueEditors';
import ListingPrice from '../components/common/ListingPrice';
import './AdminDashboard.css';
import './OwnerManagement.css';
import "./BusinessDashboardPage.css";

const sections = [
  { path: "/business", label: "Overview", icon: LayoutDashboard },
  { path: "/business/products", label: "Products", icon: Package },
  { path: "/business/shops", label: "My shops", icon: Store },
  { path: "/business/subscription", label: "Subscription", icon: CreditCard },
  { path: "/business/inquiries", label: "Inquiries", icon: MessageSquare },
];

function canPublish(shop) {
  if(typeof shop?.publication_enabled==='boolean')return shop.publication_enabled;
  if(shop?.subscription_amount_minor && Number(shop.subscription_amount_minor) > 0) {
    return shop?.status === "active" && !shop.moderated_hidden && new Date(shop.subscription?.paid_until).getTime() > Date.now();
  }
  return shop?.status === "active" && !shop.moderated_hidden && (shop.admin_managed===true || new Date(shop.subscription?.paid_until).getTime() > Date.now());
}

function shopStatus(shop) {
  if (shop.moderated_hidden) return { text: "Under review", tone: "muted" };
  if (canPublish(shop)) return { text: "Live", tone: "success" };
  if (shop.status === "pending_payment") return { text: "Payment pending", tone: "warning" };
  return { text: "Inactive", tone: "muted" };
}

function formatDate(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Not confirmed";
}

function amount(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value));
}

function Badge({ tone = "muted", children }) {
  return <span className={`business-badge business-badge--${tone}`}><span />{children}</span>;
}

function EmptyState({ icon: Icon = Store, title, children, action }) {
  return <div className="business-empty"><span className="business-empty-icon"><Icon size={26} /></span><h3>{title}</h3><p>{children}</p>{action}</div>;
}

export default function BusinessDashboardPage() {
  const { user, loading } = useAccount();
  const accountId = user?.id;
  const accountRole = user?.role;
  const { pathname } = useLocation();
  const navigate=useNavigate(),[params,setParams]=useSearchParams(),siteContext=useSite();
  const [productEditing,setProductEditing]=useState(null),[productEpoch,setProductEpoch]=useState(0),[productNotice,setProductNotice]=useState('');
  const [shops, setShops] = useState(null);
  const [catalogue, setCatalogue] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [inquiries, setInquiries] = useState(null);
  const [registrationConfig, setRegistrationConfig] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [search, setSearch] = useState("");
  const [shopFilter, setShopFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const refresh = useCallback(async (signal) => {
    if (!accountId || accountRole !== "merchant") return;
    setFetching(true);
    setError("");
    const results = await Promise.allSettled([
      request("/shops/mine", { signal }),
      request("/seller/catalogue", { signal }),
      request("/seller/metrics", { signal }),
      request("/conversations", { signal }),
      request("/shop-registration/config", { signal }),
    ]);
    if (signal?.aborted) return;
    const setters = [setShops, setCatalogue, setMetrics, setInquiries];
    const labels = ["Shops", "Products", "Statistics", "Inquiries"];
    const errors = [];
    results.slice(0, 4).forEach((result, index) => {
      setters[index](result.status === "fulfilled" ? result.value : null);
      if (result.status === "rejected") errors.push(`${labels[index]}: ${result.reason.message}`);
    });
    setRegistrationConfig(results[4].status === "fulfilled" ? results[4].value : null);
    setError(errors.join(" "));
    setFetching(false);
  }, [accountId, accountRole]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setShops(null);
      setCatalogue(null);
      setMetrics(null);
      setInquiries(null);
      setRegistrationConfig(null);
      setEditing(null);
      setProductEditing(null);setProductNotice('');
      setMessage("");
      refresh(controller.signal);
    });
    return () => controller.abort();
  }, [refresh]);

  async function changeVisibility(item) {
    setBusy(item.id);
    setMessage("");
    try {
      const status=item.status==='active'?'removed':'active';
      await request(`/owner/catalogue/listings/${item.id}/visibility`, { method: "PATCH",body:JSON.stringify({status,contentVersion:item.family_review_version}) });
      setMessage(status==='active'?"Product is now public.":"Product hidden. You can publish it again at any time.");
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  function startProduct(shopId=''){
    setProductEditing({shop_id:shopId});setProductEpoch(previous=>previous+1);setProductNotice('');setMessage('');navigate('/business/products');
  }
  async function saveProduct(value,options={}){
    const id=productEditing?.id;setBusy(id||'new-product');setError('');
    try{
      const saved=await request('/owner/catalogue/listings'+(id?'/'+id:''),{method:id?'PATCH':'POST',body:JSON.stringify(value)});
      if(options.addAnother&&!id){setProductEditing({shop_id:value.shop_id,category:value.category});setProductEpoch(previous=>previous+1);setProductNotice(`${saved.title||value.title} saved. Add your next product.`);}
      else{setProductEditing(null);setProductNotice('');setMessage(value.status==='active'?'Product saved and public when shop access is active.':'Product saved as hidden.');}
      await refresh();
    }catch(error){setError(error.message);}finally{setBusy('');}
  }

  useEffect(()=>{
    if(params.get('new')!=='1'||!shops)return;
    setProductEditing({shop_id:params.get('shop')|| (shops.length===1?shops[0].id:'')});setProductEpoch(previous=>previous+1);
    setParams(previous=>{const next=new URLSearchParams(previous);next.delete('new');next.delete('shop');return next;},{replace:true});
  },[params,shops,setParams]);

  function editShop(shop) {
    setEditing({ id: shop.id, name: shop.name, owner_name: shop.owner_name || user.name || "", shop_type: shop.shop_type || "", location: shop.location, phone: shop.phone, description: shop.description || "", image_path: shop.image_path || "", branch_details: Array.isArray(shop.branch_details) ? shop.branch_details.map((branch) => ({ ...branch })) : [] });
    setPhoto(null);
    setMessage("");
  }

  async function saveShop(event) {
    event.preventDefault();
    setBusy(editing.id);
    setError("");
    try {
      if (photo && (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 8 * 1024 * 1024)) throw new Error("Choose a JPEG, PNG or WebP image under 8 MB.");
      const branches = editing.branch_details.map((branch) => ({ id: branch.id, name: branch.name.trim(), address: branch.address.trim(), phone: branch.phone.trim() }));
      if (new Set(branches.map((branch) => branch.name.toLowerCase())).size !== branches.length) throw new Error("Give every registered branch a different name.");
      const image_path = photo ? await uploadImage(photo) : editing.image_path;
      await request(`/shops/${editing.id}`, { method: "PATCH", body: JSON.stringify({ name: editing.name.trim(), owner_name: editing.owner_name.trim(), ...(editing.shop_type ? { shop_type: editing.shop_type } : {}), location: editing.location.trim(), phone: editing.phone.trim(), description: editing.description.trim(), image_path, ...(branches.length ? { branch_details: branches } : {}) }) });
      setEditing(null);
      setPhoto(null);
      setMessage("Your shop details have been updated.");
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const editField = (name) => ({ value: editing?.[name] || "", onChange: (event) => setEditing((previous) => ({ ...previous, [name]: event.target.value })) });
  const branchField = (index, name) => ({ value: editing?.branch_details[index]?.[name] || "", onChange: (event) => setEditing((previous) => ({ ...previous, branch_details: previous.branch_details.map((branch, position) => position === index ? { ...branch, [name]: event.target.value } : branch) })) });
  const availableShopTypes = Array.isArray(registrationConfig?.shopTypes) ? registrationConfig.shopTypes : [];

  if (loading) return <section className="business-gate"><p role="status">Loading your business account…</p></section>;
  if (!user) return <section className="business-gate"><div className="business-gate-card"><span className="business-empty-icon"><Store size={28} /></span><p className="business-eyebrow">ALL IN ONE TODAY FOR BUSINESS</p><h1>Your business starts here.</h1><p>Sign in with the user ID and temporary password provided by the administrator. Manage your products and reply directly to customers.</p><Link className="btn-primary" to="/account?role=merchant&next=/business">Sign in to your business <ArrowRight size={17} /></Link><Link className="business-text-link" to="/contact">Need shop access? Contact the administrator <ChevronRight size={16} /></Link></div></section>;
  if (user.role !== "merchant") return <section className="business-gate"><div className="business-gate-card"><span className="business-empty-icon"><ShieldCheck size={28} /></span><h1>A workspace for business owners</h1><p>{user.role === "admin" ? "Manage the marketplace from your administrator dashboard." : "You are signed in with a browsing account. Register a separate business-owner account to manage a shop and its subscription."}</p><Link className="btn-primary" to={user.role === "admin" ? "/admin" : "/business/register"}>{user.role === "admin" ? "Open administrator dashboard" : "Register a business"}<ArrowRight size={17} /></Link><Link className="business-text-link" to="/">Back to the marketplace</Link></div></section>;

  const section = sections.find((item) => item.path === pathname);
  const view = section?.label || "Page not found";
  const shopList = shops || [];
  const products = (catalogue || []).filter(isSupportedListing);
  const activeShops = shopList.filter(canPublish);
  const received = (inquiries || []).filter((item) => item.recipient_id === user.id || item.is_buying === false);
  const pendingShops = shopList.filter((shop) => !canPublish(shop));
  const requiresSubscription = (shop) => !shop.admin_managed || Boolean(shop.subscription_amount_minor && Number(shop.subscription_amount_minor) > 0);
  const ownerProvisioned = !shopList.some(requiresSubscription) && (user.user_id || shopList.some(shop => shop.admin_managed));
  const productTarget = "/business/products?new=1"+(shopList.length===1?"&shop="+encodeURIComponent(shopList[0].id):"");
  const filteredProducts = products.filter((item) => (!shopFilter || item.shop_id === shopFilter) && (!statusFilter || item.status === statusFilter) && `${item.title} ${item.category}`.toLowerCase().includes(search.trim().toLowerCase()));
  const shopName = (id) => shopList.find((shop) => shop.id === id)?.name || "Shop unavailable";
  const liveProduct = (item) => item.status === "active" && activeShops.some((shop) => shop.id === item.shop_id);
  const productAction = shopList.length ? <button type="button" className="btn-primary" onClick={()=>startProduct(shopList.length===1?shopList[0].id:"")}><Plus size={17}/>Add product</button> : <Link className="btn-secondary" to="/contact">Request shop access<ArrowRight size={16}/></Link>;
  const productRows = (items) => <div className="business-table-scroll"><table className="business-products-table"><thead><tr><th scope="col">Product</th><th scope="col">Shop</th><th scope="col">Price</th><th scope="col">Status</th><th scope="col"><span className="business-sr-only">Actions</span></th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><div className="business-product-identity"><img src={resolveImageUrl(item.image_path)} alt="" loading="lazy" /><div><strong>{item.title}</strong><small>{item.category}</small></div></div></td><td>{shopName(item.shop_id)}</td><td className="business-price"><ListingPrice item={item}/></td><td><Badge tone={liveProduct(item) ? "success" : item.status === "active" ? "warning" : "muted"}>{liveProduct(item) ? "Live" : item.status === "active" ? "Shop inactive" : item.status === "removed" ? "Hidden" : item.status}</Badge></td><td><div className="business-row-actions">{liveProduct(item) && <Link className="business-icon-button" to={`/listings/${item.id}`} aria-label={`View ${item.title}`} title="View product"><ExternalLink size={16} /></Link>}<button type="button" className="business-icon-button" disabled={!!busy} onClick={()=>{setProductEditing(item);setProductEpoch(previous=>previous+1);setProductNotice("");}} aria-label={`Edit ${item.title}`} title="Edit product"><Pencil size={16}/></button><button type="button" className="business-icon-button" disabled={!!busy} onClick={()=>changeVisibility(item)} aria-label={`${item.status==="active"?"Hide":"Publish"} ${item.title}`} title={item.status==="active"?"Hide product":"Make public"}>{item.status==="active"?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></td></tr>)}</tbody></table></div>;

  return <section className="business-workspace">
    <div className="business-shell">
      <aside className="business-sidebar">
        <Link className="business-workspace-brand" to="/business"><span><Store size={21} /></span><div>Business workspace<small>ALL IN ONE TODAY</small></div></Link>
        <p className="business-nav-label">MANAGE YOUR BUSINESS</p>
        <nav aria-label="Business navigation">{sections.filter(item=>!ownerProvisioned||item.label!=="Subscription").map(({ path, label, icon: Icon }) => <NavLink key={path} to={path} end className={({ isActive }) => `business-nav-item${isActive ? " is-active" : ""}`}><Icon size={19} /><span>{label}</span>{label === "Inquiries" && inquiries && received.length > 0 && <small>{received.length}</small>}</NavLink>)}</nav>
        <div className="business-sidebar-help"><ShieldCheck size={24} /><h3>Your business, in one place.</h3><p>Keep your shop details current so customers can find and contact you.</p><Link to="/support">Get support <ArrowUpRight size={15} /></Link></div>
        <Link className="business-marketplace-link" to="/"><ArrowDownLeft size={17} />Back to marketplace</Link>
        <div className="business-owner"><span>{(user.name || "B").slice(0, 1).toUpperCase()}</span><div><strong>{user.name || "Business owner"}</strong><small>{user.user_id?"User ID: "+user.user_id:"Business owner account"}</small></div></div>
      </aside>

      <div className="business-main">
        <header className="business-page-header"><div><p className="business-eyebrow">SHOP OWNER / {view.toUpperCase()}</p><h1>{view === "Overview" ? "Business overview" : view}</h1><p>{view === "Overview" ? `Welcome back${user.name ? `, ${user.name.split(" ")[0]}` : ""}. Here’s how your business is doing.` : view === "Products" ? "Manage the products and services customers see." : view === "My shops" ? "Keep your storefronts and contact details up to date." : view === "Subscription" ? "Track paid access and manage monthly Razorpay AutoPay." : view === "Inquiries" ? "Read enquiries from customers and reply directly in Messages." : "Choose a page from your business navigation."}</p></div><div className="business-header-actions"><button type="button" className="business-icon-button" disabled={fetching || !!busy} onClick={() => refresh()} aria-label="Refresh business data" title="Refresh data"><RefreshCw size={18} className={fetching ? "business-spinning" : ""} /></button>{view === "My shops" ? <Link className="btn-secondary" to="/contact"><Store size={17}/>Request another shop</Link> : (view === "Overview" || view === "Products") && productAction}</div></header>
        {error && <div className="business-alert business-alert--error" role="alert"><CircleAlert size={20} /><p>{error}</p></div>}
        {message && <div className="business-alert business-alert--success" role="status"><Check size={20} /><p>{message}</p></div>}
        {fetching && !shops && <div className="business-panel business-loading" role="status"><RefreshCw size={23} className="business-spinning" /><p>Loading your business details…</p></div>}
        {shops && pendingShops.length > 0 && <div className="business-alert business-alert--warning"><CircleAlert size={20} /><div><strong>{activeShops.length ? "Some shops need attention" : "Complete activation to start publishing"}</strong><p>{pendingShops.some((shop) => shop.moderated_hidden) ? "A shop is under review. Check its status before publishing." : "Your shop is not currently public. You can prepare hidden products while its access is reviewed."}</p></div><Link to={ownerProvisioned?"/contact":"/business/subscription"}>{ownerProvisioned?"Contact administrator":"Review subscription"} <ArrowRight size={16} /></Link></div>}

        {productEditing&&<div className="business-product-editor admin-dashboard"><ListingEditor key={(productEditing.id||"new")+":"+productEpoch} value={productEditing} categories={siteContext.site.categories} user={user} busy={!!busy} savedProductNotice={productNotice} onCancel={()=>{setProductEditing(null);setProductNotice("");}} onSave={saveProduct}/></div>}

        {section?.path === "/business" && <>
          {shops && !shopList.length && <div className="business-welcome"><div><p className="business-eyebrow">LET’S GET YOUR BUSINESS READY</p><h2>A new home for your shop.</h2><p>Register your shop, review your monthly subscription and start reaching customers on All in One Today.</p><Link className="btn-primary" to="/business/register">Register your first shop <ArrowRight size={17} /></Link></div><Store className="business-welcome-icon" size={114} strokeWidth={1} /></div>}
          <div className="business-stats">{[
            { label: "Registered shops", value: shops ? shopList.length : null, icon: Store, detail: shops ? `${shopList.reduce((total, shop) => total + Number(shop.branches || 0), 0)} branches in total` : "Your business locations", tone: "orange" },
            { label: "Live shops", value: shops ? activeShops.length : null, icon: ShieldCheck, detail: "Published and available to customers", tone: "green" },
            { label: "Live products", value: catalogue && shops ? products.filter(liveProduct).length : null, icon: Package, detail: catalogue ? `${products.length} listings in your catalogue` : "Products in your catalogue", tone: "blue" },
            { label: "Customer enquiries", value: metrics?.enquiries ?? (inquiries ? received.length : null), icon: MessageSquare, detail: "Customers can message you directly", tone: "violet" },
          ].map(({ label, value, icon: Icon, detail, tone }) => <article className="business-stat" key={label}><div><p>{label}</p><span className={`business-stat-icon business-stat-icon--${tone}`}><Icon size={20} /></span></div><strong>{value === null ? "—" : Number(value).toLocaleString("en-IN")}</strong><small>{detail}</small></article>)}</div>
          <div className="business-overview-grid"><section className="business-panel"><div className="business-panel-header"><div><h2>Your shops</h2><p>A quick look at your storefronts.</p></div><Link className="business-text-link" to="/business/shops">View all <ArrowRight size={16} /></Link></div>{shops ? shopList.length ? <div className="business-shop-summary-list">{shopList.slice(0, 3).map((shop) => { const status = shopStatus(shop); return <Link className="business-shop-summary" to="/business/shops" key={shop.id}><span className="business-store-initial">{shop.name.slice(0, 1)}</span><div><h3>{shop.name}</h3><p><MapPin size={13} />{shop.location}</p></div><Badge tone={status.tone}>{status.text}</Badge><ChevronRight size={17} /></Link>; })}</div> : <EmptyState title="Your first shop belongs here">Add your shop details to begin registration.</EmptyState> : !fetching && <p className="business-unavailable">Shop details could not be loaded. Use refresh to try again.</p>}</section>
          <section className="business-panel"><div className="business-panel-header"><div><h2>Your next steps</h2><p>Build your business presence.</p></div></div><div className="business-checklist">{[{ done: shopList.length > 0, title: "Review your shop details", text: "Check your storefront and contact information.", to: "/business/shops" }, { done: activeShops.length > 0, title: "Check shop visibility", text: "Your administrator can publish your storefront.", to: "/business/shops" }, { done: products.some(liveProduct), title: "Publish your first product", text: "Give customers something to discover.", to: shopList.length ? productTarget : "/contact" }].map((step, index) => <Link className="business-checklist-item" to={step.to} key={step.title}><span className={step.done ? "is-done" : ""}>{step.done ? <Check size={15} /> : index + 1}</span><div><strong>{step.title}</strong><p>{step.text}</p></div><ChevronRight size={15} /></Link>)}</div></section></div>
          <section className="business-panel"><div className="business-panel-header"><div><h2>Recent products</h2><p>Your latest catalogue updates.</p></div><Link className="business-text-link" to="/business/products">View catalogue <ArrowRight size={16} /></Link></div>{catalogue ? products.length ? productRows(products.slice(0, 5)) : <EmptyState icon={Package} title="Make your first impression" action={productAction}>Add your first product after your shop is activated.</EmptyState> : !fetching && <p className="business-unavailable">Products could not be loaded. Use refresh to try again.</p>}</section>
        </>}

        {section?.path === "/business/products" && <section className="business-panel"><div className="business-product-filters"><label className="business-search"><Search size={18} /><span className="business-sr-only">Search products</span><input type="search" placeholder="Search products…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label><span className="business-sr-only">Filter by shop</span><select value={shopFilter} onChange={(event) => setShopFilter(event.target.value)}><option value="">All shops</option>{shopList.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label><label><span className="business-sr-only">Filter by listing status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="active">Public products</option><option value="removed">Hidden products</option></select></label></div>{catalogue ? filteredProducts.length ? productRows(filteredProducts) : <EmptyState icon={Package} title={products.length ? "No matching products" : "Your catalogue starts here"} action={!products.length && productAction}>{products.length ? "Try a different search or shop filter." : "Add products, set their categories and prices, and choose whether to show them publicly."}</EmptyState> : !fetching && <p className="business-unavailable">Products could not be loaded. Use refresh to try again.</p>}<div className="business-panel-footnote">{catalogue ? `${filteredProducts.length} of ${products.length} products` : "Products unavailable"}<span>Public products need an active shop. Hidden products stay private.</span></div></section>}

        {section?.path === "/business/shops" && <>
          {editing && <section className="business-panel business-shop-editor">
            <div className="business-panel-header"><div><h2>Edit shop details</h2><p>Update the information customers use to reach you.</p></div><button type="button" className="business-text-link" disabled={!!busy} onClick={() => setEditing(null)}>Close</button></div>
            <form className="business-edit-form" onSubmit={saveShop}>
              <div className="business-form-grid">
                <label>Shop name<input autoFocus required minLength={2} maxLength={120} {...editField("name")} /></label>
                <label>Owner’s full name<input required autoComplete="name" minLength={2} maxLength={100} {...editField("owner_name")} /></label>
                <label>Shop type<select required={availableShopTypes.length > 0} disabled={!availableShopTypes.length} {...editField("shop_type")}><option value="">Choose shop type</option>{editing.shop_type && !availableShopTypes.includes(editing.shop_type) && <option value={editing.shop_type}>{editing.shop_type}</option>}{availableShopTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select>{!availableShopTypes.length && <small>Shop types are unavailable. Your existing type will be kept.</small>}</label>
                <label>City / location<input required minLength={2} maxLength={180} {...editField("location")} /></label>
                <label>Shop phone<input type="tel" required minLength={7} maxLength={30} {...editField("phone")} /></label>
                <label>Replace shop image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] || null)} /><small>JPEG, PNG or WebP, up to 8 MB.</small></label>
              </div>
              <label>About your shop<textarea aria-label="About your shop" rows={4} maxLength={2000} {...editField("description")} /></label>
              {editing.branch_details.length > 0 && <fieldset className="business-branch-editor"><legend>Registered branches</legend><p>Update each branch’s contact details. Your registered branch count stays the same.</p><div className="business-branch-editor-list">{editing.branch_details.map((branch, index) => <fieldset className="business-branch-fields" key={branch.id}><legend><MapPin size={14} />Branch {index + 1}</legend><div className="business-form-grid"><label>Branch {index + 1} name<input required minLength={2} maxLength={120} {...branchField(index, "name")} /></label><label>Branch {index + 1} phone<input required type="tel" minLength={7} maxLength={30} {...branchField(index, "phone")} /></label></div><label>Branch {index + 1} address<textarea aria-label={`Branch ${index + 1} address`} required minLength={5} maxLength={300} rows={2} {...branchField(index, "address")} /></label></fieldset>)}</div></fieldset>}
              <div className="business-form-actions"><button className="btn-primary" disabled={!!busy}>{busy === editing.id ? "Saving…" : "Save changes"}</button><button type="button" className="btn-secondary" disabled={!!busy} onClick={() => setEditing(null)}>Cancel</button></div>
            </form>
          </section>}
          {shops ? shopList.length ? <div className="business-shop-grid">{shopList.map((shop) => { const status = shopStatus(shop); return <article className="business-panel business-shop-card" key={shop.id}><div className="business-shop-card-top">{shop.image_path ? <img src={resolveImageUrl(shop.image_path)} alt="" /> : <span className="business-shop-card-symbol"><Store size={29} /></span>}<Badge tone={status.tone}>{status.text}</Badge></div><p className="business-eyebrow">{shop.category} · {shop.branches} {Number(shop.branches) === 1 ? "BRANCH" : "BRANCHES"}</p><h2>{shop.name}</h2><p className="business-shop-location"><MapPin size={15} />{shop.location}</p><p className="business-shop-description">{shop.description || "Add a description to introduce your business to customers."}</p><dl className="business-shop-details"><div><dt>Contact</dt><dd>{shop.phone}</dd></div><div><dt>{!requiresSubscription(shop)?"Access":"Paid through"}</dt><dd>{!requiresSubscription(shop)?"Provided by administrator":formatDate(shop.subscription?.paid_until)}</dd></div></dl><div className="business-shop-card-actions"><button type="button" className="btn-secondary" onClick={() => editShop(shop)}><Pencil size={15} />Edit details</button>{canPublish(shop) ? <Link className="business-text-link" to={`/business/products?new=1&shop=${shop.id}`}>Add product <Plus size={15} /></Link> : <Link className="business-text-link" to="/business/subscription">Review subscription <ArrowRight size={15} /></Link>}</div></article>; })}</div> : <section className="business-panel"><EmptyState title="Let’s introduce your business" action={<Link className="btn-primary" to="/business/register"><Plus size={17} />Register your first shop</Link>}>Tell us your shop name, category, location and contact details.</EmptyState></section> : !fetching && <p className="business-unavailable">Shop details could not be loaded. Use refresh to try again.</p>}
        </>}

        {section?.path === "/business/subscription" && ownerProvisioned && <section className="business-panel"><EmptyState icon={ShieldCheck} title="Your shop access is managed by the administrator" action={<Link className="btn-secondary" to="/business/shops">View your shops</Link>}>Manage your products and customer conversations from your workspace.</EmptyState></section>}
        {section?.path === "/business/subscription" && !ownerProvisioned && <>
          <div className="business-subscription-note"><ShieldCheck size={25} /><div><h2>Monthly access, securely managed.</h2><p>Review your shop’s exact monthly price and authorize Razorpay AutoPay. Paid access appears here after the payment is confirmed.</p></div><Link className="btn-secondary" to="/merchant">Manage AutoPay <ArrowUpRight size={16} /></Link></div>
          {shops ? shopList.length ? <div className="business-shop-grid">{shopList.filter(requiresSubscription).map((shop) => { const subscription = shop.subscription; const status = shopStatus(shop); return <section className="business-panel business-subscription-card" key={shop.id}><div className="business-subscription-card-heading"><span className="business-empty-icon"><CreditCard size={22} /></span><Badge tone={status.tone}>{status.text}</Badge></div><h2>{shop.name}</h2><p>{shop.category} · {shop.branches} {Number(shop.branches) === 1 ? "branch" : "branches"}</p><div className="business-subscription-price">{subscription?.amount_minor ? <><strong>{amount(subscription.amount_minor / 100)}</strong><span> / {subscription.period || "month"}</span></> : shop.subscription_amount_minor ? <><strong>{amount(shop.subscription_amount_minor / 100)}</strong><span> / month</span></> : <strong>Review your monthly quote</strong>}</div><dl className="business-shop-details"><div><dt>Paid access through</dt><dd>{formatDate(subscription?.paid_until)}</dd></div><div><dt>AutoPay status</dt><dd>{subscription?.status ? subscription.status.replaceAll("_", " ") : "Not set up"}</dd></div><div><dt>Publishing access</dt><dd>{canPublish(shop) ? "Enabled" : "Not active"}</dd></div></dl>{subscription?.status === "cancelled" && <p className="business-subscription-explanation">Future AutoPay renewals are cancelled. Confirmed paid access continues until the paid-through date.</p>}<Link className={canPublish(shop) ? "btn-secondary" : "btn-primary"} to={`/merchant?shop=${shop.id}`}>{canPublish(shop) ? "Manage subscription" : "Continue activation"}<ArrowRight size={16} /></Link></section>; })}</div> : <section className="business-panel"><EmptyState icon={CreditCard} title="Register a shop to get started" action={<Link className="btn-primary" to="/business/register">Register your shop <ArrowRight size={17} /></Link>}>Your shop details determine its monthly subscription. You can review the exact amount before authorizing AutoPay.</EmptyState></section> : !fetching && <p className="business-unavailable">Subscriptions could not be loaded. Use refresh to try again.</p>}
        </>}

        {section?.path === "/business/inquiries" && <section className="business-panel"><div className="business-panel-header"><div><h2>Customer enquiries</h2><p>Product and shop conversations arrive here. Open a conversation to reply to the customer.</p></div><Link className="btn-secondary" to="/messages">Open inbox <ArrowUpRight size={16} /></Link></div>{inquiries ? received.length ? <div className="business-inquiry-list">{received.map((item) => <Link className="business-inquiry" key={item.id} to={"/messages?conversation="+encodeURIComponent(item.id)}><span className="business-inquiry-avatar">{(item.sender_name || "C").slice(0, 1)}</span><div><h3>{item.sender_name || "Customer"}<small>{formatDate(item.created_at)}</small></h3><strong>{item.item_tag || shopName(item.shop_id)}</strong><p>{item.message}</p></div><ChevronRight size={18} /></Link>)}</div> : <EmptyState icon={MessageSquare} title="No customer enquiries yet">Customers can message you from your public shop or product pages.</EmptyState> : !fetching && <p className="business-unavailable">Inquiries could not be loaded. Use refresh to try again.</p>}</section>}
        {!section && <section className="business-panel"><EmptyState icon={LayoutDashboard} title="This business page could not be found" action={<Link className="btn-primary" to="/business">Go to overview</Link>}>Use your business navigation to continue.</EmptyState></section>}
        <p className="business-workspace-footer"><ShieldCheck size={14} />Your public products appear while your shop is active. You control which products stay hidden.</p>
      </div>
    </div>
  </section>;
}
