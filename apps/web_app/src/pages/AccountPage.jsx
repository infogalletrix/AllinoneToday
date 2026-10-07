import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAccount } from "../AccountContext";
import { post, request } from "../api/client";
import GoogleLogin from '../components/common/GoogleLogin';
export default function AccountPage() {
  const { user, setUser, logout, loading } = useAccount(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const [register, setRegister] = useState(params.get("register") === "1"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [blocks, setBlocks] = useState([]);
  useEffect(() => {
    if (user)
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
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await post(
        "/auth/" + (register ? "register" : "login"),
        values,
      );
      setUser(result.user);
      const next = params.get("next");
      navigate(
        next?.startsWith("/") && !next.startsWith("//")
          ? next
          : result.user.role === 'admin' ? '/admin' : result.user.role === "merchant"
            ? "/merchant"
            : "/listings",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !window.confirm(
        "Delete your account, listings and messages permanently? Any shop AutoPay will be canceled immediately and your shop removed. This does not request a refund.",
      )
    )
      return;
    setBusy(true);
    try {
      await request("/account", {
        method: "DELETE",
        body: JSON.stringify({
          confirmation: user.passwordSet === false ? window.prompt('Log in again with Google first, then type DELETE to confirm.') || '' : '',
          password: user.passwordSet === false ? '' :
            window.prompt("Enter your password to confirm account deletion") ||
            "",
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
        <p className="ait-eyebrow">ALL IN ONE TODAY</p>
        <h1>
          {user
            ? "Your account"
            : register
              ? "Create your account"
              : "Welcome back"}
        </h1>
        {error && (
          <p role="alert" className="ait-error">
            {error}
          </p>
        )}
        {user ? (
          <>
            <p>
              {user.name} · {user.email}
            </p>
            <div className="ait-actions">
              {user.role !== 'buyer' && <Link
                className="btn-primary"
                to={user.role === "merchant" ? "/merchant" : "/admin"}
              >
                {user.role === "merchant"
                  ? "Manage your shop"
                  : "Owner dashboard"}
              </Link>}
              <Link className="btn-secondary" to="/messages">
                Messages
              </Link>
              {user.role !== 'buyer' && <Link className="btn-secondary" to="/my-listings">
                My listings
              </Link>}
              {user.role === 'admin' && <Link className="btn-secondary" to="/admin">Product-owner dashboard</Link>}
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
            <GoogleLogin role={values.role} onSuccess={result=>{setUser(result.user);navigate(result.user.role==='admin'?'/admin':result.user.role==='merchant'?'/merchant':'/listings');}}/>
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
                {params.get('role')==='merchant' && <label>
                  I am a
                  <select {...field("role")}>
                    <option value="buyer">Buyer / individual seller</option>
                    <option value="merchant">Shop owner</option>
                  </select>
                </label>}
              </>
            )}
            <label>
              Email
              <input
                required
                type="email"
                autoComplete="email"
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
            <button className="btn-primary" disabled={busy}>
              {busy ? "Please wait…" : register ? "Sign up" : "Login"}
            </button>
            <button
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
            </button>
          </form>
        )}
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
