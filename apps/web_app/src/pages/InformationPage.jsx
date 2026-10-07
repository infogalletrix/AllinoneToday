import { Link, useLocation } from "react-router-dom";
import {useSite} from '../SiteContext';
export default function InformationPage() {
  const { pathname } = useLocation();
  const {site}=useSite();
  return (
    <section className="ait-page ait-prose">
      <div className="ait-panel">
        {pathname === '/support' ? <><h1>All in One Today support</h1><p>For account, shop registration, billing or safety help:</p>{site.supportEmail&&<p><a href={'mailto:'+site.supportEmail}>{site.supportEmail}</a></p>}{site.supportPhone&&<p>{site.supportPhone}</p>}{!site.supportEmail&&!site.supportPhone&&<p>Support contact details are being set up by the product owner.</p>}</> : pathname === "/download" ? (
          <>
            <p className="ait-eyebrow">ALL IN ONE TODAY APPS</p>
            <h1>Your next discovery is a tap away.</h1>
            <p>
              Two Android apps. One connected marketplace. These release
              APKs support 64-bit ARM phones running Android 7.0 or newer.
            </p>
            <div className="ait-form-grid">
              <article className="ait-panel">
                <h2>For everyone</h2>
                <p>
                  Browse listings, save discoveries and contact shops.
                </p>
                <a
                  className="btn-primary"
                  href="/downloads/allinonetoday-public.apk"
                >
                  Download public Android APK
                </a>
              </article>
              <article className="ait-panel">
                <h2>For shop owners</h2>
                <p>
                  Register your shop, manage its subscription, post listings and
                  reply to inquiries.
                </p>
                <a
                  className="btn-dark"
                  href="/downloads/allinonetoday-business.apk"
                >
                  Download business Android APK
                </a>
              </article>
            </div>
            <p>
              Android may ask you to allow installation from your browser. Only
              download our APKs from this website.
            </p>
            <h2>iPhone</h2>
            <p>
              App Store release is being prepared. Until then, use this website
              on your iPhone.
            </p>
            <Link className="ait-link" to="/">
              Continue on web →
            </Link>
          </>
        ) : pathname === "/privacy" ? (
          <>
            <h1>Privacy notice</h1>
            <p>
              All in One Today provides this marketplace. We store
              your account name, email, phone, password hash, listings, shop
              details, inquiries and replies to provide the service. Public
              listings and subscribed shop details are visible to visitors. Your
              contact phone is shared with the recipient when you send an
              inquiry.
            </p>
            <p>
              Sessions use secure cookies on the website and protected token
              storage in the mobile apps. Favorites on the website are saved in
              your browser. Subscription payments and mandates are handled by
              Razorpay; we do not store card numbers, UPI PINs or banking
              passwords.
            </p>
            <p>
              You can remove listings and delete your account from the Profile
              screen after canceling any shop AutoPay. Financial records may be
              retained where required. Contact{" "}
              <a className="ait-link" href="/support">
                All in One Today support
              </a>{" "}
              for privacy or deletion requests.
            </p>
            <p>
              This launch does not include advertising trackers or analytics
              SDKs. The hosting service processes connection information to
              operate and protect the website.
            </p>
          </>
        ) : pathname === "/terms" ? (
          <>
            <h1>Marketplace terms</h1>
            <p>
              All in One Today connects buyers, individual sellers and shop
              owners. The platform does not sell the listed goods or collect
              their purchase price. Listings and their claims are supplied by
              users; assess the seller and inspect the item before agreeing to a
              transaction.
            </p>
            <p>
              Only post content you have permission to offer. Illegal goods,
              misleading offers, harassment and unauthorized personal data are
              prohibited. Listings can be removed following review. Accounts and
              subscriptions must not be shared or used to mislead others.
            </p>
            <p>
              Shop registration requires a recurring subscription. The category,
              number of branches, exact recurring amount and billing period will
              be displayed before Razorpay checkout. AutoPay renews until
              canceled; cancellation stops future renewals, with access
              continuing through the paid period. Contact All in One Today about
              billing disputes and refund requests; no automatic refund is
              promised.
            </p>
            <p>
              Never share an OTP or banking PIN. For help, contact{" "}
              <a className="ait-link" href="/support">
                All in One Today support
              </a>
              .
            </p>
          </>
        ) : (
          <>
            <h1>Shop safely. Sell responsibly.</h1>
            <p>
              Inspect products and verify ownership before paying. Meet in a
              safe public location. Do not send deposits just to view an item.
              Never share an OTP, password or UPI PIN, and never scan a payment
              QR code to receive money.
            </p>
            <p>
              Subscription status is not a guarantee of a shop’s identity or
              product quality. Use the listing’s report option for suspicious
              content, and contact All in One Today support for urgent concerns.
            </p>
            <a className="btn-primary" href="/support">
              Contact support
            </a>
          </>
        )}
        <p>Last updated: 6 October 2026</p>
      </div>
    </section>
  );
}
