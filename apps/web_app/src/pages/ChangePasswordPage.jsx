import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { useAccount } from '../AccountContext';
import { post } from '../api/client';
import './ChangePasswordPage.css';

export default function ChangePasswordPage() {
  const { user, loading, setUser, logout } = useAccount();
  const [params] = useSearchParams(), navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState(''), [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const temporary = user?.must_change_password;
  const rules = [
    ['At least 10 characters', password.length >= 10 && password.length <= 128],
    ['An uppercase and a lowercase letter', /[A-Z]/.test(password) && /[a-z]/.test(password)],
    ['A number and a special character', /[0-9]/.test(password) && /[^a-zA-Z0-9\s]/.test(password)],
  ];
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (password !== confirmPassword) { setError('Your new passwords do not match.'); return; }
    if (password === currentPassword) { setError('Choose a new password different from your current password.'); return; }
    if (!rules.every(([, valid]) => valid)) { setError('Complete all the password requirements below.'); return; }
    setBusy(true);
    try {
      const result = await post('/auth/change-password', { currentPassword, password, confirmPassword });
      setCurrentPassword(''); setPassword(''); setConfirmPassword('');
      setUser(result.user);
      let destination = user.role === 'merchant' ? '/business' : '/account';
      const next = params.get('next');
      if (next?.startsWith('/') && !next.startsWith('//') && !/[\\\u0000-\u0020]/.test(next)) {
        const url = new URL(next, window.location.origin);
        if (url.origin === window.location.origin && !['/change-password', '/login', '/account'].includes(url.pathname)) destination = url.pathname + url.search + url.hash;
      }
      navigate(destination, { replace: true });
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  if (loading) return <section className="ait-page" role="status">Loading your account…</section>;
  if (!user) return <section className="ait-page password-setup"><div className="password-setup-card"><h1>Sign in to change your password</h1><Link className="btn-primary" to="/login?next=/change-password">Sign in</Link></div></section>;
  return <section className="ait-page password-setup">
    <div className="password-setup-context"><span className="password-setup-icon"><ShieldCheck size={28} /></span><p className="ait-eyebrow">YOUR SHOP OWNER ACCOUNT</p><h1>{temporary ? 'Make this account yours.' : 'Update your password.'}</h1><p>{temporary ? 'Your administrator has created your shop. Choose a private password to unlock your dashboard and start adding products.' : 'Choose a strong password for your account.'}</p>{user.user_id && <div className="password-setup-id"><span>Your user ID</span><strong>{user.user_id}</strong></div>}<p className="password-setup-note">{temporary ? 'This step is required before you can manage your shop. Your temporary password will stop working after this change.' : 'Your other signed-in sessions will be signed out.'}</p></div>
    <form className="password-setup-card ait-form" onSubmit={submit}>
      <div className="password-setup-title"><KeyRound size={22}/><h2>{temporary ? 'Set your permanent password' : 'Choose a new password'}</h2></div>
      {error && <p className="ait-error" role="alert">{error}</p>}
      <fieldset disabled={busy}>
        <label>{temporary ? 'Temporary password' : 'Current password'}<input type="password" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoFocus /></label>
        <label>New password<input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} aria-describedby="password-requirements" /></label>
        <ul id="password-requirements" className="password-requirements">{rules.map(([label, valid]) => <li key={label} className={valid ? 'is-met' : ''}><span aria-hidden="true">{valid ? '✓' : '○'}</span>{label}</li>)}</ul>
        <label>Confirm new password<input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Updating password…' : temporary ? 'Save password & open dashboard' : 'Save new password'}</button>
      </fieldset>
      <button className="ait-link" type="button" disabled={busy} onClick={async () => { try { await logout(); navigate('/login'); } catch (failure) { setError(failure.message); } }}>Sign out</button>
    </form>
  </section>;
}
