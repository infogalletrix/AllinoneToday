import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useAccount} from '../AccountContext';
import {useSite} from '../SiteContext';
import {request,post} from '../api/client';

export default function SupportPage(){
  const {user}=useAccount();
  const {site}=useSite();
  const [tickets,setTickets]=useState([]),[selected,setSelected]=useState(null),[messages,setMessages]=useState([]);
  const [subject,setSubject]=useState(''),[text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const userId=user?.id,ticketId=selected?.id;
  async function loadTickets(){if(user)setTickets(await request('/support/tickets'));}
  useEffect(()=>{let live=true;if(userId)request('/support/tickets').then(data=>{if(live)setTickets(data);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[userId]);
  useEffect(()=>{
    if(!ticketId)return;
    let live=true;
    const load=()=>request(`/support/tickets/${ticketId}/messages`).then(data=>{if(live)setMessages(data);}).catch(e=>{if(live)setError(e.message);});
    load();const timer=setInterval(load,10000);return()=>{live=false;clearInterval(timer);};
  },[ticketId]);
  async function submit(event){
    event.preventDefault();setBusy(true);setError('');
    try{
      if(selected){await post(`/support/tickets/${selected.id}/messages`,{content:text});setMessages(await request(`/support/tickets/${selected.id}/messages`));}
      else {const ticket=await post('/support/tickets',{subject,message:text});setSelected(ticket);setSubject('');await loadTickets();}
      setText('');
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <section className="ait-page"><h1>Help & support</h1>
    <div className="ait-panel"><h2>Contact All in One Today</h2>
      <p>For account, subscription, billing, refund and privacy requests, contact our support team.</p>
      {site.supportEmail&&<p><a className="ait-link" href={'mailto:'+site.supportEmail}>{site.supportEmail}</a></p>}
      {site.supportPhone&&<p><a className="ait-link" href={'tel:'+site.supportPhone.replace(/[^+\d]/g,'')}>{site.supportPhone}</a></p>}
      <p><Link className="ait-link" to="/contact">Business address and contact details</Link> · <Link className="ait-link" to="/refunds">Cancellation and refunds</Link></p>
    </div>
    <div className="ait-panel"><h2>Quick assistance</h2>
      <details><summary>How do I register my shop?</summary><p>The administrator can create your shop and give you a user ID and temporary password. Sign in and change that password before opening your shop dashboard. You can also <Link className="ait-link" to="/business/register">register your business on this website</Link>, review your exact monthly fee and authorize payment when checkout is available. The Business Android app is restricted to the platform administrator.</p></details>
      <details><summary>How do I post products or services?</summary><p>Open your shop dashboard to add products or services, choose their category, set regular and offer prices, and show or hide each product. Publishing requires either an administrator-created shop with publishing access or a self-registered shop with confirmed paid access. All content remains subject to our listing terms.</p></details>
      <details><summary>Who receives a listing enquiry?</summary><p>Listing and shop enquiries go directly to the relevant shop or listing owner. Read and reply in Messages. Existing conversations stay with their original participants. The automated assistant helps with navigation and catalogue search; it does not send a message to sellers. Account, billing and privacy support requests use the support team.</p></details>
      <details><summary>How do I recover my password?</summary><p>Enter your email on Login and choose Forgot password. Follow the recovery instructions sent to your account email. If you cannot receive the email, contact support. Never send passwords or payment secrets to support.</p></details>
    </div>
    {error&&<p role="alert" className="ait-error">{error}</p>}
    {!user?<p><Link to="/login?next=/support">Login</Link> to start a private support conversation.</p>:<div className="ait-form-grid">
      <div className="ait-panel"><h2>Your support requests</h2><p>Assigned to the support team, not automatically the product owner.</p>
        {tickets.map(t=><button key={t.id} className="btn-secondary" style={{display:'block',marginBottom:12}} onClick={()=>{setSelected(t);setMessages([]);setText('');setError('');}}>{t.subject} · {t.status}</button>)}
        {!tickets.length&&<p>No requests yet.</p>}
        <button className="ait-link" onClick={()=>{setSelected(null);setMessages([]);setText('');}}>New request</button>
      </div>
      <div className="ait-panel"><h2>{selected?.subject||'Chat with support'}</h2>
        {messages.map(m=><article key={m.id} style={{padding:12,marginBottom:12,background:m.sender_id===user.id?'#edebff':'#f6f7fa',borderRadius:12}}><strong>{m.sender_role==='support'?'Support team':m.sender_name}</strong><p style={{whiteSpace:'pre-wrap'}}>{m.content}</p></article>)}
        {selected?.status==='resolved'?<p>This request is resolved. Create a new request for further help.</p>:<form className="ait-form" onSubmit={submit}>
          {!selected&&<label>Subject<input required minLength={3} maxLength={120} value={subject} onChange={e=>setSubject(e.target.value)}/></label>}
          <label>Message<textarea required minLength={selected?1:2} maxLength={2000} value={text} onChange={e=>setText(e.target.value)}/></label>
          <button className="btn-primary" disabled={busy}>{busy?'Sending…':'Send to support'}</button>
        </form>}
      </div>
    </div>}
  </section>;
}
