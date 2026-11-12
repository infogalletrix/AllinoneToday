import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAccount } from "../AccountContext";
import { post, request } from "../api/client";
import GoogleLogin from '../components/common/GoogleLogin';
import { useDialogs } from '../components/common/DialogProvider';
export default function AccountPage() {
  const { confirm, prompt } = useDialogs();
  const { user, setUser, logout, loading } = useAccount(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const [register, setRegister] = useState(params.get("register") === "1"),
    [error, setError] = useState(""),
    [notice,setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [blocks, setBlocks] = useState([]);
  const businessAccount = params.get('role') === 'merchant' || params.get('mode') === 'owner';
  const adminLogin = params.get('next') === '/admin';
  useEffect(() => {
    setRegister(!adminLogin && params.get('register') === '1');
    setValues(previous => ({ ...previous, role: businessAccount ? 'merchant' : 'buyer' }));
    setError('');
  }, [params, businessAccount, adminLogin]);
  useEffect(() => {
    if (user && !user.must_change_password)
      request("/blocks")
        .then(setBlocks)
        .catch(() => {});
  }, [user]);
  const [values, setValues] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    role: params.get("role") === "merchant" ? "merchant" : "buyer",
  });
  const field = (key) => ({
    value: values[key],
    onChange: (e) => setValues({ ...values, [key]: e.target.value }),
  });
  function continueToAccount(account) {
    const next = params.get('next');
    let destination='';
    if(next?.startsWith('/')&&!next.startsWith('//')&&!next.includes('\\')&&!/[\u0000-\u0020]/.test(next)){
      try{const target=new URL(next,window.location.origin);if(target.origin===window.location.origin)destination=target.pathname+target.search+target.hash;}catch{}
    }
    if (account.must_change_password) {
      navigate('/change-password?next=' + encodeURIComponent(destination || '/business'));
      return;
    }
    navigate(destination || (account.role === 'admin' ? '/admin'
      : account.role === 'support' ? '/support'
      : account.role === 'merchant' ? '/business' : '/listings'));
  }
  async function submit(e) {
    e.preventDefault();
    setError("");
    setNotice('');
    setBusy(true);
    try {
      const result = await post(
        "/auth/" + (register ? "register" : "login"),
        register ? {...values,email:values.email.trim().toLowerCase()}
          : {identifier:values.email.trim(),password:values.password},
      );
      setUser(result.user);
      continueToAccount(result.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      if (!await confirm({
        title: 'Delete your account?',
        message: 'Your account, listings and messages will be permanently deleted. Any shop AutoPay will be canceled immediately and your shop removed. This does not request a refund.',
        confirmLabel: 'Continue to delete',
        cancelLabel: 'Keep account',
        tone: 'danger',
      })) return;
      const googleOnly = user.passwordSet === false;
      const credential = await prompt({
        title: 'Confirm account deletion',
        message: googleOnly
          ? 'Log in again with Google first, then type DELETE to confirm permanent account deletion.'
          : 'Enter your password to permanently delete your account.',
        inputLabel: googleOnly ? 'Type DELETE' : 'Password',
        inputType: googleOnly ? 'text' : 'password',
        required: true,
        minLength: 1,
        maxLength: googleOnly ? 20 : 128,
        confirmLabel: 'Delete account',
        cancelLabel: 'Keep account',
        tone: 'danger',
      });
      if (credential === null) return;
      await request("/account", {
        method: "DELETE",
        body: JSON.stringify({
          confirmation: googleOnly ? credential : '',
          password: googleOnly ? '' : credential,
          stopAutoPay: true,
        }),
      });
      setUser(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <section className="ait-page">Loading account…</section>;
  return (
    <section className="ait-page ait-auth">
      <div className="ait-panel">
        <p className="ait-eyebrow">{businessAccount && !user ? 'BUSINESS OWNER ACCOUNT' : 'ALL IN ONE TODAY'}</p>
        <h1>
          {user
            ? "Your account"
            : register
              ? businessAccount ? "Create your business account" : "Create your account"
              : adminLogin ? "Administrator login" : "Welcome back"}
        </h1>
        {error && (
          <p role="alert" className="ait-error">
            {error}
          </p>
        )}
        {notice&&<p role="status" className="ait-notice">{notice}</p>}
        {user ? (
          <>
            <p>
              {user.name} · {user.email}
            </p>
            <div className="ait-actions">
              {user.role !== 'buyer' && <Link
                className="btn-primary"
                to={user.role === "merchant" ? "/business" : user.role === 'support' ? '/support' : "/admin"}
              >
                {user.role === "merchant"
                  ? "Business dashboard"
                  : user.role === 'support' ? 'Support dashboard'
                  : "Owner dashboard"}
              </Link>}
              <Link className="btn-secondary" to="/messages">
                Messages
              </Link>
              {user.role === 'merchant' && <Link className="btn-secondary" to="/business/products">
                My listings
              </Link>}
              <Link className="btn-secondary" to="/listings?favorites=true">My wishlist</Link>
              <button className="btn-secondary" onClick={logout}>
                Sign out
              </button>
              <button className="ait-link" onClick={remove} disabled={busy}>
                Delete account
              </button>
            </div>
            <GoogleLogin linked={user.googleLinked} role={user.role === 'merchant' ? 'merchant' : 'buyer'} onSuccess={result=>setUser(result.user)}/>
          </>
        ) : (
          <form onSubmit={submit} className="ait-form">
            {businessAccount && <p>Create your owner account, add your shop details, then review your monthly subscription.</p>}
            {adminLogin ? <p>Sign in with the administrator account to manage shops, products, categories and website content.</p> : <><GoogleLogin role={values.role} onSuccess={result=>{setUser(result.user);continueToAccount(result.user);}}/>
            <p>Using Google sign-in can create or link your account. Review our <Link className="ait-link" to="/terms">Terms</Link> and <Link className="ait-link" to="/privacy">Privacy notice</Link> before continuing.</p></>}
            {register && (
              <>
                <label>
                  Your name
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                    {...field("name")}
                  />
                </label>
                <label>
                  Phone
                  <input
                    type="tel"
                    maxLength={30}
                    autoComplete="tel"
                    {...field("phone")}
                  />
                </label>
              </>
            )}
            <label>
              {register ? 'Email' : 'Email or user ID'}
              <input
                required
                type={register ? 'email' : 'text'}
                autoComplete={register ? 'email' : 'username'}
                maxLength={254}
                placeholder={register ? 'you@example.com' : 'Email or AIT user ID'}
                {...field("email")}
              />
            </label>
            <label>
              Password
              <input
                required
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={register ? 10 : 1}
                maxLength={128}
                pattern={
                  register
                    ? "(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9\\s]).{10,128}"
                    : undefined
                }
                {...field("password")}
              />
            </label>
            {register && (
              <>
                <small>
                  At least 10 characters, including uppercase, lowercase, a
                  number and a special character.
                </small>
                <p>
                  By creating an account you agree to our{" "}
                  <Link className="ait-link" to="/terms">
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link className="ait-link" to="/privacy">
                    Privacy notice
                  </Link>
                  .
                </p>
              </>
            )}
            {!register && <button type="button" className="ait-link" disabled={busy} onClick={async () => {
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) { setError('Enter your account email address to request a password reset code.'); setNotice(''); return; }
              setBusy(true); setError('');setNotice('');
              try { await post('/auth/forgot-password', { email: values.email.trim().toLowerCase() });
                navigate('/reset-password?email='+encodeURIComponent(values.email.trim().toLowerCase())+'&sent=1');
              } catch (e) { setError(e.message); } finally { setBusy(false); }
            }}>Forgot password?</button>}
            <button className="btn-primary" disabled={busy}>
              {busy ? "Please wait…" : register ? "Sign up" : "Login"}
            </button>
            {!adminLogin && <button
              type="button"
              className="ait-link"
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register
                ? "Already registered? Sign in"
                : "New here? Sign up"}
            </button>}
          </form>
        )}
        {!user && adminLogin && <p><Link className="ait-link" to="/login">Customer login</Link></p>}
        {!user && !businessAccount && !adminLogin && <p className="ait-auth-business">Shop owners can sign in with the user ID and temporary password supplied by the administrator. You’ll choose your own password on first login.</p>}
        {!user && businessAccount && <p><Link className="ait-link" to="/account">Public customer account</Link></p>}
        {user && blocks.length > 0 && (
          <>
            <h2>Blocked accounts</h2>
            {blocks.map((b) => (
              <p key={b.blocked_id}>
                {b.name}{" "}
                <button
                  className="ait-link"
                  onClick={async () => {
                    try {
                      await request("/blocks/" + b.blocked_id, {
                        method: "DELETE",
                      });
                      setBlocks(await request("/blocks"));
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  Unblock
                </button>
              </p>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
