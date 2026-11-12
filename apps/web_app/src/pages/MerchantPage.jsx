import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Building2, Check, ChevronLeft, CreditCard, ImagePlus, LockKeyhole, MapPin, RefreshCw, ShieldCheck, Store } from "lucide-react";
import { useAccount } from "../AccountContext";
import { post, request, resolveImageUrl, uploadImage } from "../api/client";
import { useSite } from "../SiteContext";
import "./MerchantRegistration.css";

let checkoutSdk;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (!checkoutSdk) {
    checkoutSdk = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (error) { script.remove(); reject(error); } else resolve();
      };
      const timer = window.setTimeout(() => finish(new Error("Secure checkout took too long to load. Please try again.")), 15000);
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => finish(window.Razorpay ? null : new Error("Secure checkout could not start. Please try again."));
      script.onerror = () => finish(new Error("Could not load secure checkout. Check your connection and try again."));
      document.head.appendChild(script);
    }).catch((error) => { checkoutSdk = null; throw error; });
  }
  return checkoutSdk;
}

const money = (minor) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: Number(minor) % 100 ? 2 : 0 }).format(Number(minor) / 100);
const paidPeriod = (shop) => new Date(shop?.subscription?.paid_until || 0).getTime() > Date.now();
const paidShop = (shop) => shop?.status === "active" && !shop.moderated_hidden && paidPeriod(shop);
const quoteKey = (shop, quote) => quote && !quote.requiresReview ? `${shop.id}:${quote.amountMinor}:${quote.period}:${quote.version || ""}` : "";
const pendingKey = (id) => `ait-shop-payment-pending:${id}`;
function rememberPayment(id, pending) {
  try { if (pending) sessionStorage.setItem(pendingKey(id), "1"); else sessionStorage.removeItem(pendingKey(id)); } catch { /* Status still comes from the server when storage is unavailable. */ }
}
function hasPendingPayment(shop) {
  if (paidPeriod(shop) || ["cancelled", "completed", "expired", "failed"].includes(shop.subscription?.status)) {
    rememberPayment(shop.id, false);
    return false;
  }
  try { if (sessionStorage.getItem(pendingKey(shop.id))) return true; } catch { /* Browser storage is optional. */ }
  return ["authenticated", "active"].includes(shop.subscription?.status) && !paidPeriod(shop);
}
function checkPhoto(file) {
  if (file && (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024)) throw new Error("Choose a JPEG, PNG or WebP image up to 8 MB.");
}
const emptyForm = {
  owner_name: "", name: "", shop_type: "", category: "", phone: "", location: "", description: "",
  branches: 1, size: "small", expected_photos: 100,
  branch_details: [{ name: "Main branch", address: "", phone: "" }],
};

function QuoteSummary({ quote, loading, error }) {
  return <div className="br-quote" aria-live="polite">
    <span className="br-overline">YOUR MONTHLY SUBSCRIPTION</span>
    {loading ? <p>Calculating your exact monthly price…</p> : error ? <p className="br-quote-error">{error}</p> : quote?.requiresReview ? <p>{quote.message}</p> : quote ? <>
      <p className="br-price">{money(quote.amountMinor)}<span> / {quote.period === "month" ? "month" : quote.period}</span></p>
      <dl className="br-price-breakdown">
        {Number.isFinite(quote.baseAmountMinor) && <div><dt>Shop subscription</dt><dd>{money(quote.baseAmountMinor)}</dd></div>}
        {Number.isFinite(quote.additionalBranchAmountMinor) && <div><dt>Additional branches</dt><dd>{money(quote.additionalBranchAmountMinor)}</dd></div>}
        <div className="br-total"><dt>Recurring total</dt><dd>{money(quote.amountMinor)}</dd></div>
      </dl>
      <p className="br-small">This is the subscription amount requested by the website. The operator is not GST-registered; no separate GST, platform or convenience fee is added at checkout. Check the amount and billing period in your mandate before approving it.</p>
      {quote.reason && <p className="br-small">{quote.reason}</p>}
    </> : <p>Choose your category, shop size and branches to see the exact price.</p>}
  </div>;
}

function ShopEditor({ shop, busy, onSave, onClose }) {
  const [values, setValues] = useState({ name: shop.name, location: shop.location, phone: shop.phone, description: shop.description || "", image_path: shop.image_path || "" });
  const [file, setFile] = useState(null);
  const field = (key) => ({ value: values[key], onChange: (event) => setValues((previous) => ({ ...previous, [key]: event.target.value })) });
  return <form className="ait-form br-editor" onSubmit={(event) => { event.preventDefault(); onSave(shop, values, file); }}>
    <h3>Edit shop details</h3>
    <div className="ait-form-grid">
      <label>Shop name<input required minLength={2} maxLength={120} {...field("name")} /></label>
      <label>City / location<input required minLength={2} maxLength={180} {...field("location")} /></label>
      <label>Shop phone<input type="tel" required minLength={7} maxLength={30} {...field("phone")} /></label>
      <label>Replace shop photo <span className="br-optional">Optional · maximum 8 MB</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
    </div>
    <label>About your shop<textarea rows={3} maxLength={2000} {...field("description")} /></label>
    <div className="br-actions"><button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button></div>
  </form>;
}

export default function MerchantPage() {
  const { user, loading } = useAccount();
  const { categories } = useSite();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const requestedShopId = searchParams.get("shop") || "";
  const [shops, setShops] = useState([]);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [shopsError, setShopsError] = useState("");
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState("");
  const [pricing, setPricing] = useState(null);
  const [pricingError, setPricingError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [selectedQuoteError, setSelectedQuoteError] = useState("");
  const [selectedQuoteLoading, setSelectedQuoteLoading] = useState(false);
  const [consent, setConsent] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [pendingIds, setPendingIds] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [cancelId, setCancelId] = useState("");
  const checkoutLock = useRef(false);
  const selected = shops.find((shop) => shop.id === selectedId);
  const pendingShop = shops.find((shop) => shop.status === "pending_payment");
  const awaitingPayment = selected && (pendingIds.includes(selected.id) || hasPendingPayment(selected));
  const canRegister = user?.role === "merchant";
  const showingForm = canRegister && !shopsLoading && !shopsError && !selected && (!shops.length || showNewForm);
  const currentStep = !canRegister ? 0 : selected ? paidShop(selected) ? 3 : 2 : showingForm ? 1 : shops.some(paidShop) ? 3 : 1;

  async function loadConfiguration() {
    const results = await Promise.allSettled([request("/shop-registration/config"), request("/billing/pricing")]);
    if (results[0].status === "fulfilled") { setConfig(results[0].value); setConfigError(""); } else setConfigError(results[0].reason.message);
    if (results[1].status === "fulfilled") { setPricing(results[1].value); setPricingError(""); } else { setPricing(null); setPricingError(results[1].reason.message); }
  }
  async function refresh({ redirectShopId = "" } = {}) {
    const data = await request("/shops/mine");
    setShops(data); setShopsError("");
    setPendingIds(data.filter((shop) => !paidShop(shop) && hasPendingPayment(shop)).map((shop) => shop.id));
    data.filter(paidShop).forEach((shop) => rememberPayment(shop.id, false));
    if (redirectShopId && data.some((shop) => shop.id === redirectShopId && paidShop(shop))) navigate("/business", { replace: true });
    return data;
  }
  useEffect(() => { loadConfiguration(); }, []);
  useEffect(() => {
    setShops([]); setSelectedId(""); setConsent(""); setPendingIds([]); setEditingId(""); setShowNewForm(false);
    if (!canRegister) { setShopsLoading(false); return; }
    let live = true;
    setShopsLoading(true); setShopsError("");
    request("/shops/mine").then((data) => {
      if (!live) return;
      setShops(data);
      const resume = data.find((shop) => shop.id === requestedShopId) || data.find((shop) => shop.status === "pending_payment");
      setSelectedId(resume?.id || "");
      setShowNewForm(!resume && pathname === "/business/register" && data.length > 0);
      setPendingIds(data.filter((shop) => !paidShop(shop) && hasPendingPayment(shop)).map((shop) => shop.id));
      data.filter(paidShop).forEach((shop) => rememberPayment(shop.id, false));
    }).catch((failure) => { if (live) setShopsError(failure.message); }).finally(() => { if (live) setShopsLoading(false); });
    return () => { live = false; };
  }, [user?.id, canRegister, requestedShopId, pathname]);
  const categoryOptionsKey = categories.join("|");
  useEffect(() => {
    setForm((previous) => ({ ...previous, owner_name: previous.owner_name || user?.name || "", phone: previous.phone || user?.phone || "", shop_type: previous.shop_type || config?.shopTypes?.[0] || "", category: categories.includes(previous.category) ? previous.category : categories[0] || "" }));
  }, [user?.name, user?.phone, config, categoryOptionsKey]);
  useEffect(() => {
    if (!file) { setPhotoPreview(""); return; }
    const url = URL.createObjectURL(file); setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    let live = true;
    setQuote(null); setQuoteError("");
    if (!form.category || form.branches < 1 || form.branches > 100 || form.expected_photos < 1) { setQuoteLoading(false); return; }
    setQuoteLoading(true);
    const timer = window.setTimeout(() => {
      post("/billing/quote", { category: form.category, branches: form.branches, size: form.size, expected_photos: form.expected_photos })
        .then((data) => { if (live) setQuote(data); }).catch((failure) => { if (live) setQuoteError(failure.message); }).finally(() => { if (live) setQuoteLoading(false); });
    }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [form.category, form.branches, form.size, form.expected_photos]);
  useEffect(() => {
    let live = true;
    setSelectedQuote(null); setSelectedQuoteError(""); setConsent("");
    if (!selectedId) { setSelectedQuoteLoading(false); return; }
    setSelectedQuoteLoading(true);
    request(`/shops/${selectedId}/quote`).then((data) => { if (live) setSelectedQuote(data); }).catch((failure) => { if (live) setSelectedQuoteError(failure.message); }).finally(() => { if (live) setSelectedQuoteLoading(false); });
    return () => { live = false; };
  }, [selectedId]);

  const field = (key) => ({ value: form[key], onChange: (event) => {
    const value = ["branches", "expected_photos"].includes(key) ? Number(event.target.value) : event.target.value;
    setForm((previous) => {
      const next = { ...previous, [key]: value };
      if (key === "branches") next.branch_details = Array.from({ length: Math.max(1, Math.min(100, Math.trunc(value) || 1)) }, (_, index) => previous.branch_details[index] || { name: `Branch ${index + 1}`, address: "", phone: "" });
      return next;
    });
  } });
  function branchField(index, key) {
    return { value: form.branch_details[index][key], onChange: (event) => setForm((previous) => ({ ...previous, branch_details: previous.branch_details.map((branch, position) => position === index ? { ...branch, [key]: event.target.value } : branch) })) };
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || !canRegister) return;
    setError(""); setMessage(""); setBusy(true);
    try {
      if (!categories.includes(form.category)) throw new Error("Choose a supported product or service category.");
      if (new Set(form.branch_details.map((branch) => branch.name.trim().toLowerCase())).size !== form.branches) throw new Error("Give every branch a different name.");
      checkPhoto(file);
      const image_path = file ? await uploadImage(file) : "";
      const shop = await post("/shops", { ...form, image_path });
      setShops((previous) => [shop, ...previous]); setSelectedId(shop.id); setShowNewForm(false); setFile(null);
      setMessage("Your shop details are saved. Review your monthly subscription below before authorizing AutoPay.");
      setForm({ ...emptyForm, owner_name: user.name || "", phone: user.phone || "", category: categories[0] || "", shop_type: config?.shopTypes?.[0] || "" });
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  async function refreshStatus() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const data = await refresh({ redirectShopId: selected && awaitingPayment ? selected.id : "" });
      if (!selectedId && !showNewForm) setSelectedId(data.find((shop) => shop.status === "pending_payment")?.id || "");
      await loadConfiguration();
      if (selectedId) {
        const latestQuote = await request(`/shops/${selectedId}/quote`);
        if (quoteKey(selected, latestQuote) !== quoteKey(selected, selectedQuote)) setConsent("");
        setSelectedQuote(latestQuote); setSelectedQuoteError("");
      }
      setMessage("Shop and subscription status refreshed.");
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  async function checkout() {
    if (busy || checkoutLock.current || !selected || !pricing?.checkoutEnabled || awaitingPayment || !consent || consent !== quoteKey(selected, selectedQuote)) return;
    const shop = selected;
    checkoutLock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const offer = await request(`/shops/${shop.id}/quote`);
      setSelectedQuote(offer);
      if (offer.requiresReview) { setConsent(""); throw new Error(offer.message); }
      if (quoteKey(shop, offer) !== consent) { setConsent(""); throw new Error("Your monthly quote changed. Review the updated amount and authorize it again."); }
      await loadRazorpay();
      const details = await post("/billing/checkout", { shopId: shop.id, acceptedAmountMinor: offer.amountMinor });
      if (details.amountMinor !== offer.amountMinor || details.period !== offer.period) { setConsent(""); throw new Error("Your subscription changed. Refresh the quote and review it before continuing."); }
      if (details.paymentMode === "test") setPricing((previous) => ({ ...previous, paymentMode: "test" }));
      let receivedPayment = false;
      const release = () => { checkoutLock.current = false; setBusy(false); };
      const razorpay = new window.Razorpay({
        key: details.key, subscription_id: details.subscriptionId, name: details.name, description: details.description,
        prefill: details.prefill, theme: { color: "#F95738" }, retry: { enabled: false },
        handler: async (response) => {
          receivedPayment = true;
          rememberPayment(shop.id, true); setPendingIds((previous) => [...new Set([...previous, shop.id])]); setConsent("");
          setMessage("Payment response received. Confirming your subscription…");
          try {
            const verified = await post("/billing/verify", { requestId: details.requestId, paymentId: response.razorpay_payment_id, subscriptionId: response.razorpay_subscription_id, signature: response.razorpay_signature });
            setMessage(verified.message);
            await refresh({ redirectShopId: verified.verified ? shop.id : "" });
          } catch (failure) { setError(failure.message); setMessage("Payment confirmation is pending. Refresh status shortly; do not pay again."); }
          finally { release(); }
        },
        modal: { ondismiss: () => { if (!receivedPayment) { release(); setMessage("Checkout closed. Your shop details are saved. You can continue when you are ready."); } } },
      });
      razorpay.on("payment.failed", (response) => {
        setError(response.error?.description || "Payment was unsuccessful. Refresh status before trying again.");
        try { razorpay.close(); } finally { release(); }
      });
      razorpay.open();
    } catch (failure) { setError(failure.message); checkoutLock.current = false; setBusy(false); }
  }
  async function saveShop(shop, values, photo) {
    setBusy(true); setError("");
    try {
      checkPhoto(photo);
      const image_path = photo ? await uploadImage(photo) : values.image_path;
      await request(`/shops/${shop.id}`, { method: "PATCH", body: JSON.stringify({ ...values, image_path }) });
      await refresh(); setEditingId(""); setMessage("Your shop details have been updated.");
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  async function cancelSubscription(subscription) {
    setBusy(true); setError("");
    try { const result = await post("/billing/cancel", { requestId: subscription.id }); setMessage(result.message); await refresh(); setCancelId(""); }
    catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  function selectShop(shop) { setSelectedId(shop.id); setShowNewForm(false); setMessage(""); setError(""); }

  return <section className="ait-page ait-business-registration">
    <div className="br-topline"><Link to="/" className="br-back"><ChevronLeft size={16} /> Back to AllInOneToday.com</Link>{shops.some(paidShop) && <Link className="br-dashboard-link" to="/business">Business dashboard <ArrowRight size={16} /></Link>}</div>
    <header className="br-header"><span className="br-label"><Store size={15} /> ALL IN ONE TODAY · FOR BUSINESS</span><h1>Give your business<br /><span>a place to grow.</span></h1><p>Register your shop, set up your monthly subscription, and manage your products and branches from your own business dashboard.</p></header>
    <ol className="br-steps" aria-label="Business registration progress">{["Owner account", "Shop details", "Monthly subscription", "Your dashboard"].map((label, index) => <li key={label} className={index < currentStep ? "is-complete" : index === currentStep ? "is-current" : ""} aria-current={index === currentStep ? "step" : undefined}><span>{index < currentStep ? <Check size={15} /> : index + 1}</span><strong>{label}</strong></li>)}</ol>
    {error && <p role="alert" className="ait-error">{error}</p>}{message && <p role="status" className="ait-notice">{message}</p>}
    {pricing?.paymentMode === "test" && <p className="ait-notice br-test" role="status">Test payment mode: this environment uses Razorpay test payments. No real money is collected.</p>}
    {loading ? <div className="br-card" role="status">Loading your account…</div> : !user ? <div className="br-layout">
      <article className="br-card br-account-card"><div className="br-icon"><Store size={27} /></div><span className="br-overline">STEP 01 · YOUR ACCOUNT</span><h2>Start with a business-owner account</h2><p>Your shops, products and branches stay together in one private website dashboard. Customer enquiries about your shops and products arrive directly in your Messages inbox.</p><Link className="btn-primary" to="/account?register=1&role=merchant&next=/business/register">Create business account <ArrowRight size={17} /></Link><p className="br-small">Already registered? <Link to="/account?role=merchant&next=/business/register">Sign in to continue</Link></p></article>
      <aside className="br-benefits"><h3>Built for your local business.</h3><p><Building2 size={20} /> One place for all your shop branches</p><p><Store size={20} /> Add products and manage listings</p><p><CreditCard size={20} /> A clear monthly subscription</p><p><ShieldCheck size={20} /> {pricing?.checkoutEnabled ? 'AutoPay through Razorpay' : 'Online payments are currently unavailable'}</p></aside>
    </div> : !canRegister ? <div className="br-card"><h2>A business-owner account is required</h2>{user.role === "admin" ? <><p>Use your product-owner controls to manage the platform.</p><Link className="btn-primary" to="/admin">Open platform controls</Link></> : <><p>You are signed in with a browsing account. Sign out from your account and register a business-owner account to continue.</p><Link className="btn-secondary" to="/account?register=1&role=merchant&next=/business/register">Open account</Link></>}</div> : shopsLoading ? <div className="br-card" role="status">Loading your shop registration…</div> : shopsError ? <div className="br-card"><p role="alert">{shopsError}</p><button className="btn-secondary" onClick={refreshStatus} disabled={busy}><RefreshCw size={16} /> Retry loading shops</button></div> : <>
      {selected && <div className="br-layout br-payment-layout">
        <article className="br-card br-payment-card">
          <span className="br-overline">STEP 03 · MONTHLY SUBSCRIPTION</span><div className="br-shop-heading">{selected.image_path ? <img src={resolveImageUrl(selected.image_path)} alt="" /> : <div className="br-icon"><Store size={25} /></div>}<div><h2>{selected.name}</h2><p><MapPin size={14} /> {selected.location} · {selected.branches} {selected.branches === 1 ? "branch" : "branches"}</p></div></div>
          {paidPeriod(selected) ? <div className="br-success"><ShieldCheck size={24} /><h3>{paidShop(selected) ? "Your subscription is active" : "Your subscription has a paid period"}</h3><p>{paidShop(selected) ? "Manage your shop and add products from your website business dashboard. Customer enquiries arrive directly in your Messages inbox." : "Your shop is currently unavailable. Contact support to review its status; another payment is not needed for the paid period."}</p>{paidShop(selected) && <Link className="btn-primary" to="/business">Open business dashboard <ArrowRight size={17} /></Link>}</div> : <>
            <h3>Your details are saved. One more step.</h3><p>Authorize your monthly subscription to publish your shop and unlock product management.</p><QuoteSummary quote={selectedQuote} loading={selectedQuoteLoading} error={selectedQuoteError} />
            {awaitingPayment ? <div className="ait-notice"><strong>Awaiting payment confirmation</strong><p>We are waiting for the payment provider to confirm your subscription. Refresh status shortly; do not pay again.</p></div> : !pricing?.checkoutEnabled ? <div className="ait-notice"><strong>Online subscriptions are currently unavailable</strong><p>Your shop registration is saved. You can return here to set up AutoPay when subscriptions open.</p>{pricingError && <p>{pricingError}</p>}</div> : selectedQuote && !selectedQuote.requiresReview && <>
              <label className="br-consent"><input type="checkbox" checked={consent === quoteKey(selected, selectedQuote)} disabled={busy} onChange={(event) => setConsent(event.target.checked ? quoteKey(selected, selectedQuote) : "")} /><span>I authorize a recurring charge of <strong>{money(selectedQuote.amountMinor)} every {selectedQuote.period}</strong> for {selected.name}. AutoPay renews until canceled or the mandate ends. I will review the mandate in Razorpay before approving.</span></label>
              <p className="br-small">By subscribing, I agree to the <Link to="/terms">terms</Link> and acknowledge the <Link to="/privacy">privacy notice</Link>, <Link to="/refunds">cancellation and refund policy</Link> and <Link to="/delivery">service delivery policy</Link>.</p>
              <button className="btn-primary br-pay-button" disabled={busy || !consent || consent !== quoteKey(selected, selectedQuote)} onClick={checkout}><LockKeyhole size={17} />{busy ? "Please wait…" : `Set up ${pricing.paymentMode === "test" ? "test " : ""}AutoPay with Razorpay`}</button><p className="br-small">You can cancel future renewals from this page. Your business dashboard opens after the server confirms your paid subscription.</p>
            </>}
          </>}
          <div className="br-actions"><button className="btn-secondary" onClick={refreshStatus} disabled={busy}><RefreshCw size={15} /> Refresh status</button><button className="br-text-button" disabled={busy} onClick={() => setEditingId(editingId === selected.id ? "" : selected.id)}>Edit shop details</button>{!pendingShop && <button className="br-text-button" disabled={busy} onClick={() => setSelectedId("")}>View all shops</button>}</div>
          {editingId === selected.id && <ShopEditor key={selected.id} shop={selected} busy={busy} onSave={saveShop} onClose={() => setEditingId("")} />}
        </article><aside className="br-benefits"><div className="br-icon"><ShieldCheck size={25} /></div><h3>Everything ready for your shop.</h3><p><Check size={18} /> Your own business dashboard</p><p><Check size={18} /> Products and listing management</p><p><Check size={18} /> Registered shops and branches</p><p><Check size={18} /> Administrator handles new enquiries</p><hr /><p className="br-small">Subscriptions cover your shop presence on AllInOneToday.com. Buyers arrange purchases directly with your business.</p></aside>
      </div>}
      {showingForm && <div className="br-layout">
        <form className="br-card ait-form br-registration-form" onSubmit={submit}>
          <div className="br-section-title"><span className="br-overline">STEP 02 · YOUR BUSINESS</span><h2>Tell us about your shop</h2><p>These details help customers find and contact your business.</p></div>
          {configError && <div className="ait-error" role="alert">Shop registration options could not load: {configError}<button type="button" className="br-text-button" onClick={loadConfiguration}>Try again</button></div>}
          <fieldset disabled={busy}><legend>Business information</legend><div className="ait-form-grid">
            <label>Owner’s full name<input required autoComplete="name" minLength={2} maxLength={100} placeholder="Your full name" {...field("owner_name")} /></label>
            <label>Shop name<input required autoComplete="organization" minLength={2} maxLength={120} placeholder="The name customers know" {...field("name")} /></label>
            <label>Shop type<select aria-label="Shop type" required {...field("shop_type")}><option value="">{config ? "Choose shop type" : "Loading shop types…"}</option>{(config?.shopTypes || []).map((type) => <option key={type}>{type}</option>)}</select></label>
            <label>Marketplace category<select aria-label="Marketplace category" required {...field("category")}><option value="">Choose a category</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>Business phone<input type="tel" required autoComplete="tel" minLength={7} maxLength={30} placeholder="Contact number for your shop" {...field("phone")} /></label>
            <label>City / location<input required autoComplete="address-level2" minLength={2} maxLength={180} placeholder="e.g. Coimbatore, Tamil Nadu" {...field("location")} /></label>
          </div><label>About your shop <span className="br-optional">Optional</span><textarea rows={3} maxLength={2000} placeholder="What do you sell? What makes your shop special?" {...field("description")} /></label>
            <label className="br-photo-label">Shop photo <span className="br-optional">Optional · JPEG, PNG or WebP · up to 8 MB</span><div className="br-photo-upload">{photoPreview ? <img src={photoPreview} alt="Selected shop photo preview" /> : <ImagePlus size={27} />}<span>{file ? file.name : "Choose a photo of your shop"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const photo = event.target.files?.[0] || null; try { checkPhoto(photo); setFile(photo); setError(""); } catch (failure) { event.target.value = ""; setError(failure.message); } }} /></span></div></label>
          </fieldset>
          <fieldset disabled={busy}><legend>Shop size & branches</legend><p className="br-fieldset-help">Your exact monthly price updates as you choose your shop size and branches.</p><div className="br-capacity-grid">
            <label>Shop size<select aria-label="Shop size" {...field("size")}>{(config?.sizes || ["small", "medium", "large"]).map((size) => <option value={size} key={size}>{size[0].toUpperCase() + size.slice(1)}</option>)}</select></label>
            <label>Number of branches<input required type="number" min={1} max={100} step={1} {...field("branches")} /></label>
            <label>Expected product photos<input required type="number" min={1} max={100000} step={1} {...field("expected_photos")} /></label>
          </div><div className="br-branches">{form.branch_details.map((branch, index) => <div className="br-branch" key={index}><h4><MapPin size={16} /> Branch {index + 1}</h4><label>Branch name<input required minLength={2} maxLength={120} placeholder={index === 0 ? "Main branch" : `Branch ${index + 1}`} {...branchField(index, "name")} /></label><label>Full branch address<input required minLength={5} maxLength={300} autoComplete="off" placeholder="Door / street, area, city and postcode" {...branchField(index, "address")} /></label><label>Branch phone<input required type="tel" minLength={7} maxLength={30} placeholder="Contact number for this branch" {...branchField(index, "phone")} /></label>{index === 0 && <button className="br-text-button" type="button" onClick={() => setForm((previous) => ({ ...previous, branch_details: previous.branch_details.map((item, position) => position === 0 ? { ...item, address: previous.location, phone: previous.phone } : item) }))}>Use business location & phone</button>}</div>)}</div></fieldset>
          <div className="br-form-footer"><p><LockKeyhole size={15} /> Save your details first. Review and authorize AutoPay in the next step.</p><button className="btn-primary" disabled={busy || !config?.shopTypes?.length || !categories.length}>{busy ? "Saving shop details…" : "Save shop & continue"}<ArrowRight size={17} /></button>{showNewForm && shops.length > 0 && <button type="button" className="br-text-button" disabled={busy} onClick={() => setShowNewForm(false)}>Cancel registration</button>}</div>
        </form><aside className="br-summary"><QuoteSummary quote={quote} loading={quoteLoading} error={quoteError} /><div className="br-summary-benefits"><h3>A home for your business.</h3><p><Check size={16} /> Showcase your shop and products</p><p><Check size={16} /> Manage every registered branch</p><p><Check size={16} /> Connect with interested customers</p></div><p className="br-secure"><ShieldCheck size={18} /> {pricing?.checkoutEnabled ? 'Recurring payments through Razorpay' : 'Review your monthly subscription before payment'}</p>{pricing && !pricing.checkoutEnabled && <p className="br-small">Online subscriptions are currently unavailable. You can save your shop details now and return to activate later.</p>}</aside>
      </div>}
      {!selected && shops.length > 0 && !showNewForm && <div className="br-existing-header"><div><span className="br-overline">YOUR BUSINESSES</span><h2>Shops & subscriptions</h2></div><button className="btn-primary" disabled={busy || Boolean(pendingShop)} onClick={() => { setShowNewForm(true); setMessage(""); setError(""); }}><Store size={17} /> Register another shop</button></div>}
      {!selected && !showNewForm && shops.map((shop) => <article className="br-card br-existing-shop" key={shop.id}><div className="br-existing-shop-main"><div className="br-shop-heading">{shop.image_path ? <img src={resolveImageUrl(shop.image_path)} alt="" /> : <div className="br-icon"><Store size={24} /></div>}<div><span className={`br-status ${paidShop(shop) ? "is-active" : ""}`}>{paidShop(shop) ? "Subscription active" : paidPeriod(shop) ? "Paid period · shop unavailable" : "Registration pending"}</span><h2>{shop.name}</h2><p>{shop.shop_type || shop.category} · {shop.location} · {shop.branches} {shop.branches === 1 ? "branch" : "branches"}</p></div></div>{shop.subscription?.paid_until && <p className="br-small">Paid through {new Date(shop.subscription.paid_until).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. AutoPay: {shop.subscription.status}.</p>}<div className="br-actions">{paidShop(shop) ? <Link className="btn-primary" to="/business">Open dashboard <ArrowRight size={15} /></Link> : <button className="btn-primary" disabled={busy} onClick={() => selectShop(shop)}>{paidPeriod(shop) ? "View shop status" : "Continue registration"}<ArrowRight size={15} /></button>}<button className="btn-secondary" disabled={busy} onClick={() => selectShop(shop)}>Subscription details</button><button className="br-text-button" disabled={busy} onClick={() => setEditingId(editingId === shop.id ? "" : shop.id)}>Edit shop</button></div></div>{editingId === shop.id && <ShopEditor key={shop.id} shop={shop} busy={busy} onSave={saveShop} onClose={() => setEditingId("")} />}</article>)}
      {shops.filter((shop) => (!selected || shop.id === selected.id) && shop.subscription?.provider_id && !["cancelled", "completed", "expired"].includes(shop.subscription.status)).map((shop) => <div className="br-cancel" key={shop.id}>{cancelId === shop.id ? <><p>Stop future AutoPay renewals for <strong>{shop.name}</strong>? Access continues through the paid subscription period.</p><div className="br-actions"><button className="btn-secondary" disabled={busy} onClick={() => cancelSubscription(shop.subscription)}>Confirm cancellation</button><button className="br-text-button" disabled={busy} onClick={() => setCancelId("")}>Keep AutoPay</button></div></> : <button className="br-text-button" disabled={busy} onClick={() => setCancelId(shop.id)}>Cancel AutoPay for {shop.name}</button>}</div>)}
    </>}
    <p className="br-bottom-note"><ShieldCheck size={16} /> Your account and business controls are private. Your shop becomes public after its subscription is confirmed.</p>
    <p className="br-bottom-note">Subscriptions pay for your business profile, product and service listings and management tools. A subscription does not guarantee sales or inquiries. <Link to="/pricing">Pricing</Link> · <Link to="/refunds">Cancellation and refunds</Link> · <Link to="/delivery">Service delivery</Link> · <Link to="/contact">Contact us</Link></p>
  </section>;
}
