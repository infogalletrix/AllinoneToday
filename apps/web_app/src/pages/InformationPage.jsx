import { Link, useLocation } from "react-router-dom";
import {useSite} from '../SiteContext';
import './InformationPage.css';
import publicPlayQr from '../assets/play-store/public-google-play-qr.svg';
import businessPlayQr from '../assets/play-store/business-google-play-qr.svg';

const androidApps = [
  {
    name: 'All in One Today',
    audience: 'FOR SHOPPERS',
    description: 'Discover local shops, products and services. Browse without signing in, and sign in to save favourites or contact a business.',
    url: 'https://play.google.com/store/apps/details?id=com.allinonetoday.app',
    qr: publicPlayQr,
  },
  {
    name: 'All in One Business',
    audience: 'FOR THE PLATFORM ADMINISTRATOR',
    description: 'Manage shops, products, customer messages and shop owner access. This app is restricted to the platform administrator.',
    url: 'https://play.google.com/store/apps/details?id=com.allinonetoday.business',
    qr: businessPlayQr,
    business: true,
  },
];

export default function InformationPage() {
  const { pathname } = useLocation();
  const {site}=useSite();
  return (
    <section className="ait-page ait-prose">
      <div className="ait-panel">
        {pathname === '/support' ? <><h1>All in One Today support</h1><p>For account, shop registration, billing or safety help:</p>{site.supportEmail&&<p><a href={'mailto:'+site.supportEmail}>{site.supportEmail}</a></p>}{site.supportPhone&&<p>{site.supportPhone}</p>}{!site.supportEmail&&!site.supportPhone&&<p>Support contact details are being set up by the product owner.</p>}</> : pathname === "/download" ? (
          <>
            <p className="ait-eyebrow">ALL IN ONE TODAY APPS</p>
            <h1>Get our Android apps on Google Play.</h1>
            <p>
              Install the apps and receive available updates through Google Play.
              On your Android phone, tap the button for the app you want. On a
              computer, scan its QR code with your phone.
            </p>
            <div className="ait-play-grid">
              {androidApps.map(app => <article className="ait-play-card" key={app.url}>
                <p className="ait-eyebrow">{app.audience}</p>
                <h2>{app.name}</h2>
                <p className="ait-play-description">{app.description}</p>
                <a className="btn-primary ait-play-button" href={app.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${app.name} in Google Play`}>
                  Open in Google Play <span aria-hidden="true">↗</span>
                </a>
                <figure className="ait-play-qr">
                  <a href={app.url} target="_blank" rel="noopener noreferrer" aria-label={`Open Google Play from the ${app.name} QR code`}>
                    <img src={app.qr} width="208" height="208" alt={`QR code for ${app.name} on Google Play`} />
                  </a>
                  <figcaption>Scan with your Android phone to open this app in Google Play.</figcaption>
                </figure>
                {app.business && <p className="ait-play-web-link">Shop owner? <Link className="ait-link" to="/business">Open your website business dashboard</Link>.</p>}
              </article>)}
            </div>
            <h2>iPhone</h2>
            <p>
              An iPhone app is not available yet. You can use this website on
              your iPhone.
            </p>
            <Link className="ait-link" to="/">
              Continue on web →
            </Link>
          </>
        ) : pathname === "/privacy" ? (
          <>
            <h1>Privacy notice</h1>
            <p>This notice covers the All in One Today website and Android apps, including All in One Business. Last updated: 4 November 2026.</p>
            <p>This platform is operated by {site.businessName || 'All in One Today'}{site.businessAddress ? `, ${site.businessAddress}` : ''}. For privacy questions or requests, use our <Link className="ait-link" to="/contact">public contact details</Link>.</p>
            <h2>Information we use</h2>
            <p>
              We store account names, email addresses, phone numbers and password
              hashes; business and branch details; listing descriptions and
              uploaded photos; inquiries and replies; support conversations;
              reports and block records. We use this information to provide
              accounts, publish listings, deliver messages, support users and
              investigate abuse. If you choose Google sign-in, we use your Google
              account identifier, name and verified email to create or link your
              account. Password recovery uses a short-lived, hashed reset token.
            </p>
            <p>For business subscriptions, we retain the accepted quote, subscription and payment references, billing status and paid-through date. We use these records to verify access, review billing issues and respond to refund requests. Account and security activity records help operate and protect the service.</p>
            <h2>Public information and sharing</h2>
            <p>Active listings, listing photos, publisher names and public shop details are visible to visitors. Listing and shop enquiries share your name, phone number and message with the owner of that listing or shop, who can reply in the conversation. Existing conversations stay with their original participants. Reported conversation context remains available to authorized moderators for abuse investigations. Support conversations are available to the account holder and authorized support operators. Only publish information and photos you have permission to share.</p>
            <p>The website assistant provides automated navigation and catalogue help. Its conversation stays in the current browser page; product searches send your search terms to the public catalogue API. The assistant does not contact sellers or confirm availability. Use Chat with seller to send an enquiry to the owner.</p>
            <p>
              Hosting and storage services process the information needed to run
              this platform. Email delivery services process recipient addresses
              and transactional email content when sending account, support and
              security messages. Google processes information needed for optional
              Google sign-in and for loading Google Fonts on the website. These
              providers may receive connection information such as your IP
              address and browser details when their services are requested.
            </p>
            <p>When subscription checkout is available, Razorpay processes payment authorization and mandates. We send the account name, email, phone number and subscription reference needed for checkout. We do not store card numbers, CVVs, OTPs, UPI PINs or banking passwords. Payment-provider processing is also governed by <a className="ait-link" href="https://razorpay.com/privacy-policy/">Razorpay's privacy policy</a>. Information may also be disclosed when required by applicable law or to investigate fraud and protect users.</p>
            <h2>Cookies and browser storage</h2>
            <p>The website uses a secure, HTTP-only session cookie for sign-in. Favorites are saved in your browser, and session storage remembers a pending payment response while its status is checked. Clearing browser storage can remove these saved preferences or require you to sign in again. This website does not include advertising trackers or analytics SDKs.</p>
            <h2>Android app storage and permissions</h2>
            <p>The Android apps store a sign-in token in protected device storage so you can remain signed in. Favorites saved while signed in are associated with your account on our server. Account details, inquiries, replies, support requests, reports and blocks are sent over HTTPS to operate the service and protect users. Listing images are downloaded for display; if you use an available upload feature, only the photos you select are uploaded. The apps do not request contacts, SMS or broad photo-library access for browsing or inquiries. Optional Google sign-in is available in the adult account area. These Android releases do not include a payment gateway or checkout.</p>
            <h2>Optional city and area detection</h2>
            <p>You can always enter a city or area manually. Choosing Use my location asks for foreground location permission to identify your area and filter nearby shops and products. Android requests approximate location only; it does not request precise or background location. Eligible adults who have already granted permission may see their area filled automatically when the location field is empty. The public Android app keeps device location off until its local adult eligibility check is complete, and browsing-only family mode does not use device location.</p>
            <p>For a location lookup, the website or app sends rounded coordinates over HTTPS to All in One Today, which forwards them to the Photon location service operated by komoot to obtain a city or area. Typed location suggestions also use this service. We do not save a location history or attach coordinates to your account. Lookup results and their rounded-coordinate keys can remain in server memory for up to ten minutes to limit repeat requests. The selected area is used as a search filter; ordinary network and security records may be retained. Photon receives the lookup information under its own service practices. Denying permission leaves manual location search available; you can revoke permission in your browser or device settings.</p>
            <h2>Family browsing in the public Android app</h2>
            <p>The public app opens for ordinary guest browsing without sign-in or a date-of-birth prompt. Parents can optionally enable family browsing, which provides access to content reviewed for that mode. In family browsing, accounts, inquiries and messages, contact sharing, photo uploads and external links are unavailable. Search filters stay on the device rather than being sent with family-browsing requests. Unreviewed listings and third-party images are not displayed.</p>
            <p>A local adult or parent eligibility check is required before using private account, chat or complaint features for the first time. The app remembers the validated choice on the device for later use. The entered date of birth is never saved or sent to our server; only the selected access mode and protected parental-control settings are retained on the device. Saved controls remain in effect when the app is reopened. Parent controls use a local PIN and Android device-credential confirmation before opening the adult account area. The app does not receive the device-unlock credential. These controls establish access on the device; they do not collect a child's account details or provide identity verification.</p>
            <p>Family browsing still makes HTTPS requests to load reviewed content and images. Our hosting and security services can process connection information needed to deliver those requests and protect the service, as described above. Family browsing contains no advertisements, Google sign-in, private conversations or payment checkout.</p>
            <p>A family safety report sends only the selected catalogue item and a fixed safety reason to the administrator for review. It does not request a name, account, contact details or a typed message. Hidden items and blocked shops are remembered on this device. Safety reports and the administrator's review actions are retained while needed for moderation and service protection.</p>
            <h2>Business administrator access</h2>
            <p>All in One Business is restricted to the platform administrator. Its authorized administrator can create and update shop and product or service catalogue entries, including listed prices, business contact details, descriptions and selected photos; receive new customer enquiries and reply; and review account information, categories, moderation reports and operational records to manage and protect the marketplace. It does not offer public registration, child accounts or payment checkout.</p>
            <h2>Retention and your choices</h2>
            <p><Link className="ait-link" to="/delete-account">Request account and data deletion</Link> using the website or public support email, including if you have uninstalled the app. Adult account holders can open Profile in the Android app and choose Delete my account. Family browsing does not create a child account.</p>
            <p>
              We keep operational information while needed to provide your account,
              listings, communications and subscription. On the website, open
              <Link className="ait-link" to="/account"> Your account</Link> and
              choose Delete account to request removal. Deletion requires
              reauthentication and confirmation that any shop AutoPay should stop;
              it completes only after required cancellation is confirmed. It
              removes or anonymizes account and listing information and removes
              uploaded images. Some financial, security and backup records may be
              retained where needed for recordkeeping, fraud prevention or legal
              obligations. Deleting an account does not request a refund.
            </p>
            <p>Contact us to request access, correction or deletion of your information, or help with a privacy concern. Public email and phone support are available from our <Link className="ait-link" to="/contact">contact page</Link>; signing in is required only for a private support conversation. Never include passwords, OTPs or payment credentials in your request.</p>
          </>
        ) : pathname === "/terms" ? (
          <>
            <h1>Marketplace terms</h1>
            <p>This platform is operated by {site.businessName || 'All in One Today'}{site.businessAddress ? `, ${site.businessAddress}` : ''}. You can reach us through our <Link className="ait-link" to="/contact">public contact details</Link>.</p>
            <p>
              All in One Today includes administrator-managed catalogue entries
              and subscribed-business listings. Business owners can manage shops
              created for them by the administrator; self-registered shops require
              an active paid business subscription to publish. Customer enquiries
              go directly to the owner of the relevant shop or listing.
              The platform does not sell the listed goods or collect
              their purchase price. Listings and their claims are supplied by
              their authorized publishers; assess the seller and inspect the item before agreeing to a
              transaction.
            </p>
            <h2>Supported listings</h2>
            <p>Listings, category images and all other public catalogue content must be suitable for a general audience. Nudity, sexual material or products, violent imagery or content, profane or hateful language, and offers promoting or selling alcohol, tobacco or vaping products, controlled drugs or weapons are prohibited. This rule also applies to catalogue content viewed through adult account access. Violating content may be removed and the responsible account restricted following review.</p>
            <p>Business subscriptions cover product and service listings only. Job vacancies, recruitment, candidate matching and placement listings or services are prohibited, including offers that request application fees, job security deposits or payment for employment. Businesses must not publish them under another category or present them as a product or service.</p>
            <p>
              Only post content you have permission to offer. Property listings,
              illegal or controlled drugs, weapons, tobacco, live animals,
              gambling, adult sexual services, counterfeit goods, investment or
              cryptocurrency schemes, pyramid schemes, deceptive work-from-home
              or get-rich-quick offers, misleading offers, harassment and
              unauthorized personal data are prohibited. Listings can be removed
              and accounts restricted following review. Accounts and
              subscriptions must not be shared or used to mislead others.
            </p>
            <p>Businesses must hold any licenses and permissions required for their advertised products or services. A platform subscription does not authorize an activity restricted by law or by the payment provider. Report suspected prohibited content for review; listings and accounts can be restricted following that review.</p>
            <p>
              Shop registration requires a recurring subscription. The category,
              number of branches, exact recurring amount and billing period will
              be displayed before Razorpay checkout. AutoPay renews until
              canceled; cancellation stops future renewals, with access
              continuing through the paid period. Contact All in One Today about
              billing disputes and refund requests. Refund conditions and
              timelines are set out in our cancellation and refund policy.
            </p>
            <p>Before authorizing a subscription, read the <Link className="ait-link" to="/pricing">current pricing</Link>, <Link className="ait-link" to="/refunds">cancellation and refund policy</Link>, <Link className="ait-link" to="/delivery">digital service delivery policy</Link> and <Link className="ait-link" to="/privacy">privacy notice</Link>. Your shop subscription does not include purchases from sellers or guarantee sales or inquiries.</p>
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
            <h2>Report prohibited offers</h2>
            <p>Job, recruitment and placement listings are not supported. Report any such offer, fee demand or promise of guaranteed employment using the listing report option or contact support. Do not send money or personal documents to a suspicious advertiser.</p>
            <a className="btn-primary" href="/support">
              Contact support
            </a>
          </>
        )}
        <p>Last updated: {pathname === '/download' ? '4 November 2026' : '23 October 2026'}</p>
      </div>
    </section>
  );
}
