import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "../AccountContext";
import { request, post } from "../api/client";
import {useSite} from '../SiteContext';
let sdk;
function loadRazorpay() {
  return (sdk ||= new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = resolve;
    s.onerror = () => {
      sdk = null;
      reject(new Error("Could not load secure checkout. Please try again."));
    };
    document.head.appendChild(s);
  }));
}
export default function MerchantPage() {
  const {categories}=useSite();
  const { user, loading } = useAccount(),
    [shops, setShops] = useState([]),
    [pricing, setPricing] = useState(null),
    [price, setPrice] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    location: "",
    phone: "",
    description: "",
    category: "Vehicles",
    branches: 1,
    size:'small',
    expected_photos:100,
  });
  const field = (k) => ({
    value: form[k],
    onChange: (e) =>
      setForm({
        ...form,
        [k]: ['branches','expected_photos'].includes(k) ? Number(e.target.value) : e.target.value,
      }),
  });
  async function refresh() {
    if (user) setShops(await request("/shops/mine"));
  }
  useEffect(() => {
    request("/billing/pricing")
      .then(setPricing)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [user]);
  useEffect(() => {
    let live = true;
    setPrice(null);
    if (form.category)
      post("/billing/quote", {
        category: form.category,
        branches: form.branches,
        size:form.size,
        expected_photos:form.expected_photos,
      })
        .then((p) => {
          if (live) setPrice(p);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [pricing, form.category, form.branches,form.size,form.expected_photos]);
  async function checkout(shop) {
    setError("");
    setBusy(true);
    try {
      const offer = await request('/shops/'+shop.id+'/quote');
      if(offer.requiresReview)throw new Error(offer.message);
      if(!window.confirm(`Authorize ₹${(offer.amountMinor/100).toLocaleString('en-IN')} every month for ${shop.name}? AutoPay renews until canceled. Review the mandate in Razorpay before approving.`)){setBusy(false);return;}
      const c = await post("/billing/checkout", { shopId: shop.id,acceptedAmountMinor:offer.amountMinor });
      await loadRazorpay();
      new window.Razorpay({
        key: c.key,
        subscription_id: c.subscriptionId,
        name: c.name,
        description: c.description,
        prefill: c.prefill,
        theme: { color: "#F95738" },
        handler: async (p) => {
          try {
            const verified = await post("/billing/verify", {
              requestId: c.requestId,
              paymentId: p.razorpay_payment_id,
              subscriptionId: p.razorpay_subscription_id,
              signature: p.razorpay_signature,
            });
            setMessage(verified.message);
            await refresh();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setMessage(
              "Checkout closed. No shop is published until payment is confirmed.",
            );
          },
        },
      }).open();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const shop = await post("/shops", form);
      await refresh();
      if(pricing?.checkoutEnabled && !price?.requiresReview)await checkout(shop);
      else {setMessage(price?.requiresReview?'Shop saved. The product owner will review your monthly quote. Refresh status before continuing to payment.':'Shop saved. Payments will open after private Razorpay configuration.');setBusy(false);}
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  async function cancel(s) {
    if (!window.confirm("Stop future AutoPay renewals for this shop?")) return;
    try {
      const r = await post("/billing/cancel", { requestId: s.id });
      setMessage(r.message);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }
  if (loading) return <section className="ait-page">Loading…</section>;
  return (
    <section className="ait-page">
      <p className="ait-eyebrow">FOR SHOP OWNERS</p>
      <h1>Your shop. More possibilities.</h1>
      <p className="ait-lead">
        Register your business, choose your category and branches, then set up a
        recurring subscription through Razorpay.
      </p>
      {error && (
        <p role="alert" className="ait-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="ait-notice">
          {message}
        </p>
      )}
      {!pricing?.checkoutEnabled && (
        <div className="ait-notice">
          Small single-branch shops start from ₹499/month. Registration payments are not open
          yet while Razorpay is being configured.
          No payment will be collected until the exact recurring amount is
          shown.
        </div>
      )}
      {!user ? (
        <div className="ait-panel">
          <h2>Start with your shop-owner account</h2>
          <p>Keep your shop, subscription and inquiries together.</p>
          <Link
            className="btn-primary"
            to="/account?register=1&role=merchant&next=/merchant"
          >
            Register / sign in
          </Link>
        </div>
      ) : user.role !== "merchant" ? (
        <div className="ait-panel">
          {user.role==='admin'?<Link to="/admin">Open product-owner controls</Link>:<>This account is for browsing. Register a
          separate shop-owner account to manage a business.
          </>}
        </div>
      ) : (
        <>
          {shops.map((s) => (
            <article className="ait-panel" key={s.id}>
              <p className="ait-eyebrow">
                {s.category} · {s.branches} branch(es)
              </p>
              <h2>{s.name}</h2>
              <p>{s.location}</p>
              <p>
                <strong>
                  {s.subscription?.paid_until &&
                  new Date(s.subscription.paid_until) > new Date()
                    ? "Subscription active"
                    : "Payment required"}
                </strong>
              </p>
              {s.subscription?.paid_until && (
                <p>
                  Paid access through{" "}
                  {new Date(s.subscription.paid_until).toLocaleDateString()}.
                  AutoPay status: {s.subscription.status}.
                </p>
              )}
              <div className="ait-actions">
                <button type="button" className="btn-secondary" onClick={async()=>{const name=window.prompt('Shop name',s.name),description=name&&window.prompt('About your shop',s.description);if(name&&description!==null)try{await request('/shops/'+s.id,{method:'PATCH',body:JSON.stringify({name,description,phone:s.phone,location:s.location,image_path:s.image_path})});await refresh();}catch(e){setError(e.message);}}}>Edit shop</button>
                <button type="button" className="btn-secondary" onClick={async()=>{try{const q=await request('/shops/'+s.id+'/quote');setMessage(q.requiresReview?q.message:`Approved subscription: ₹${q.amountMinor/100}/month. ${q.reason||''}`);}catch(e){setError(e.message);}}}>View monthly quote</button>
                {s.subscription?.paid_until &&
                new Date(s.subscription.paid_until) > new Date() ? (
                  <Link className="btn-primary" to="/sell">
                    Publish a listing
                  </Link>
                ) : (
                  <button
                    disabled={busy || !pricing?.checkoutEnabled}
                    className="btn-primary"
                    onClick={() => checkout(s)}
                  >
                    Continue to secure payment
                  </button>
                )}
                <Link className="btn-secondary" to="/messages">
                  View inquiries
                </Link>
                <button
                  className="btn-secondary"
                  onClick={() => refresh().catch((e) => setError(e.message))}
                >
                  Refresh status
                </button>
                {s.subscription?.provider_id &&
                  !["cancelled", "completed", "expired"].includes(
                    s.subscription.status,
                  ) && (
                    <button
                      className="ait-link"
                      onClick={() => cancel(s.subscription)}
                    >
                      Cancel AutoPay
                    </button>
                  )}
              </div>
            </article>
          ))}
          {!shops.some((s) => s.status === "pending_payment") && (
            <form onSubmit={submit} className="ait-panel ait-form">
              <h2>
                {shops.length ? "Register another shop" : "Register your shop"}
              </h2>
              <div className="ait-form-grid">
                <label>
                  Shop name
                  <input
                    required
                    minLength={2}
                    maxLength={120}
                    {...field("name")}
                  />
                </label>
                <label>
                  Category
                  <select {...field("category")}>
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Number of branches
                  <input
                    type="number"
                    required
                    min={1}
                    max={100}
                    {...field("branches")}
                  />
                </label>
                <label>
                  Shop size
                  <select {...field('size')}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select>
                </label>
                <label>
                  Expected product photos
                  <input type="number" min={1} max={100000} required {...field('expected_photos')}/>
                </label>
                <label>
                  City / location
                  <input
                    required
                    minLength={2}
                    maxLength={180}
                    {...field("location")}
                  />
                </label>
                <label>
                  Shop phone
                  <input
                    type="tel"
                    required
                    minLength={7}
                    maxLength={30}
                    {...field("phone")}
                  />
                </label>
              </div>
              <label>
                About your shop
                <textarea maxLength={2000} rows={3} {...field("description")} />
              </label>
              <div className="ait-notice">
                {price?.requiresReview ? price.message : price ? (
                  <>
                    Recurring subscription:{" "}
                    <strong>
                      ₹{(price.amountMinor / 100).toLocaleString("en-IN")} /{" "}
                      {price.period}
                    </strong>
                    . Base ₹{price.baseAmountMinor / 100} + extra branches ₹
                    {price.additionalBranchAmountMinor / 100}. Review the amount
                    and AutoPay mandate in Razorpay before authorizing.
                  </>
                ) : (
                  "Exact subscription price will appear here when registration opens."
                )}
              </div>
              <p>
                Subscriptions publish your shop and let you post business
                listings. Payments for purchases are arranged directly between
                buyers and sellers.
              </p>
              <button
                className="btn-primary"
                disabled={busy || !price}
              >
                {busy ? "Please wait…" : price?.requiresReview ? 'Save shop & request a quote' : pricing?.checkoutEnabled ? "Save shop & set up AutoPay" : 'Save shop details'}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
