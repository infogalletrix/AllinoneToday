import {useId,useState,useEffect} from 'react';
import {Check,Copy,Eye,EyeOff,KeyRound,RefreshCw,Save,Share2,ShieldCheck} from 'lucide-react';

export default function OwnerCredentialsNotice({credentials,owner,shopName,message,busy,onGenerate,onSave,onDismiss}){
  const titleId=useId();
  const [visible,setVisible]=useState(false);
  const [copied,setCopied]=useState(false);
  const [sharing,setSharing]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [status,setStatus]=useState('');

  const currentUserId=credentials?.user_id||owner?.user_id||'';
  const currentPassword=credentials?.temporary_password||'';

  const [userIdInput,setUserIdInput]=useState(currentUserId);
  const [passwordInput,setPasswordInput]=useState('');
  const [showNewPassword,setShowNewPassword]=useState(false);
  const [mustChangePassword,setMustChangePassword]=useState(true);

  useEffect(()=>{
    setUserIdInput(credentials?.user_id||owner?.user_id||'');
    setPasswordInput('');
  },[credentials,owner]);

  const activeUserId=userIdInput.trim()||currentUserId;
  const activePassword=currentPassword;

  const loginDetails=()=>`All in One Today — ${shopName}\nLogin: ${window.location.origin}/login?role=merchant\nEmail: ${owner?.email||''}\nUser ID: ${activeUserId}\n${activePassword?`Temporary password: ${activePassword}\nChoose a new password on your first login.`:'Log in with your existing account password.'}`;

  async function copy(){
    try{
      await navigator.clipboard.writeText(loginDetails());
      setCopied(true);setError('');setStatus('Copied. Send the details directly to the shop owner.');
    }catch{setError('Copy is unavailable in this browser. Select and copy the login details below.');}
  }

  async function share(){
    if(!navigator.share){await copy();return;}
    setSharing(true);setError('');setStatus('');
    try{await navigator.share({title:`${shopName} — owner login`,text:loginDetails()});setStatus('Login details shared.');}
    catch(err){if(err.name!=='AbortError')setError('Sharing is unavailable. Use Copy login details to send them to the owner.');}
    finally{setSharing(false);}
  }

  async function handleSaveCredentials(e){
    if(e)e.preventDefault();
    if(!onSave)return;
    const trimmedId=userIdInput.trim();
    if(trimmedId.length<3){
      setError('User ID must be at least 3 characters.');
      return;
    }
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmedId)){
      setError('User ID can only contain letters, numbers, dots, hyphens, and underscores.');
      return;
    }
    if(passwordInput&&passwordInput.length<6){
      setError('Password must be at least 6 characters.');
      return;
    }
    setError('');setStatus('');setSaving(true);
    try{
      await onSave({
        userId:trimmedId!==currentUserId?trimmedId:undefined,
        password:passwordInput||undefined,
        mustChangePassword:passwordInput?mustChangePassword:undefined,
      });
      setPasswordInput('');
      setStatus('Owner credentials updated successfully.');
    }catch(err){
      setError(err.message||'Failed to update credentials.');
    }finally{
      setSaving(false);
    }
  }

  async function handleGeneratePassword(){
    if(!onSave){
      if(onGenerate)onGenerate();
      return;
    }
    setError('');setStatus('');setSaving(true);
    try{
      await onSave({
        userId:userIdInput.trim()!==currentUserId?userIdInput.trim():undefined,
        generatePassword:true,
        mustChangePassword:true,
      });
      setPasswordInput('');
      setStatus('New temporary password generated.');
    }catch(err){
      setError(err.message||'Failed to generate password.');
    }finally{
      setSaving(false);
    }
  }

  const hasModifications=(userIdInput.trim()!==currentUserId&&userIdInput.trim().length>0)||passwordInput.length>0;

  return (
    <section className="admin-owner-credentials" aria-labelledby={titleId}>
      <div className="admin-credentials-heading">
        <span><KeyRound size={23}/></span>
        <div>
          <p className="admin-kicker">SHOP OWNER ACCESS</p>
          <h3 id={titleId}>Login details for {shopName}</h3>
          <p>{currentPassword?'Share these details privately. You can also edit the User ID or set a new password below.':message||'You can edit the User ID or issue a new password below.'}</p>
        </div>
      </div>

      <div className="admin-credentials-fields" style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
        <label style={{display:'block'}}>
          <span style={{fontWeight:600,display:'block',marginBottom:4}}>Unique User ID</span>
          <input
            type="text"
            value={userIdInput}
            disabled={busy||saving}
            onChange={e=>setUserIdInput(e.target.value)}
            placeholder="e.g. AIT-1234..."
            style={{width:'100%',padding:'0.5rem',borderRadius:6,border:'1px solid #ccc'}}
          />
          <small style={{color:'#666',display:'block',marginTop:2}}>Used by the owner to sign in to the business app and web.</small>
        </label>

        {currentPassword&&!passwordInput&&(
          <label style={{display:'block'}}>
            <span style={{fontWeight:600,display:'block',marginBottom:4}}>Current Temporary Password</span>
            <div style={{display:'flex',alignItems:'center',gap:4}}>
              <input
                readOnly
                type={visible?'text':'password'}
                value={currentPassword}
                onFocus={e=>e.target.select()}
                style={{flex:1,padding:'0.5rem',borderRadius:6,border:'1px solid #ccc'}}
              />
              <button
                type="button"
                aria-label={visible?'Hide temporary password':'Show temporary password'}
                onClick={()=>setVisible(v=>!v)}
                style={{padding:'0.5rem',cursor:'pointer'}}
              >
                {visible?<EyeOff size={18}/>:<Eye size={18}/>}
              </button>
            </div>
          </label>
        )}

        <label style={{display:'block'}}>
          <span style={{fontWeight:600,display:'block',marginBottom:4}}>Set New Password {currentPassword?'(Optional)':''}</span>
          <div style={{display:'flex',alignItems:'center',gap:4}}>
            <input
              type={showNewPassword?'text':'password'}
              value={passwordInput}
              disabled={busy||saving}
              placeholder="Enter custom password (min 6 chars)"
              onChange={e=>setPasswordInput(e.target.value)}
              style={{flex:1,padding:'0.5rem',borderRadius:6,border:'1px solid #ccc'}}
            />
            <button
              type="button"
              aria-label={showNewPassword?'Hide new password':'Show new password'}
              onClick={()=>setShowNewPassword(v=>!v)}
              style={{padding:'0.5rem',cursor:'pointer'}}
            >
              {showNewPassword?<EyeOff size={18}/>:<Eye size={18}/>}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy||saving}
              onClick={handleGeneratePassword}
              title="Generate a secure temporary password"
              style={{padding:'0.5rem 0.75rem',fontSize:'0.85rem',whiteSpace:'nowrap',display:'inline-flex',alignItems:'center',gap:4}}
            >
              <RefreshCw size={15}/> Auto-Generate
            </button>
          </div>
        </label>

        {passwordInput&&(
          <label style={{display:'flex',alignItems:'center',gap:8,fontSize:'0.9rem',cursor:'pointer'}}>
            <input
              type="checkbox"
              checked={mustChangePassword}
              onChange={e=>setMustChangePassword(e.target.checked)}
            />
            Require owner to choose a new password on their first login
          </label>
        )}
      </div>

      <p className="admin-credentials-security">
        <ShieldCheck size={17}/>
        {hasModifications?'Click "Save Credentials" to apply changes. The owner will be signed out of existing sessions.':'Share credentials privately with the shop owner.'}
      </p>

      {error&&<p className="ait-error" role="alert" style={{color:'#d32f2f',marginTop:8}}>{error}</p>}
      {status&&<p className="admin-credentials-copy-status" role="status" style={{color:'#2e7d32',marginTop:8}}>{status}</p>}

      <div className="ait-actions" style={{marginTop:16,display:'flex',flexWrap:'wrap',gap:8}}>
        {hasModifications&&(
          <button
            type="button"
            className="btn-primary"
            disabled={busy||saving}
            onClick={handleSaveCredentials}
            style={{display:'inline-flex',alignItems:'center',gap:6}}
          >
            <Save size={17}/> {saving?'Saving…':'Save Credentials'}
          </button>
        )}
        {currentPassword&&!hasModifications&&(
          <>
            <button type="button" className="btn-primary" disabled={busy||sharing||saving} onClick={share} style={{display:'inline-flex',alignItems:'center',gap:6}}>
              <Share2 size={17}/>{sharing?'Sharing…':'Share login details'}
            </button>
            <button type="button" className="btn-secondary" disabled={busy||sharing||saving} onClick={copy} style={{display:'inline-flex',alignItems:'center',gap:6}}>
              {copied?<Check size={17}/>:<Copy size={17}/>} {copied?'Login details copied':'Copy login details'}
            </button>
          </>
        )}
        <button type="button" className="btn-secondary" disabled={busy||sharing||saving} onClick={onDismiss}>
          Close
        </button>
      </div>
    </section>
  );
}
