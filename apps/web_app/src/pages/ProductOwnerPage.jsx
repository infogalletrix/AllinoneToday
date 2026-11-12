import {useCallback,useEffect,useState,useRef} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {useAccount} from '../AccountContext';
import {useSite} from '../SiteContext';
import {request,uploadImage} from '../api/client';
import {ShopEditor,ListingEditor} from './AdminCatalogueEditors';
import {AlertCircle,ArrowUpRight,CheckCircle2,FolderTree,Inbox,KeyRound,Package,Plus,RefreshCw,Store,Trash2,Users} from 'lucide-react';
import {AdminNavigation,AdminPageHeading,AdminEmpty,OverviewCards,RecordToolbar,StatusBadge,pagedTabs,recordStatus,statusLabel,statusTone} from './AdminDashboardParts';
import './AdminDashboard.css';
import {ShopPublicStatus,ShopSavedNotice,publicShopHref,publicShopStatus} from './ShopPublication';
import ListingPrice from '../components/common/ListingPrice';
import OwnerCredentialsNotice from './OwnerCredentialsNotice';
import './OwnerManagement.css';
import {useDialogs} from '../components/common/DialogProvider';

const blankCategory={name:'',slug:'',subtitle:'',image_path:'',position:0,enabled:true,module:'product'};
const currency=amount=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(amount/100);
const date=value=>value?new Date(value).toLocaleString():'—';

function QuoteReview({item,busy,onSuggest,onApprove}){
  const {confirm}=useDialogs();
  const [amount,setAmount]=useState((item.approved_amount_minor||item.suggestion?.monthlyAmountMinor||49900)/100),[reason,setReason]=useState(item.reason||item.suggestion?.reason||'');
  return <form className="ait-panel ait-form" onSubmit={async event=>{event.preventDefault();if(busy)return;if(await confirm({title:'Approve this monthly quote?',message:`Approve ₹${amount}/month for this shop? The customer must accept it before AutoPay.`,confirmLabel:'Approve quote'}))onApprove({amountMinor:Math.round(Number(amount)*100),reason,revision:item.revision});}}><h3>{item.name}</h3><p>{item.category} · {item.size} · {item.branches} branches · {item.expected_photos} photos</p><p>Status: {item.status}</p>{item.suggestion&&<p>AI suggestion (not approved): {currency(item.suggestion.monthlyAmountMinor)}/month — {item.suggestion.reason}</p>}<label>Monthly INR amount<input type="number" required min={499} max={100000} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Price explanation<textarea required minLength={10} maxLength={1500} value={reason} onChange={e=>setReason(e.target.value)}/></label><div className="ait-actions"><button type="button" disabled={busy} className="btn-secondary" onClick={onSuggest}>Get AI recommendation</button><button disabled={busy} className="btn-primary">Approve monthly quote</button></div></form>;
}

function SafetyReport({report,busy,onReview,onSuspend}) {
  const {confirm}=useDialogs();
  const [context,setContext]=useState(null),[error,setError]=useState('');
  async function showConversation(){try{setContext(await request('/admin/reports/'+report.id+'/context'));setError('');}catch(error){setError(error.message);}}
  return <article className="ait-panel"><h3>{report.title}</h3><p>{report.reason}</p>
    {report.target_account_id&&<p>Reported account: {report.target_account_id}</p>}
    {error&&<p role="alert" className="ait-error">{error}</p>}
    {context&&<div><h4>Reported conversation</h4>{context.inquiry&&<p>{context.inquiry.sender_id}: {context.inquiry.message}</p>}{context.messages.map((message,index)=><p key={index}>{message.sender_id}: {message.content}</p>)}{context.messages.length===100&&<p>Showing the latest 100 replies.</p>}</div>}
    <div className="ait-actions">
      {report.inquiry_id&&<button disabled={busy} className="btn-secondary" onClick={showConversation}>View conversation</button>}
      {report.target_account_id&&<button disabled={busy} className="btn-secondary" onClick={async()=>{if(await confirm({title:'Suspend this reported user?',message:'This stops account access and hides their public listings.',confirmLabel:'Suspend user',tone:'danger'}))onSuspend(report.target_account_id);}}>Suspend reported user</button>}
      {report.listing_id&&!report.target_account_id&&<button disabled={busy} className="btn-primary" onClick={async()=>{if(await confirm({title:'Remove the reported listing?',message:'This listing will no longer appear in the public marketplace.',confirmLabel:'Remove listing',tone:'danger'}))onReview(report.id,true);}}>Remove listing</button>}
      <button disabled={busy} className="btn-secondary" onClick={()=>onReview(report.id,false)}>Mark reviewed</button>
    </div></article>;
}

function FamilyReview({kind,item,busy,onSave}){
  const [open,setOpen]=useState(false),[reviewed,setReviewed]=useState(false);
  useEffect(()=>{setOpen(false);setReviewed(false);},[item.family_review_version]);
  if(!item.family_review_version)return null;
  const save=approved=>onSave('/family-review/'+kind+'/'+item.id,{approved,contentVersion:item.family_review_version});
  return <div className="ait-panel ait-form">
    <p><strong>Family browsing:</strong> {item.family_safe?'Approved':'Not approved'}</p>
    {item.family_safe?<button disabled={busy} className="btn-secondary" onClick={()=>save(false)}>Remove from family browsing</button>:<button disabled={busy} className="btn-secondary" onClick={()=>setOpen(!open)}>{open?'Close review':'Review for family browsing'}</button>}
    {open&&!item.family_safe&&<div>
      <h4>Review the current content</h4>
      <p>Check the image, title, description and details for content appropriate for children. Do not approve contact details, external links, adult material or unsafe offers. Content changes require a new review.</p>
      {[...new Set([item.image_path,...(Array.isArray(item.gallery)?item.gallery:[])].filter(Boolean))].map((image,index)=><img key={image} src={image} alt={`Content image ${index+1} being reviewed`} style={{maxWidth:'100%',maxHeight:320,objectFit:'contain'}}/>)}
      <h4>{item.title||item.name}</h4>
      {item.subtitle&&<p>{item.subtitle}</p>}
      {item.description&&<p style={{whiteSpace:'pre-wrap'}}>{item.description}</p>}
      {item.specifications&&Object.entries(item.specifications).map(([name,value])=><p key={name}><strong>{name.replaceAll('_',' ')}:</strong> {String(value)}</p>)}
      <label className="ait-checkbox"><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/>I reviewed this content and its image for family browsing.</label>
      <button disabled={busy||!reviewed} className="btn-primary" onClick={()=>save(true)}>Approve for family browsing</button>
    </div>}
  </div>;
}

export default function ProductOwnerPage(){
  const {user,loading,logout}=useAccount(),siteContext=useSite();
  const {confirm,prompt}=useDialogs(),navigate=useNavigate();
  const [params,setParams]=useSearchParams();
  const [tab,setTab]=useState('Overview'),[data,setData]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[fetching,setFetching]=useState(false),[offset,setOffset]=useState(0),[editCategory,setEditCategory]=useState(null),[editShop,setEditShop]=useState(null),[editListing,setEditListing]=useState(null),[query,setQuery]=useState(''),[status,setStatus]=useState(''),[updatedAt,setUpdatedAt]=useState(null),[draftDirty,setDraftDirty]=useState(false),[editorEpoch,setEditorEpoch]=useState(0);
  const [publicShops,setPublicShops]=useState({items:[],loading:true,error:''}),[shopNotice,setShopNotice]=useState(null),[shopScope,setShopScope]=useState('owned'),[ownerCredentials,setOwnerCredentials]=useState(null);
  const [quickAddLoading,setQuickAddLoading]=useState(false),[quickAddFailed,setQuickAddFailed]=useState(false),[quickAddAttempt,setQuickAddAttempt]=useState(0),[productNotice,setProductNotice]=useState('');
  const activeTab=useRef(''),requestSequence=useRef(0),publicSequence=useRef(0),viewer=useRef(null),mutationLock=useRef(false),deletePromptLock=useRef(false);
  const dirty=useRef(false),discardPending=useRef(null);
  dirty.current=draftDirty;
  viewer.current=user?.role==='admin'?user.id:null;
  useEffect(()=>{setOwnerCredentials(null);},[user?.id,user?.role]);
  activeTab.current=(user?.id||'')+':'+tab+':'+offset;
  const editing=Boolean(editCategory||editShop||editListing);
  async function load(){
    const requested=(user?.id||'')+':'+tab+':'+offset,sequence=++requestSequence.current;
    setFetching(true);setError('');
    try{const result=await request(`/admin/${tab.toLowerCase().replaceAll(' ','-')}?offset=${offset}`);if(activeTab.current===requested&&requestSequence.current===sequence){setData(result);setUpdatedAt(Date.now());}return result;}
    catch(error){if(activeTab.current===requested&&requestSequence.current===sequence)setError(error.message);return null;}
    finally{if(activeTab.current===requested&&requestSequence.current===sequence)setFetching(false);}
  }
  useEffect(()=>{if(user?.role==='admin')load();return()=>{requestSequence.current+=1;};},[user?.id,user?.role,tab,offset]);
  const requestedShop=params.get('shop_id'),requestedAction=params.get('action');
  useEffect(()=>{
    if(user?.role!=='admin'||requestedAction!=='add-product'||!requestedShop){setQuickAddLoading(false);return;}
    let live=true;
    function consume(){setParams(previous=>{const next=new URLSearchParams(previous);next.delete('shop_id');next.delete('action');return next;},{replace:true});}
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestedShop)){setError('Choose a valid shop to add products.');consume();return;}
    setQuickAddLoading(true);setQuickAddFailed(false);setError('');
    (async()=>{const all=[];for(let offset=0;offset<=100000;offset+=100){const page=await request('/admin/shops?offset='+offset);all.push(...page);if(page.length<100)break;}return all;})().then(shops=>{
      if(!live)return;
      const shop=shops.find(item=>item.id.toLowerCase()===requestedShop.toLowerCase()&&item.admin_managed);
      if(!shop){setError('Choose one of your administrator-managed shops to add products.');setQuickAddLoading(false);consume();return;}
      setData(null);setTab('Listings');setOffset(0);setQuery('');setStatus('');setDraftDirty(false);setShopNotice(null);setProductNotice('');setMessage('');
      setEditShop(null);setEditCategory(null);setEditListing({shop_id:shop.id});setEditorEpoch(previous=>previous+1);setQuickAddLoading(false);consume();
    }).catch(error=>{if(live){setError('The shop could not be loaded. '+error.message);setQuickAddFailed(true);setQuickAddLoading(false);}});
    return()=>{live=false;};
  },[user?.id,user?.role,requestedShop,requestedAction,quickAddAttempt]);
  async function checkPublicShops(){
    const actor=viewer.current,sequence=++publicSequence.current;
    if(!actor)return null;
    setPublicShops(previous=>({...previous,loading:true,error:''}));
    try{const items=await request('/shops',{cache:'no-store'});if(viewer.current===actor&&publicSequence.current===sequence)setPublicShops({items,loading:false,error:''});return items;}
    catch(error){if(viewer.current===actor&&publicSequence.current===sequence)setPublicShops({items:[],loading:false,error:error.message});return null;}
  }
  useEffect(()=>{if(user?.role==='admin'&&(tab==='Shops'||tab==='Overview'))checkPublicShops();return()=>{publicSequence.current++;};},[user?.id,user?.role,tab]);
  const discard=useCallback(()=>{
    if(!dirty.current)return Promise.resolve(true);
    if(discardPending.current)return discardPending.current;
    discardPending.current=confirm({title:'Discard your unsaved changes?',message:'Your changes haven’t been saved. You can keep editing or discard them to continue.',confirmLabel:'Discard changes',cancelLabel:'Keep editing',tone:'danger'}).then(accepted=>{
      if(accepted){dirty.current=false;setDraftDirty(false);}
      return accepted;
    }).finally(()=>{discardPending.current=null;});
    return discardPending.current;
  },[confirm]);
  useEffect(()=>{
    if(!draftDirty)return;
    function warn(event){if(!dirty.current)return;event.preventDefault();event.returnValue='';}
    async function followLink(event){
      const anchor=event.target.closest?.('a[href]');
      if(!anchor||anchor.target&&anchor.target!=='_self'||anchor.hasAttribute('download')||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      const url=new URL(anchor.href,window.location.href);
      if(!['http:','https:'].includes(url.protocol)||url.href===window.location.href||url.hash&&url.pathname===window.location.pathname&&url.search===window.location.search)return;
      event.preventDefault();event.stopPropagation();
      if(!await discard())return;
      if(url.origin===window.location.origin)navigate(url.pathname+url.search+url.hash);
      else window.location.assign(url.href);
    }
    window.addEventListener('beforeunload',warn);document.addEventListener('click',followLink,true);
    return()=>{window.removeEventListener('beforeunload',warn);document.removeEventListener('click',followLink,true);};
  },[draftDirty,discard,navigate]);
  function clearEditor(){setEditCategory(null);setEditShop(null);setEditListing(null);setProductNotice('');}
  async function cancelEditor(){if(await discard())clearEditor();}
  async function selectTab(next){
    if(busy||!await discard())return false;
    requestSequence.current+=1;activeTab.current=(user?.id||'')+':'+next+':0';
    setQuickAddFailed(false);
    if(requestedAction==='add-product')setParams(previous=>{const nextParams=new URLSearchParams(previous);nextParams.delete('shop_id');nextParams.delete('action');return nextParams;},{replace:true});
    if(next!==tab||offset!==0){setData(null);setUpdatedAt(null);}else load();
    setTab(next);setOffset(0);setMessage('');setShopNotice(null);setError('');setQuery('');setStatus('');setEditorEpoch(previous=>previous+1);clearEditor();return true;
  }
  async function openEditor(kind,value={}){if(busy||!await discard())return;clearEditor();setError('');setMessage('');if(kind==='Shops')setEditShop(value);else if(kind==='Listings'){setEditListing(value);setEditorEpoch(previous=>previous+1);}else setEditCategory(value.id?value:{...blankCategory,position:Math.min(data?.length||0,1000)});}
  async function addProductToShop(shop){if(await selectTab('Listings'))await openEditor('Listings',{shop_id:shop.id});}
  async function createFromOverview(kind){if(await selectTab(kind))await openEditor(kind);}
  async function changePage(next){if(busy||!await discard())return;requestSequence.current+=1;activeTab.current=(user?.id||'')+':'+tab+':'+next;clearEditor();setData(null);setUpdatedAt(null);setQuery('');setStatus('');setOffset(next);}
  async function refresh(){if(busy||fetching||!await discard())return;clearEditor();setEditorEpoch(previous=>previous+1);await Promise.all([load(),checkPublicShops()]);}
  async function mutate(path,value,method='POST'){
    if(mutationLock.current)return null;mutationLock.current=true;setBusy(true);setError('');setMessage('');
    try{
      const result=await request('/admin'+path,{method,body:JSON.stringify(value)});setDraftDirty(false);setMessage('Changes saved.');
      if(result?.credentials)setOwnerCredentials({credentials:result.credentials,owner:{email:result.owner_email,user_id:result.owner_user_id},shopId:result.id,shopName:result.name||value.name,can_reset:true,family_review_version:result.family_review_version});
      const [reloaded,,publicItems]=await Promise.all([load(),siteContext.refresh(),checkPublicShops()]);
      if(reloaded===null)setError('Your changes were saved. Refresh the records to see the latest version.');
      if(/^\/(?:catalogue\/)?shops(?:\/|$)/.test(path)){
        const id=result?.id||path.split('/').at(-1),saved={...(Array.isArray(data)?data.find(item=>item.id===id):{}),...value,...result};
        if(typeof value.status==='string'&&typeof result?.moderated_hidden!=='boolean')saved.moderated_hidden=saved.status!=='active';
        const verification=publicShopStatus(saved,{items:publicItems||[],loading:false,error:publicItems===null?'unavailable':''},siteContext.site.categories);
        setMessage('');setShopNotice({id,name:saved.name||'Your shop',category:saved.category,...verification});
      }
      return result??true;
    }
    catch(error){setError(error.message);return null;}finally{mutationLock.current=false;setBusy(false);}
  }
  async function saveListing(value,options={}){
    const id=editListing?.id;
    const result=await mutate('/catalogue/listings'+(id?'/'+id:''),value,id?'PATCH':'POST');
    if(!result)return;
    if(!id&&options.addAnother){
      setEditListing({shop_id:value.shop_id||'',category:value.category});setEditorEpoch(previous=>previous+1);
      setMessage('');setProductNotice((result.title||value.title)+' saved. Add the next product; you can choose a different category.');
    }else{setEditListing(null);setProductNotice('');}
  }
  async function showOwnerCredentials(shop){
    if(busy||mutationLock.current)return;
    const actor=viewer.current;
    mutationLock.current=true;setBusy(true);setError('');setOwnerCredentials(null);
    try{
      const details=await request('/admin/shops/'+encodeURIComponent(shop.id)+'/owner-credentials',{cache:'no-store'});
      if(viewer.current===actor)setOwnerCredentials({...details,shopId:shop.id,shopName:shop.name});
    }catch(error){if(viewer.current===actor)setError(error.message);}
    finally{mutationLock.current=false;setBusy(false);}
  }
  async function generateOwnerCredentials(){
    if(busy||mutationLock.current||deletePromptLock.current||!ownerCredentials?.can_reset)return;
    const current=ownerCredentials,actor=viewer.current;
    deletePromptLock.current=true;
    try{
      if(!await confirm({title:'Create new owner login details?',message:`Replace the password for the owner of “${current.shopName}”? This signs the owner out of every device and requires them to choose a new password on their next login. Share the new temporary password privately.`,confirmLabel:'Create temporary password',tone:'danger'}))return;
      if(viewer.current!==actor||mutationLock.current)return;
      mutationLock.current=true;setBusy(true);setError('');
      try{
        const details=await request('/admin/shops/'+encodeURIComponent(current.shopId)+'/owner-credentials',{method:'POST',body:JSON.stringify({contentVersion:current.family_review_version,generate_password:true})});
        if(viewer.current===actor){setOwnerCredentials({...details,shopId:current.shopId,shopName:current.shopName});await load();}
      }catch(error){if(viewer.current===actor)setError(error.message);}
      finally{mutationLock.current=false;setBusy(false);}
    }finally{deletePromptLock.current=false;}
  }
  async function saveOwnerCredentials({userId,password,mustChangePassword,generatePassword}={}){
    if(busy||mutationLock.current||!ownerCredentials?.can_reset)return;
    const current=ownerCredentials,actor=viewer.current;
    mutationLock.current=true;setBusy(true);setError('');
    try{
      const payload={
        contentVersion:current.family_review_version,
        ...(userId ? {user_id:userId.trim()} : {}),
        ...(password ? {password} : {}),
        ...(mustChangePassword!==undefined ? {must_change_password:mustChangePassword} : {}),
        ...(generatePassword ? {generate_password:true} : {}),
      };
      const details=await request('/admin/shops/'+encodeURIComponent(current.shopId)+'/owner-credentials',{method:'POST',body:JSON.stringify(payload)});
      if(viewer.current===actor){setOwnerCredentials({...details,shopId:current.shopId,shopName:current.shopName});await load();}
      return details;
    }catch(error){if(viewer.current===actor)setError(error.message);throw error;}
    finally{mutationLock.current=false;setBusy(false);}
  }
  async function deleteCatalogueItem(kind,item){
    if(busy||mutationLock.current||deletePromptLock.current)return;
    if(!item.family_review_version){setError('Refresh the records before deleting this item.');return;}
    const shop=kind==='shops',label=shop?item.name:item.title;
    deletePromptLock.current=true;
    try{
      const accepted=await confirm({
        title:shop?'Delete this shop?':'Delete this product?',
        message:shop
          ? `Delete “${label}” and all products and services linked to it? They will be removed from the catalogue and public browsing. You cannot restore them from this dashboard. The owner’s account and message history will be kept. Cancel any active subscription before deleting.`
          : `Delete “${label}” from the catalogue and public browsing? You cannot restore it from this dashboard. Existing message history will be kept.`,
        confirmLabel:shop?'Delete shop':'Delete product',cancelLabel:shop?'Keep shop':'Keep product',tone:'danger',
      });
      if(!accepted||mutationLock.current)return;
      mutationLock.current=true;setBusy(true);setError('');setMessage('');setShopNotice(null);setProductNotice('');
      try{
        await request('/admin/catalogue/'+kind+'/'+encodeURIComponent(item.id),{method:'DELETE',body:JSON.stringify({contentVersion:item.family_review_version})});
        setData(previous=>Array.isArray(previous)?previous.filter(row=>row.id!==item.id):previous);
        setDraftDirty(false);
        setMessage((shop?'Shop deleted: ':'Product deleted: ')+label+'.'+(shop?' Its products and services were also removed from the catalogue.':''));
        const [reloaded]=await Promise.all([load(),siteContext.refresh(),checkPublicShops()]);
        if(reloaded===null)setError('Deletion is complete. Refresh the records to see the latest list.');
        else if(Array.isArray(reloaded)&&!reloaded.length&&offset>0){setData(null);setOffset(previous=>Math.max(0,previous-100));}
        if(shop){setEditShop(null);setOwnerCredentials(previous=>previous?.shopId===item.id?null:previous);}
      }catch(error){setError(error.message||'The item could not be deleted. Please try again.');}
      finally{mutationLock.current=false;setBusy(false);}
    }finally{deletePromptLock.current=false;}
  }
  const managed=item=>item.admin_managed===true;
  const rows=Array.isArray(data)?data.filter(item=>{
    if(tab==='Shops'&&shopScope==='owned'&&!item.admin_managed)return false;
    const text=[item.name,item.title,item.email,item.owner_email,item.owner_name,item.owner_user_id,item.seller_name,item.category,item.subcategory,item.location,item.phone,item.description,item.subtitle,item.slug,item.role,item.shop_name,item.provider_id,item.action,item.route,item.actor,item.target,item.reason,item.target_label].filter(Boolean).join(' ').toLocaleLowerCase();
    return (!query.trim()||text.includes(query.trim().toLocaleLowerCase()))&&(!status||recordStatus(tab,item)===status);
  }):[];
  const isFiltered=Boolean(query.trim()||status);
  const clearFilters=()=>{setQuery('');setStatus('');};
  const family=(kind,item)=><details className="admin-family-review"><summary>Optional: family browsing</summary><p>Public website visibility is separate from this optional review.</p><FamilyReview kind={kind} item={item} busy={busy} onSave={mutate}/></details>;
  const badge=(item)=><StatusBadge tone={statusTone(recordStatus(tab,item))}>{statusLabel(recordStatus(tab,item))}</StatusBadge>;
  const thumbnail=(item,Icon)=>item.image_path?<img className="admin-record-image" src={item.image_path} alt="" loading="lazy"/>:<span className="admin-record-placeholder"><Icon size={23} aria-hidden="true"/></span>;
  function markFormChange(){if(editing||tab==='Website'||tab==='Pricing'||tab==='Assessments')setDraftDirty(true);}
  if(loading)return <section className="ait-page"><div className="admin-loading" role="status"><RefreshCw size={18} className="admin-spin"/>Loading administrator access…</div></section>;
  if(user?.role!=='admin')return <section className="ait-page ait-auth"><div className="ait-panel"><p className="ait-eyebrow">ALL IN ONE TODAY</p><h1>Administrator login</h1><p>Sign in with the administrator account to create and manage shops, products, services, categories and website content.</p>{!user?<Link className="btn-primary" to={'/login?next='+encodeURIComponent('/admin'+(params.toString()?'?'+params.toString():''))}>Login</Link>:<><p role="alert">Your current account does not have administrator access.</p><button className="btn-secondary" disabled={busy} onClick={async()=>{setBusy(true);try{await logout();}catch(error){setError(error.message);}finally{setBusy(false);}}}>Sign out to switch account</button></>}{error&&<p className="ait-error" role="alert">{error}</p>}</div></section>;
  return <section className="ait-page ait-owner admin-dashboard">
    <header className="ait-owner-header"><div><p className="ait-eyebrow">ALL IN ONE TODAY · ADMINISTRATION</p><h1>Admin dashboard</h1><p>Create shops, give owners access and keep your catalogue organized.</p></div><div className="admin-top-actions"><button type="button" className="btn-primary" disabled={busy} onClick={()=>createFromOverview('Shops')}><Plus size={17}/>Create shop & owner</button><Link className="btn-secondary" to="/messages"><Inbox size={17}/>Messages</Link><Link className="admin-secondary-link" to="/">View website<ArrowUpRight size={16}/></Link></div></header>
    <div className="ait-owner-layout"><AdminNavigation tab={tab} busy={busy||quickAddLoading} onSelect={selectTab} user={user}/><div className="ait-owner-main" onChange={markFormChange} onClickCapture={event=>{const button=event.target.closest?.('button');if(button?.type==='button'&&button.closest('form')&&!button.dataset.preserveDraft&&button.textContent!=='Cancel')markFormChange();}}>
      <AdminPageHeading tab={tab} updatedAt={updatedAt} fetching={fetching} busy={busy||quickAddLoading} onRefresh={refresh} draftDirty={draftDirty}/>
      {error&&<div role="alert" className="ait-error admin-error"><AlertCircle size={20}/><div><p>{error}</p>{!editing&&<button className="btn-secondary" disabled={busy||fetching||quickAddLoading} onClick={quickAddFailed?()=>setQuickAddAttempt(value=>value+1):refresh}>Try again</button>}</div></div>}
      {message&&<p role="status" className="ait-notice">{message}</p>}
      {ownerCredentials&&<OwnerCredentialsNotice key={ownerCredentials.shopId+':'+(ownerCredentials.credentials?.temporary_password||'unavailable')} {...ownerCredentials} busy={busy} onGenerate={ownerCredentials.can_reset?generateOwnerCredentials:undefined} onSave={ownerCredentials.can_reset?saveOwnerCredentials:undefined} onDismiss={()=>setOwnerCredentials(null)}/>}
      {shopNotice&&<ShopSavedNotice notice={shopNotice} onAddProducts={addProductToShop} onCheck={async()=>{const items=await checkPublicShops();setShopNotice(previous=>previous?{...previous,...publicShopStatus({id:previous.id,status:'active',category:previous.category,admin_managed:true},{items:items||[],loading:false,error:items===null?'unavailable':''},siteContext.site.categories)}:null);}}/>}
      {quickAddLoading?<div className="admin-loading" role="status"><RefreshCw size={18} className="admin-spin"/>Preparing your shop’s product form…</div>:data===null?(!error&&<div className="admin-loading" role="status"><RefreshCw size={18} className="admin-spin"/>Loading {tab.toLowerCase()}…</div>):<>
        {Array.isArray(data)&&!editing&&(data.length>1||query||status)&&<RecordToolbar tab={tab} query={query} setQuery={setQuery} status={status} setStatus={setStatus} data={data} shown={rows.length}/>}
        {tab==='Overview'&&<OverviewCards data={{...data,publicShops:publicShops.loading||publicShops.error?undefined:publicShops.items.length}} onSelect={selectTab} onCreate={createFromOverview}/>}
        {tab==='Categories'&&<>
          <div className="admin-section-actions"><p>{data.length} marketplace categories</p><button className="btn-primary" disabled={busy} onClick={()=>openEditor('Categories')}><Plus size={16}/>Add category</button></div>
          {editCategory?<CategoryEditor key={editCategory.id||'new'} value={editCategory} busy={busy} onCancel={cancelEditor} onSave={async value=>{if(await mutate('/categories'+(editCategory.id?'/'+editCategory.id:''),value,editCategory.id?'PATCH':'POST'))setEditCategory(null);}}/>:<div className="admin-record-list">{rows.map(item=><div className="admin-record" key={item.id}><article className="ait-admin-row"><div className="admin-record-primary">{thumbnail(item,FolderTree)}<div className="admin-record-copy"><h3>{item.name}</h3><p>{item.subtitle||'No description added.'}</p><div className="admin-record-meta">{badge(item)}<span className="admin-type">{item.module==='service'?'Services':'Products'}</span><span className="admin-type">Order {item.position}</span></div><small>/{item.slug}</small></div></div><div className="ait-actions"><button disabled={busy} className="btn-secondary" onClick={()=>openEditor('Categories',item)}>Edit</button>{item.enabled&&<Link className="ait-link" to={'/listings?category='+encodeURIComponent(item.name)}>View category ↗</Link>}</div></article>{family('categories',item)}</div>)}</div>}
        </>}
        {tab==='Website'&&<WebsiteEditor key={data.revision+':'+editorEpoch} data={data} categories={siteContext.categories} busy={busy} onSave={value=>mutate('/website',value,'PUT')}/>}
        {tab==='Accounts'&&<div className="admin-record-list">{rows.map(account=><div className="admin-record" key={account.id}><article className="ait-admin-row"><div className="admin-record-primary"><span className="admin-record-placeholder"><Users size={22}/></span><div className="admin-record-copy"><h3>{account.name}</h3><p>{account.email}</p><div className="admin-record-meta">{badge(account)}<span className="admin-type">{account.role}</span>{['admin','support'].includes(account.role)&&<span className="admin-type">Protected account</span>}</div><small>Joined {date(account.created_at)}</small></div></div>{!['admin','support'].includes(account.role)&&<div className="ait-actions"><button className="btn-secondary" disabled={busy} onClick={async()=>{if(await confirm({title:account.suspended?'Restore this account?':'Suspend this account?',message:account.suspended?'This account will be able to sign in again.':'This ends their sessions and hides their public listings.',confirmLabel:account.suspended?'Restore account':'Suspend account',tone:account.suspended?'default':'danger'}))mutate('/accounts/'+account.id,{suspended:!account.suspended},'PATCH');}}>{account.suspended?'Restore':'Suspend'}</button><button type="button" className="btn-secondary admin-delete-button" disabled={busy} onClick={async()=>{if(await confirm({title:'Delete this account permanently?',message:`This will permanently delete ${account.name} (${account.email}). Their sessions, shops and products will be removed, and their email address will be freed so they can create a fresh account with the same email if needed.`,confirmLabel:'Delete account',tone:'danger'}))mutate('/accounts/'+account.id,undefined,'DELETE');}}><Trash2 size={14} aria-hidden="true"/>Delete</button></div>}</article></div>)}</div>}
        {tab==='Shops'&&<>
          <div className="admin-section-actions"><p>Set up a storefront, give its owner access and choose when it goes public.</p><div><Link className="btn-secondary" to="/shops">View public shops<ArrowUpRight size={15}/></Link>{!editShop&&<button className="btn-primary" disabled={busy} onClick={()=>openEditor('Shops')}><Plus size={16}/>Add shop</button>}</div></div>
          {!editShop&&<>{data.some(shop=>!managed(shop,'owner_id'))&&<label className="shop-scope">Show<select aria-label="Shop list" value={shopScope} onChange={event=>setShopScope(event.target.value)}><option value="owned">Admin-created shops</option><option value="all">All marketplace shops</option></select></label>}{(publicShops.loading||publicShops.error)&&<div className="admin-public-check"><CheckCircle2 size={16}/><span>{publicShops.loading?'Checking what visitors can see…':'Public visibility could not be checked.'}</span>{publicShops.error&&<button disabled={busy} type="button" onClick={checkPublicShops}>Check public visibility</button>}</div>}</>}
          {editShop?<ShopEditor key={editShop.id||'new'} value={editShop} categories={siteContext.site.categories} busy={busy} onCancel={cancelEditor} onDelete={editShop.id?()=>deleteCatalogueItem('shops',editShop):undefined} onCredentials={editShop.owner_user_id&&editShop.owner_id!==user.id?()=>showOwnerCredentials(editShop):undefined} onSave={async value=>{if(await mutate('/catalogue/shops'+(editShop.id?'/'+editShop.id:''),value,editShop.id?'PATCH':'POST'))setEditShop(null);}}/>:<div className="admin-record-list">{rows.map(shop=><div className="admin-record" key={shop.id}><article className="ait-admin-row"><div className="admin-record-primary">{thumbnail(shop,Store)}<div className="admin-record-copy"><h3>{shop.name}</h3><p>{shop.category}{shop.location?' · '+shop.location:''}</p>{shop.subscription_amount_minor ? <p className="admin-record-price">AutoPay: {currency(shop.subscription_amount_minor)} / month</p> : null}<p className="admin-record-description">{shop.description||'No description added.'}</p>{shop.owner_id!==user.id&&<p className="admin-owner-label"><strong>{shop.owner_name||"Shop owner"}</strong>{shop.owner_email&&<> &middot; {shop.owner_email}</>}{shop.owner_user_id&&<> &middot; <code>{shop.owner_user_id}</code></>}{shop.owner_password_pending&&<> &middot; <span>First login pending</span></>}</p>}<ShopPublicStatus shop={shop} state={publicShops} categories={siteContext.site.categories}/></div></div><div className="ait-actions">{shop.owner_user_id&&shop.owner_id!==user.id&&<button type="button" disabled={busy} className="btn-secondary" onClick={()=>showOwnerCredentials(shop)}><KeyRound size={14} aria-hidden="true"/>Owner login details</button>}{managed(shop,'owner_id')&&<><button disabled={busy} className="btn-secondary" onClick={()=>openEditor('Shops',shop)}>Edit shop</button><button disabled={busy} className="btn-secondary" onClick={()=>addProductToShop(shop)}>Add product</button></>}<button disabled={busy} className="btn-secondary" onClick={async()=>{const active=shop.status==='active'&&!shop.moderated_hidden;if(active&&!await confirm({title:'Hide this shop?',message:'This shop and its linked listings will be hidden from public browsing.',confirmLabel:'Hide shop',tone:'danger'}))return;mutate('/shops/'+shop.id,{status:active?'inactive':'active'},'PATCH');}}>{shop.status==='active'&&!shop.moderated_hidden?'Hide shop':shop.admin_managed?'Publish shop':'Publish paid shop'}</button><button type="button" disabled={busy||fetching} className="btn-secondary admin-delete-button" onClick={()=>deleteCatalogueItem('shops',shop)}><Trash2 size={14} aria-hidden="true"/>Delete shop</button>{!publicShops.loading&&!publicShops.error&&publicShops.items.some(item=>item.id===shop.id)&&<Link className="ait-link" to={publicShopHref(shop.id)}>View public shop<ArrowUpRight size={15}/></Link>}</div></article>{family('shops',shop)}</div>)}</div>}
        </>}
        {tab==='Listings'&&<>
          <div className="admin-section-actions"><p>Manage products and services with photos, pricing and specifications.</p><div><Link className="btn-secondary" to="/listings">View public listings<ArrowUpRight size={15}/></Link><button className="btn-primary" disabled={busy} onClick={()=>openEditor('Listings')}><Plus size={16}/>Add product or service</button></div></div>
          {editListing?<ListingEditor key={(editListing.id||'new')+':'+editorEpoch} value={editListing} categories={siteContext.site.categories} user={user} busy={busy} savedProductNotice={productNotice} onCancel={cancelEditor} onSave={saveListing}/>:<div className="admin-record-list">{rows.map(item=><div className="admin-record" key={item.id}><article className="ait-admin-row"><div className="admin-record-primary">{thumbnail(item,Package)}<div className="admin-record-copy"><h3>{item.title}</h3><div className="admin-record-price"><ListingPrice item={item}/></div><div className="admin-record-meta">{badge(item)}<span className="admin-type">{item.category}</span><span className="admin-type">{item.kind||'product'}</span></div><p className="admin-record-description">{item.description}</p><small>{item.seller_name}</small></div></div><div className="ait-actions">{managed(item,'seller_id')?<button disabled={busy} className="btn-secondary" onClick={()=>openEditor('Listings',item)}>Edit product or service</button>:<button disabled={busy} className="btn-secondary" onClick={async()=>{const title=await prompt({title:'Edit listing title',inputLabel:'Listing title',initialValue:item.title,required:true,minLength:3,maxLength:150,confirmLabel:'Save title'});if(title&&title.trim().length>=3)mutate('/listings/'+item.id,{title:title.trim(),status:item.status==='active'?'active':'removed'},'PATCH');else if(title!==null)setError('Use at least three characters for the listing title.');}}>Edit title</button>}<button disabled={busy} className="btn-secondary" onClick={async()=>{if(await confirm({title:item.status==='active'?'Hide this product?':'Make this product public?',message:item.status==='active'?'Customers will no longer see this product in public browsing.':'This product will be visible to customers in public browsing.',confirmLabel:item.status==='active'?'Hide product':'Make public',tone:item.status==='active'?'danger':'default'}))mutate('/listings/'+item.id,{status:item.status==='active'?'removed':'active'},'PATCH');}}>{item.status==='active'?'Hide product':'Make public'}</button><button type="button" disabled={busy||fetching} className="btn-secondary admin-delete-button" onClick={()=>deleteCatalogueItem('listings',item)}><Trash2 size={14} aria-hidden="true"/>Delete product</button>{item.status==='active'&&<Link className="ait-link" to={'/listings/'+item.id}>View listing ↗</Link>}</div></article>{family('listings',item)}</div>)}</div>}
        </>}
        {tab==='Subscriptions'&&<><div className="admin-informational">Publishing access for customer registrations comes from verified payments. Review the subscription status and paid-through date below.</div><div className="admin-record-list">{rows.map(item=><div className="admin-record" key={item.id}><article className="ait-admin-row"><div className="admin-record-copy"><h3>{item.shop_name}</h3><p>{item.email}</p><p className="admin-record-price">{currency(item.amount_minor)} / {item.period}</p><small>Paid through {date(item.paid_until)}</small><small>{item.provider_id||'Provider creation pending'}</small></div>{badge(item)}</article></div>)}</div></>}
        {tab==='Reports'&&rows.map(report=><SafetyReport key={report.id} report={report} busy={busy} onReview={(id,remove)=>mutate('/reports/'+id,{remove})} onSuspend={id=>mutate('/accounts/'+id,{suspended:true},'PATCH')}/>)}
        {tab==='Family reports'&&<><div className="admin-informational">Review the current catalogue item before resolving a family browsing report. Removing an item here removes it from family browsing.</div>{rows.map(report=><article className="ait-panel" key={report.id}><h3>{report.target_label||'Catalogue item'}</h3><div className="admin-record-meta">{badge(report)}<span className="admin-type">{report.target_type}</span></div><p>Reason: {report.reason} · {date(report.created_at)}</p><small>Reference: {report.target_id}</small>{report.status==='pending'&&<div className="ait-actions"><button disabled={busy} className="btn-primary" onClick={async()=>{if(await confirm({title:'Remove from family browsing?',message:'This item will be removed from family browsing and the report will be resolved.',confirmLabel:'Remove and resolve',tone:'danger'}))mutate('/family-reports/'+report.id+'/resolve',{remove:true});}}>Remove from family browsing and resolve</button><button disabled={busy} className="btn-secondary" onClick={()=>mutate('/family-reports/'+report.id+'/resolve',{remove:false})}>Mark reviewed</button></div>}</article>)}</>}
        {tab==='Assessments'&&<><div className="admin-informational">Small single-branch shops with up to 100 photos start at ₹499/month. Recommendations do not activate billing. Review larger shops, extra branches and storage-heavy categories here.</div>{rows.map(item=><QuoteReview key={item.shop_id+':'+item.revision+':'+editorEpoch+':'+JSON.stringify(item.suggestion)} item={item} busy={busy} onSuggest={()=>mutate('/assessments/'+item.shop_id+'/suggest',{})} onApprove={value=>mutate('/assessments/'+item.shop_id,value,'PUT')}/>)}</>}
        {tab==='Audit'&&<div className="admin-record-list">{rows.map((item,index)=><div className="admin-record" key={index}><article className="ait-admin-row"><div className="admin-record-copy"><h3>{item.action}</h3><p>{item.target}</p><small>{item.actor} · {date(item.created_at)}</small></div></article></div>)}</div>}
        {tab==='Pricing'&&<PricingEditor key={data.version+':'+editorEpoch} data={data} busy={busy} onSave={value=>mutate('/pricing',value,'PUT')}/>}
        {tab==='Storage'&&<section className="admin-workflows"><div className="admin-panel-heading"><h3>Shared image storage</h3><StatusBadge tone={data.usedBytes/data.limitBytes>=.9?'warning':'success'}>{data.usedBytes/data.limitBytes>=.9?'Nearly full':'Capacity available'}</StatusBadge></div><p><strong>{(data.usedBytes/1000000000).toFixed(3)} GB</strong> of {(data.limitBytes/1000000000).toFixed(0)} GB · {data.files} images</p><progress aria-label="Image storage usage" max={data.limitBytes} value={data.usedBytes} style={{width:'100%',accentColor:'#e75d3b'}}/><p className="admin-help-text">Uploads exceeding the image quota are blocked. Owner and support receive alerts at 90% and when full. Existing images are retained.</p></section>}
        {tab==='Activity'&&<><div className="admin-informational">Latest application write requests. Request bodies, passwords and payment secrets are excluded.</div><div className="admin-record-list">{rows.map((item,index)=><div className="admin-record" key={index}><article className="ait-admin-row"><div className="admin-record-copy"><h3>{item.action} {item.route}</h3><small>{item.actor||'Unauthenticated'} · {date(item.created_at)}</small></div><StatusBadge tone={Number(item.status)>=400?'danger':'success'}>HTTP {item.status}</StatusBadge></article></div>)}</div></>}
        {Array.isArray(data)&&!rows.length&&!editing&&<AdminEmpty filtered={isFiltered} onClear={clearFilters}>{tab==='Reports'||tab==='Family reports'?'No reports need your attention.':tab==='Shops'?'Create your first shop to start building the public directory.':tab==='Listings'?'Add a product or service to start your catalogue.':undefined}</AdminEmpty>}
        {Array.isArray(data)&&pagedTabs.includes(tab)&&!editing&&<nav className="admin-pagination" aria-label="Record pages"><span>{data.length?`Records ${offset+1}–${offset+data.length}`:'No records on this page'} · Page {offset/100+1}</span><div><button className="btn-secondary" disabled={busy||fetching||offset===0} onClick={()=>changePage(Math.max(0,offset-100))}>Previous</button><button className="btn-secondary" disabled={busy||fetching||data.length<100||offset>=100000} onClick={()=>changePage(offset+100)}>Next</button></div></nav>}
      </>}
    </div></div>
  </section>;
}

function CategoryEditor({value,busy,onSave,onCancel}){
  const [form,setForm]=useState({...blankCategory,...value}),[error,setError]=useState(''),[uploading,setUploading]=useState(false),[slugEdited,setSlugEdited]=useState(Boolean(value.id));
  const slugFor=name=>name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60).replace(/-$/,'');
  const field=key=>({value:form[key],onChange:event=>{const next=event.target.value;if(key==='slug')setSlugEdited(true);setForm(previous=>({...previous,[key]:key==='position'?Number(next):next,...(key==='name'&&!slugEdited?{slug:slugFor(next)}:{})}));}});
  async function upload(event){
    const file=event.target.files?.[0];if(!file)return;if(file.size>8*1024*1024){setError('Choose an image smaller than 8 MB.');event.target.value='';return;}setUploading(true);setError('');
    try{const image_path=await uploadImage(file);setForm(previous=>({...previous,image_path}));}
    catch(error){setError(error.message);}finally{setUploading(false);event.target.value='';}
  }
  return <form className="ait-panel ait-form" onInvalidCapture={()=>setError('Check the highlighted fields before saving.')} onSubmit={event=>{event.preventDefault();if(!busy&&!uploading){const {name,slug,subtitle,image_path,position,enabled,module}=form;if(name.trim().length<2){setError('Use at least two characters for the category name.');return;}if(!/^[a-z0-9-]{2,60}$/.test(slug)){setError('Use 2–60 lowercase letters, numbers or hyphens for the URL slug.');return;}setError('');onSave({name:name.trim(),slug,subtitle:subtitle.trim(),image_path,position,enabled,module});}}}>
    <div className="admin-editor-heading"><div><h2>{value.id?'Edit category':'New category'}</h2><p>Choose a clear name, description and image to help customers find the right items.</p></div><StatusBadge tone={form.enabled?'success':'neutral'}>{form.enabled?'Visible':'Hidden'}</StatusBadge></div>
    <fieldset className="ait-listing-fields" disabled={busy||uploading}>
      <label>Name<input required minLength={2} maxLength={50} placeholder="e.g. Home and garden" {...field('name')}/></label>
      <label>URL slug<input aria-label="URL slug" required maxLength={60} pattern="[a-z0-9-]{2,60}" placeholder="e.g. home-and-garden" {...field('slug')}/><small>Generated from the name for a new category. You can edit it using lowercase letters, numbers and hyphens.</small></label>
      <label>Listing type<select {...field('module')}><option value="product">Products</option><option value="service">Services</option></select></label>
      <label>Subtitle<textarea aria-label="Subtitle" rows={3} maxLength={200} placeholder="A short description of this category" {...field('subtitle')}/><small>{form.subtitle.length}/200 characters</small></label>
      <label>Image address<input maxLength={500} {...field('image_path')}/></label>
      <label>Upload category image<input aria-label="Upload category image" type="file" accept="image/jpeg,image/png,image/webp" onChange={upload}/><small>JPEG, PNG or WebP · up to 8 MB</small></label>
      {form.image_path&&<img className="ait-listing-edit-photo" src={form.image_path} alt="Category preview"/>}
      <label>Display order<input type="number" required min={0} max={1000} {...field('position')}/></label>
      <label className="ait-checkbox"><input type="checkbox" checked={form.enabled} onChange={event=>setForm(previous=>({...previous,enabled:event.target.checked}))}/>Visible to visitors</label>
    </fieldset>
    {uploading&&<p role="status">Uploading image…</p>}{error&&<p className="ait-error" role="alert">{error}</p>}
    <div className="admin-editor-actions"><div className="ait-actions"><button className="btn-primary" disabled={busy||uploading}>{busy?'Saving…':'Save category'}</button><button type="button" className="btn-secondary" disabled={busy||uploading} onClick={onCancel}>Cancel</button></div><small>Visible categories appear in the public catalogue after saving.</small></div>
  </form>;
}

function WebsiteEditor({data,categories,busy,onSave}){
  const {confirm}=useDialogs();
  const [form,setForm]=useState(data.value),[active,setActive]=useState(0),[imageError,setImageError]=useState(''),[uploading,setUploading]=useState(false);
  const section=form.sections[active];
  function updateSection(key,value){const id=section.id;setForm(previous=>({...previous,sections:previous.sections.map(item=>item.id===id?{...item,[key]:value}:item)}));}
  function move(direction){const target=active+direction;if(target<0||target>=form.sections.length)return;setForm(previous=>{const sections=[...previous.sections];[sections[active],sections[target]]=[sections[target],sections[active]];return {...previous,sections};});setActive(target);}
  async function upload(event){
    const file=event.target.files?.[0];if(!file)return;
    if(file.size>8*1024*1024){setImageError('Choose an image smaller than 8 MB.');event.target.value='';return;}
    const sectionId=section.id;setUploading(true);setImageError('');
    try{const image=await uploadImage(file);setForm(previous=>({...previous,sections:previous.sections.map(item=>item.id===sectionId?{...item,image}:item)}));}
    catch(error){setImageError(error.message);}finally{setUploading(false);event.target.value='';}
  }
  async function submit(event){event.preventDefault();if(busy||uploading)return;if(form.sections.some(item=>item.type==='steps'&&(item.items||[]).length>12)){setImageError('Use at most 12 steps in each Steps component.');return;}if(await confirm({title:'Publish website changes?',message:'Your updated content, images and page layout will become visible on the public website.',confirmLabel:'Publish changes'}))onSave({value:form,revision:data.revision});}
  return <form className="ait-form" onSubmit={submit}>
    <div className="admin-informational">Save to publish your content, images, visibility and section order. Category changes are also used by the connected catalogue.</div>
    <fieldset className="ait-listing-fields" disabled={busy||uploading}>
      <section className="ait-panel ait-form"><h3>Brand and support</h3><label>Footer description<textarea maxLength={3000} rows={3} value={form.tagline} onChange={event=>setForm(previous=>({...previous,tagline:event.target.value}))}/></label><div className="ait-form-grid"><label>Support email<input type="email" value={form.supportEmail} onChange={event=>setForm(previous=>({...previous,supportEmail:event.target.value}))}/></label><label>Support phone<input maxLength={30} value={form.supportPhone} onChange={event=>setForm(previous=>({...previous,supportPhone:event.target.value}))}/></label></div><div className="ait-actions">{Object.entries(form.theme).map(([key,value])=><label key={key}>{key}<input type="color" value={value} onChange={event=>setForm(previous=>({...previous,theme:{...previous.theme,[key]:event.target.value}}))}/></label>)}</div></section>
      <section className="ait-panel ait-form"><h3>Public business details and refund timelines</h3><p>Shown on About, Contact and policy pages. Keep these details consistent with your payment account.</p><label>Business operator name<input maxLength={200} value={form.businessName||''} onChange={event=>setForm(previous=>({...previous,businessName:event.target.value}))}/></label><label>Business address<textarea maxLength={1000} value={form.businessAddress||''} onChange={event=>setForm(previous=>({...previous,businessAddress:event.target.value}))}/></label><div className="ait-form-grid">{[['refundReviewDays','Refund review (business days)'],['refundInitiationDays','Approved refund initiation (business days)'],['refundProcessingDays','Usual bank credit upper estimate (business days)']].map(([key,label])=><label key={key}>{label}<input type="number" min={1} max={30} step={1} value={form[key]??''} onChange={event=>setForm(previous=>({...previous,[key]:event.target.value===''?undefined:Number(event.target.value)}))}/></label>)}</div></section>
      <section className="ait-panel ait-form"><h3>Popular items</h3><p>Make frequently searched categories easy to reach.</p>{form.popular.map((item,index)=><div className="ait-form-grid" key={index}><label>Popular label {index+1}<input required maxLength={50} aria-label={`Popular label ${index+1}`} value={item.label} onChange={event=>setForm(previous=>({...previous,popular:previous.popular.map((value,i)=>i===index?{...value,label:event.target.value}:value)}))}/></label><div className="ait-actions"><select aria-label={`Popular category ${index+1}`} value={item.category} onChange={event=>setForm(previous=>({...previous,popular:previous.popular.map((value,i)=>i===index?{...value,category:event.target.value}:value)}))}>{categories.map(name=><option key={name}>{name}</option>)}</select><button type="button" className="ait-link" onClick={()=>setForm(previous=>({...previous,popular:previous.popular.filter((_,i)=>i!==index)}))}>Remove</button></div></div>)}<button type="button" className="btn-secondary" disabled={form.popular.length>=20} onClick={()=>setForm(previous=>({...previous,popular:[...previous.popular,{label:'New item',category:categories[0]||''}]}))}>Add popular item</button><small>{form.popular.length}/20 popular items</small></section>
      <section className="ait-panel ait-form"><h3>Page components</h3><p>Choose a component below to edit its content. Move it up or down to change the public page order.</p><div className="ait-section-picker">{form.sections.map((item,index)=><button type="button" key={item.id} className={active===index?'selected':''} aria-pressed={active===index} onClick={()=>setActive(index)}>{index+1}. {item.type} · {item.enabled?'On':'Off'}</button>)}</div>
        <button type="button" className="btn-secondary" disabled={form.sections.length>=30} onClick={()=>{setForm(previous=>({...previous,sections:[...previous.sections,{id:'section-'+crypto.randomUUID(),type:'text',enabled:true,title:'New component',body:''}]}));setActive(form.sections.length);}}>Add component</button>
        {section?<>
          <label>Component type<select value={section.type} onChange={event=>updateSection('type',event.target.value)}>{['hero','categories','listings','steps','text','banner','downloads','shops'].map(type=><option key={type}>{type}</option>)}</select></label>
          <label>Title<textarea aria-label="Title" required maxLength={3000} value={section.title} onChange={event=>updateSection('title',event.target.value)}/></label>
          <label>Description<textarea aria-label="Description" maxLength={3000} rows={4} value={section.body} onChange={event=>updateSection('body',event.target.value)}/></label>
          <label>Image address<input maxLength={500} value={section.image||''} onChange={event=>updateSection('image',event.target.value)}/></label>
          <label>Upload component image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload}/></label>
          {section.image&&<div className="ait-catalogue-photo"><img src={section.image} alt="Component preview"/><button type="button" className="ait-link" onClick={()=>updateSection('image','')}>Remove component image</button></div>}
          {section.type==='listings'&&<label>Category filter<select value={section.category||''} onChange={event=>updateSection('category',event.target.value)}><option value="">All categories</option>{categories.map(name=><option key={name}>{name}</option>)}</select></label>}
          {section.type==='steps'&&<label>Steps (one title | description per line)<textarea rows={5} value={(section.items||[]).map(item=>item.title+' | '+item.body).join('\n')} onChange={event=>updateSection('items',event.target.value.split('\n').filter(Boolean).map(line=>{const [title,...body]=line.split('|');return{title:title.trim(),body:body.join('|').trim()};}))}/></label>}
          <div className="ait-form-grid"><label>Button label<input maxLength={80} value={section.button||''} onChange={event=>updateSection('button',event.target.value)}/></label><label>Button destination<input maxLength={500} placeholder="e.g. /shops" value={section.link||''} onChange={event=>updateSection('link',event.target.value)}/></label></div>
          <label className="ait-checkbox"><input type="checkbox" checked={section.enabled} onChange={event=>updateSection('enabled',event.target.checked)}/>Show component</label>
          <div className="ait-actions"><button type="button" className="btn-secondary" onClick={()=>move(-1)} disabled={active===0}>Move up</button><button type="button" className="btn-secondary" onClick={()=>move(1)} disabled={active===form.sections.length-1}>Move down</button><button type="button" className="ait-link" onClick={async()=>{if(await confirm({title:'Remove this component?',message:'This removes the component from your draft. Publish website changes to make the removal public.',confirmLabel:'Remove component',tone:'danger'})){setForm(previous=>({...previous,sections:previous.sections.filter((_,i)=>i!==active)}));setActive(0);}}}>Remove component</button></div>
        </>:<p>Add a component to start building the page.</p>}
        <small>{form.sections.length}/30 components</small>
      </section>
    </fieldset>
    {uploading&&<p role="status">Uploading image…</p>}{imageError&&<p className="ait-error" role="alert">{imageError}</p>}
    <div className="admin-editor-actions"><button className="btn-primary" disabled={busy||uploading}>{busy?'Publishing…':'Publish website changes'}</button><small>These changes become visible on your public website.</small></div>
  </form>;
}

function PricingEditor({data,busy,onSave}){
  const {confirm}=useDialogs();
  const [fees,setFees]=useState({...data.tiers,branch:data.additionalBranchAmountMinor});
  return <form className="ait-form" onSubmit={async event=>{event.preventDefault();if(busy)return;if(await confirm({title:'Publish these monthly fees?',message:'These fees will apply to new quotes. Existing checkouts and mandates retain their accepted price.',confirmLabel:'Publish fees'}))onSave({approved:true,version:'owner-'+Date.now(),period:'month',currency:'INR',startingAmountMinor:fees.small,tiers:{small:fees.small,medium:fees.medium,large:fees.large},additionalBranchAmountMinor:fees.branch,categories:data.categories||[]});}}>
    <h2>Monthly registration fees</h2><p>One branch is included. Additional branches add the fee below. Existing mandates are not repriced.</p>
    {Object.entries(fees).map(([key,value])=><label key={key}>{key==='branch'?'Each additional branch':key[0].toUpperCase()+key.slice(1)+' shop'} (₹ / month)<input type="number" required min={key==='branch'?0:499} max={100000} step="0.01" value={value/100} onChange={e=>setFees({...fees,[key]:Math.round(Number(e.target.value)*100)})}/></label>)}
    <button className="btn-primary" disabled={busy}>Publish fees</button><p><Link to="/support">Open support inbox</Link></p>
  </form>;
}
