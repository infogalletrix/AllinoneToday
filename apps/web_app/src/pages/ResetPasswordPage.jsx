import {useEffect, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {post} from '../api/client';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  const [email,setEmail]=useState(()=>params.get('email')||''),[otp,setOtp]=useState('');
  const [password,setPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[done,setDone]=useState(false);
  const [sent,setSent]=useState(()=>params.get('sent')==='1');
  useEffect(()=>{window.history.replaceState(null,'',window.location.pathname+window.location.search);},[]);

  async function sendCode(event){
    event.preventDefault();setError('');setNotice('');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){setError('Enter the account email address.');return;}
    setBusy(true);
    try{await post('/auth/forgot-password',{email:email.trim().toLowerCase()});setSent(true);setNotice('If an eligible account exists, a six-digit code will arrive by email.');}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }

  async function submit(event){
    event.preventDefault();setError('');setNotice('');
    if(password!==confirmPassword){setError('Passwords must match.');return;}
    if(!token&&!/^\d{6}$/.test(otp.trim())){setError('Enter the six-digit code from your email.');return;}
    setBusy(true);
    try{
      await post('/auth/reset-password',token?{token,password,confirmPassword}:{email:email.trim().toLowerCase(),otp:otp.trim(),password,confirmPassword});
      setDone(true);setPassword('');setConfirmPassword('');setOtp('');
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }

  return <section className="ait-page ait-auth"><div className="ait-panel">
    <h1>Reset your password</h1>
    {done ? <><p>Password updated. Your previous sessions have been signed out.</p><Link className="btn-primary" to="/login">Sign in</Link></>
      : token ? <form onSubmit={submit}>
        <p>Use at least 10 characters with uppercase, lowercase, a number and a special character.</p>
        <label>New password<input required type="password" autoComplete="new-password" minLength={10} maxLength={128} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9\s]).{10,128}" value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <label>Confirm password<input required type="password" autoComplete="new-password" minLength={10} maxLength={128} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label>
        {error&&<p role="alert" className="ait-error">{error}</p>}
        <button className="btn-primary" disabled={busy}>{busy?'Updating…':'Update password'}</button>
      </form> : <>
        <p>Enter the six-digit code we emailed you. It expires in 15 minutes.</p>
        <form onSubmit={sendCode}>
          <label>Account email<input required type="email" autoComplete="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
          {!sent&&<button className="btn-secondary" disabled={busy}>{busy?'Sending…':'Send reset code'}</button>}
        </form>
        {sent&&<form onSubmit={submit}>
          <label>Email code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value)}/></label>
          <label>New password<input required type="password" autoComplete="new-password" minLength={10} maxLength={128} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9\s]).{10,128}" value={password} onChange={e=>setPassword(e.target.value)}/></label>
          <label>Confirm password<input required type="password" autoComplete="new-password" minLength={10} maxLength={128} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label>
          {notice&&<p role="status" className="ait-notice">{notice}</p>}
          {error&&<p role="alert" className="ait-error">{error}</p>}
          <button className="btn-primary" disabled={busy}>{busy?'Updating…':'Update password'}</button>
          <button type="button" className="ait-link" disabled={busy} onClick={sendCode}>Send a new code</button>
        </form>}
        {!sent&&error&&<p role="alert" className="ait-error">{error}</p>}
      </>}
    {!done&&<p><Link to="/login">Back to Login</Link></p>}
  </div></section>;
}
