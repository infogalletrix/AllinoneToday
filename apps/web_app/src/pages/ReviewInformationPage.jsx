import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { request } from "../api/client";
import { useSite } from "../SiteContext";
import "./ReviewInformationPage.css";

const cleanText = (value) => typeof value === "string" ? value.trim() : "";
const configuredDays = (value) => Number.isSafeInteger(value) && value > 0 ? value : null;
const validAmount = (value) => Number.isSafeInteger(value) && value >= 0;
const money = (minor, currency) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency, maximumFractionDigits: minor % 100 ? 2 : 0,
}).format(minor / 100);

function BusinessIdentity({ site }) {
  const businessName = cleanText(site.businessName);
  const businessAddress = cleanText(site.businessAddress);
  return <>
    {businessName && <p><strong>Business operator:</strong> {businessName}</p>}
    {businessAddress && <p className="review-business-address"><strong>Business address:</strong> {businessAddress}</p>}
    {(!businessName || !businessAddress) && <p className="review-secondary">{!businessName && !businessAddress
      ? "Business operator and address details have not yet been published."
      : !businessName ? "Business operator details have not yet been published." : "The business address has not yet been published."}</p>}
  </>;
}

function PublicContacts({ site }) {
  const email = cleanText(site.supportEmail);
  const phone = cleanText(site.supportPhone);
  const telephone = phone.replace(/[^+\d]/g, "");
  return <>
    {email && <p><strong>Email:</strong> <a className="ait-link" href={`mailto:${email}`}>{email}</a></p>}
    {phone && <p><strong>Phone:</strong> {telephone ? <a className="ait-link" href={`tel:${telephone}`}>{phone}</a> : phone}</p>}
    {!email && !phone && <p className="review-secondary">Public email and phone details have not yet been published. You can sign in to open a private support request.</p>}
    <p><Link className="ait-link" to="/support">Open help &amp; support</Link> for account, subscription, billing, privacy or listing concerns. Support conversations require an account.</p>
  </>;
}

function PricingContent() {
  const [pricing, setPricing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    request("/billing/pricing").then((data) => {
      if (!data || data.currency !== "INR" || data.period !== "month"
        || !["small", "medium", "large"].every((size) => validAmount(data.tiers?.[size]))
        || !validAmount(data.additionalBranchAmountMinor)) {
        throw new Error("Current subscription prices could not be verified. Please try again or contact support.");
      }
      if (current) setPricing(data);
    }).catch((failure) => {
      if (current) { setPricing(null); setError(failure.message || "Current prices are unavailable. Please try again."); }
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [attempt]);
  const example = pricing && pricing.tiers.small + pricing.additionalBranchAmountMinor;
  return <>
    <h1>Business subscription pricing</h1>
    <p>All in One Today charges business owners for a digital business listing subscription. It includes a shop profile, product and service listings and registered branch details. Customer enquiries go directly to the relevant shop or listing owner. These fees pay for platform access; they do not pay for listed goods or services. Shops created by the administrator use separately granted publishing access.</p>
    {loading ? <p role="status">Loading current subscription prices…</p> : error ? <div className="ait-error" role="alert"><p>{error}</p><button className="btn-secondary" type="button" onClick={() => { setLoading(true); setError(""); setAttempt((value) => value + 1); }}>Retry prices</button></div> : pricing && <>
      <div className="review-price-grid">
        {[["small", "Small shop"], ["medium", "Medium shop"], ["large", "Large shop"]].map(([size, label]) => <article className="review-price-card" key={size}>
          <h2>{label}</h2><p className="review-price"><strong>{money(pricing.tiers[size], pricing.currency)}</strong><span> / month</span></p><p>Includes one registered branch.</p>
        </article>)}
      </div>
      <h2>Additional branches</h2>
      <p>Each branch after the first adds <strong>{money(pricing.additionalBranchAmountMinor, pricing.currency)} per month</strong>. Monthly total = your shop size price + (number of branches − 1) × the additional branch price.</p>
      {Number.isSafeInteger(example) && <p className="review-example"><strong>Example:</strong> a small shop with two branches costs {money(pricing.tiers.small, pricing.currency)} + {money(pricing.additionalBranchAmountMinor, pricing.currency)} = <strong>{money(example, pricing.currency)} per month</strong>.</p>}
      {pricing.paymentMode === "test" && <p className="ait-notice" role="status">Test payments only. No real money is collected in test mode.</p>}
      {!pricing.checkoutEnabled ? <p className="ait-notice" role="status">Online subscriptions are currently unavailable. You can save your shop registration and return when checkout becomes available.</p> : <p>Subscription checkout is available{pricing.paymentMode === "test" ? " in test mode" : ""}. Review your exact recurring amount and mandate before authorizing payment.</p>}
      <h2>Before you subscribe</h2>
      <p>Your displayed recurring total is the amount this website requests for the subscription. The business is not GST-registered, and no GST is added as a separate charge. We do not add a separate platform or convenience fee at checkout. If the payment mandate shows a different amount or billing period, stop and contact support before approving it. Contact us for billing or invoice questions.</p>
      <p>The server calculates your exact recurring total for your registered shop and branches before checkout. Review that quote and the payment mandate before authorizing AutoPay. Your accepted subscription quote determines your recurring charge.</p>
      <p>AutoPay renews until canceled or the mandate ends. Cancel future renewals from your subscription page. Confirmed paid access continues through the paid period, subject to the marketplace terms and moderation.</p>
    </>}
    <div className="ait-actions"><Link className="btn-primary" to="/business/register">Register your business</Link><Link className="btn-secondary" to="/contact">Contact us</Link></div>
    <p>Read our <Link className="ait-link" to="/terms">terms</Link>, <Link className="ait-link" to="/refunds">cancellation and refund policy</Link> and <Link className="ait-link" to="/delivery">digital service delivery policy</Link> before subscribing.</p>
    <p><a className="ait-link" href="/sample-invoice.pdf">View an illustrative subscription invoice (PDF)</a>. This sample is not a payment receipt or tax invoice.</p>
  </>;
}

export default function ReviewInformationPage() {
  const { pathname } = useLocation();
  const { site, loading: siteLoading, error: siteError } = useSite();
  const reviewDays = configuredDays(site.refundReviewDays);
  const initiationDays = configuredDays(site.refundInitiationDays);
  const processingDays = configuredDays(site.refundProcessingDays);
  return <section className="ait-page ait-prose review-information"><div className="ait-panel">
    <p className="ait-eyebrow">ALL IN ONE TODAY</p>
    {pathname === "/pricing" ? <PricingContent /> : pathname === "/about" ? <>
      <h1>About All in One Today</h1>
      <p>All in One Today is a local business directory and listings platform. Visitors browse products and services and send enquiries directly to the relevant shop or listing owner. Business owners can subscribe through this website to manage their business profiles, listings and registered branches. The administrator can also create shops and give their owners a user ID and temporary password to manage their products.</p>
      <h2>What our subscription pays for</h2>
      <p>Our recurring shop subscription pays for digital access to the platform. Shop owners review their server-calculated monthly price before authorizing AutoPay. The platform does not collect the purchase price of listed goods, service transaction amounts, property purchase prices, rent or property deposits.</p>
      <p>Property, job, recruitment and placement listings are not offered on the platform. All in One Today does not act as the seller or service provider for user listings. Buyers and businesses arrange any underlying transaction separately and are responsible for checking the offer and agreeing its terms.</p>
      <h2>Our business</h2>
      {siteLoading ? <p role="status">Loading business details…</p> : siteError ? <p className="review-secondary">Business details could not be loaded. Please try again later.</p> : <BusinessIdentity site={site} />}
      <p>See <Link className="ait-link" to="/pricing">current pricing</Link> or <Link className="ait-link" to="/contact">contact us</Link> for help with the platform.</p>
    </> : pathname === "/contact" ? <>
      <h1>Contact All in One Today</h1>
      <p>Contact us about account access, business registration, subscription charges, cancellations, refunds, privacy or marketplace safety. For a product or shop enquiry, open its page and choose Chat with seller to contact its owner through Messages.</p>
      {siteLoading ? <p role="status">Loading contact details…</p> : siteError ? <><p className="review-secondary">Public contact details could not be loaded. Please try again later.</p><p><Link className="ait-link" to="/support">Open help &amp; support</Link> to sign in and raise a private request.</p></> : <><PublicContacts site={site} /><h2>Business details</h2><BusinessIdentity site={site} /></>}
      <h2>Billing requests</h2>
      <p>Include your account email, shop name, payment or subscription reference, charge date and a description of the issue. Never send a card number, CVV, OTP, UPI PIN, password, API key or bank login credentials.</p>
      <p>For future renewals, use <Link className="ait-link" to="/business/subscription">your subscription page</Link>. See the <Link className="ait-link" to="/refunds">cancellation and refund policy</Link> for billing guidance.</p>
    </> : pathname === "/refunds" ? <>
      <h1>Cancellation and refund policy</h1>
      <p>This policy covers All in One Today business listing subscriptions. It does not cover goods or services arranged directly between users and businesses.</p>
      <h2>Cancel future renewals</h2>
      <p>Sign in to <Link className="ait-link" to="/merchant">your shop subscription page</Link>, choose “Cancel AutoPay” for the relevant shop and confirm the request. A cancellation may be scheduled for the end of the paid billing period. Check the returned status and refresh your subscription details; if confirmation is unavailable or a renewal is still expected, contact support promptly. A requested cancellation is not proof that the provider has completed it. Confirmed cancellation stops future renewals. Confirmed paid access continues through the paid period, subject to marketplace terms and moderation. Canceling a subscription does not automatically request or issue a refund.</p>
      <h2>Report a payment problem</h2>
      <p>If you see a duplicate subscription charge, an incorrect charge or full payment without service activation, <Link className="ait-link" to="/contact">contact us</Link> for a manual review. Include your account email, shop name, payment or subscription reference, charge date, amount and a clear description. Do not share card details, CVVs, OTPs, UPI PINs, passwords or banking credentials.</p>
      <p>We review payment records and service activation before deciding a refund request. A request does not guarantee approval. Any approved refund is returned through the original payment method; it is not paid to an alternative account supplied in a message.</p>
      {reviewDays && <p>Refund requests are reviewed within {reviewDays} business {reviewDays === 1 ? "day" : "days"} of receiving the information needed to investigate.</p>}
      {initiationDays && <p>We initiate approved refunds within {initiationDays} business {initiationDays === 1 ? "day" : "days"} of approval.</p>}
      {processingDays && <p>After initiation, bank credit usually takes {processingDays === 7 ? "5–7" : processingDays} business days. The payment provider or bank may take longer; contact us if the refund has not arrived.</p>}
      <h2>Waiting for payment confirmation</h2>
      <p>If payment is pending, refresh your subscription status and contact support before paying again. A checkout success message alone does not activate a subscription; the server must verify the full payment. See <Link className="ait-link" to="/delivery">digital service delivery</Link> for details.</p>
      <p>Deleting your account and canceling AutoPay are separate from a refund request. The <Link className="ait-link" to="/terms">marketplace terms</Link> also apply.</p>
    </> : <>
      <h1>Digital service delivery</h1>
      <p>All in One Today supplies a digital business listing subscription. The platform does not ship physical goods or deliver goods sold by listed businesses.</p>
      <h2>When your subscription activates</h2>
      <p>Register your shop, review the exact monthly amount and authorize the payment mandate when checkout is available. Shop publishing and paid business features activate after the server verifies a full subscription payment for the correct shop and billing amount. A mandate authorization, small verification charge or checkout success message alone does not grant paid access.</p>
      <p>Your business dashboard shows the confirmed subscription status and paid-through date. Payment confirmation can remain pending while the payment provider completes processing. Refresh your status and <Link className="ait-link" to="/contact">contact support</Link> if you have paid but access is unavailable; do not make another payment simply to retry activation.</p>
      <h2>What you receive</h2>
      <p>During a confirmed paid period, an eligible shop can maintain its business profile and registered branch details, manage product and service listings, and receive and reply to customer enquiries. Shops created by the administrator use separately granted publishing access. Publishing remains subject to listing rules, review and moderation. A subscription does not guarantee sales, inquiries or approval of a listing.</p>
      <h2>Buyer and seller arrangements</h2>
      <p>Transactions for advertised goods or services are arranged directly between the buyer and the relevant business. Delivery, inspection, performance, returns and any transaction payments must be agreed with that business separately. The platform subscription does not include those purchases or fulfilment services.</p>
      <p>Read <Link className="ait-link" to="/pricing">subscription pricing</Link>, the <Link className="ait-link" to="/terms">terms</Link> and our <Link className="ait-link" to="/refunds">cancellation and refund policy</Link>.</p>
    </>}
    <p className="review-updated">Last updated: 28 October 2026</p>
  </div></section>;
}
