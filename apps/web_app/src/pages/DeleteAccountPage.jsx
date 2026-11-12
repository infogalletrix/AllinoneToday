import { Link } from 'react-router-dom';
import { useSite } from '../SiteContext';

export default function DeleteAccountPage() {
  const { site } = useSite();
  const email = site.supportEmail || 'kgaravind1988@gmail.com';
  return <section className="ait-page ait-prose"><div className="ait-panel">
    <p className="ait-eyebrow">ALL IN ONE TODAY</p>
    <h1>Delete your All in One Today account</h1>
    <p>You can request deletion of your All in One Today account and associated personal data from this website, even if you have uninstalled the Android app.</p>
    <h2>Delete from your browser</h2>
    <ol>
      <li><Link className="ait-link" to="/account">Sign in to your account</Link> using the email/password or Google account you use in the app.</li>
      <li>On Your account, choose <strong>Delete account</strong>.</li>
      <li>Read the confirmation and verify your identity. For a password account, enter your current password. For a Google-only account, sign in again with Google and enter DELETE when prompted.</li>
      <li>Confirm deletion. If you also have a shop subscription, deletion stops its AutoPay immediately and completes after cancellation is confirmed. Contact support if cancellation is still pending.</li>
    </ol>
    <p>In the Android app, the same option is available under <strong>Profile → Delete my account</strong>.</p>
    <h2>Request deletion without signing in</h2>
    <p>Email <a className="ait-link" href={`mailto:${email}?subject=All%20in%20One%20Today%20account%20deletion`}>{email}</a> with the subject <strong>All in One Today account deletion</strong> and the email address associated with your account. We will verify account ownership before acting. You do not need to reinstall the app. Never send your password, OTP, UPI PIN or payment credentials.</p>
    <h2>What happens to your data</h2>
    <p>Deletion revokes your sessions, removes or anonymizes your account identity, shop and listing details, inquiries, messages and support content, and removes uploaded images, saved favorites and block records. Your account can no longer sign in.</p>
    <p>Required subscription and payment records, limited abuse/security records and backup copies may be retained where necessary for recordkeeping, fraud prevention or legal obligations. These records are not used to restore your public profile. Deleting an account does not request a refund.</p>
    <p>Read our <Link className="ait-link" to="/privacy">privacy notice</Link> or <Link className="ait-link" to="/contact">contact support</Link> for help.</p>
    <p>Last updated: 18 October 2026</p>
  </div></section>;
}
