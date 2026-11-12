import {useState} from 'react';
import {Link} from 'react-router-dom';
import {Activity,ArrowUpRight,ChevronDown,ClipboardCheck,Coins,FolderTree,HardDrive,History,Inbox,LayoutDashboard,MessageCircle,Package,Palette,RefreshCw,Search,Shield,ShieldCheck,Store,Users,Wallet} from 'lucide-react';

const primarySections=[['Overview',LayoutDashboard],['Shops',Store],['Listings',Package],['Categories',FolderTree]];
export const adminGroups=[
  {label:'Website and people',items:[['Website',Palette],['Accounts',Users]]},
  {label:'Business settings',items:[['Subscriptions',Wallet],['Pricing',Coins],['Assessments',ClipboardCheck]]},
  {label:'Safety and activity',items:[['Reports',Shield],['Family reports',ShieldCheck],['Storage',HardDrive],['Activity',Activity],['Audit',History]]},
];
const sectionLabel=name=>name==='Listings'?'Products':name;
export const pagedTabs=['Accounts','Shops','Listings','Subscriptions','Audit','Activity','Assessments','Family reports'];
const tabCopy={
  Overview:'Keep shops, owners and products moving from setup to public discovery.',
  Shops:'Create shops, set up owner logins and control storefront visibility.',
  Listings:'Add products or services to your shops.',
  Categories:'Organize the public catalogue and choose which categories visitors can browse.',
  Website:'Edit the content, appearance and sections of your public website.',
  Accounts:'Review registered accounts and manage access when needed.',
  Subscriptions:'Review payment records and the paid-through date for each shop.',
  Pricing:'Set monthly registration fees for new customer quotes.',
  Assessments:'Review shop details and approve a monthly quote.',
  Reports:'Review safety reports and take action on reported content or accounts.',
  'Family reports':'Review reports from family browsing and resolve content concerns.',
  Storage:'Monitor your shared image storage and upload capacity.',
  Activity:'Review recent application write requests and their response status.',
  Audit:'See who changed marketplace content, access and settings.',
};

export function AdminNavigation({tab,busy,onSelect,user}){
  const advancedActive=!primarySections.some(([name])=>name===tab);
  const [advancedOpen,setAdvancedOpen]=useState(false);
  const navigationButton=([name,Icon])=><button key={name} type="button" disabled={busy} className={tab===name?'selected':''} aria-current={tab===name?'page':undefined} onClick={()=>onSelect(name)}><Icon size={18} aria-hidden="true"/><span>{sectionLabel(name)}</span></button>;
  return <>
    <div className="admin-mobile-controls">
      <div className="admin-mobile-navigation"><label>Go to<select aria-label="Admin section" value={advancedActive?'':tab} disabled={busy} onChange={event=>{if(event.target.value)onSelect(event.target.value);}}>{advancedActive&&<option value="" disabled>{tab}</option>}{primarySections.map(([name])=><option value={name} key={name}>{sectionLabel(name)}</option>)}</select></label><Link to="/messages" className="admin-mobile-inbox"><Inbox size={19}/>Messages</Link></div>
      <details className="admin-mobile-advanced" open={advancedActive||advancedOpen}><summary onClick={event=>{event.preventDefault();setAdvancedOpen(previous=>!previous);}}>Advanced settings<ChevronDown size={15}/></summary><label>Choose a setting<select aria-label="Advanced admin section" value={advancedActive?tab:''} disabled={busy} onChange={event=>{if(event.target.value)onSelect(event.target.value);}}><option value="">Choose a setting</option>{adminGroups.map(group=><optgroup label={group.label} key={group.label}>{group.items.map(([name])=><option value={name} key={name}>{name}</option>)}</optgroup>)}</select></label></details>
    </div>
    <aside className="admin-sidebar"><nav aria-label="Owner controls"><div className="admin-nav-group">{primarySections.map(navigationButton)}<Link className="admin-nav-messages" to="/messages"><MessageCircle size={18}/><span>Messages</span></Link></div><details className="admin-advanced-navigation" open={advancedActive||advancedOpen}><summary onClick={event=>{event.preventDefault();setAdvancedOpen(previous=>!previous);}}>Advanced settings<ChevronDown size={15}/></summary>{adminGroups.map(group=><div className="admin-nav-group" key={group.label}><p>{group.label}</p>{group.items.map(navigationButton)}</div>)}</details></nav><div className="admin-sidebar-account"><span className="admin-avatar">{(user.name||'A').slice(0,1).toUpperCase()}</span><div><strong>Administrator</strong><small>{user.email}</small></div></div></aside>
  </>;
}

export function AdminPageHeading({tab,updatedAt,fetching,busy,onRefresh,draftDirty}){
  return <div className="admin-page-heading"><div><p className="admin-breadcrumb">Workspace <span>/</span> {tab}</p><h2>{sectionLabel(tab)}</h2><p>{tabCopy[tab]}</p>{draftDirty&&<span className="admin-unsaved" role="status">Unsaved changes</span>}</div><div className="admin-refresh"><button type="button" className="btn-secondary" onClick={onRefresh} disabled={busy||fetching}><RefreshCw size={16} className={fetching?'admin-spin':''}/>{fetching?'Refreshing…':'Refresh records'}</button>{updatedAt&&<small>Updated {new Date(updatedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</small>}</div></div>;
}

export function StatusBadge({children,tone='neutral'}){
  return <span className={'admin-status admin-status-'+tone}><span aria-hidden="true"/>{children}</span>;
}

export function recordStatus(tab,item){
  if(tab==='Categories')return item.enabled?'visible':'hidden';
  if(tab==='Accounts')return item.suspended?'suspended':'active';
  if(tab==='Shops'&&item.moderated_hidden)return 'inactive';
  return item.status===undefined||item.status===null?'':String(item.status);
}
export const statusLabel=value=>({active:'Active',inactive:'Hidden',removed:'Hidden',visible:'Visible',hidden:'Hidden',suspended:'Suspended',pending_payment:'Pending payment',pending:'Pending',paid:'Paid',approved:'Approved',reviewed:'Reviewed',cancelled:'Cancelled',expired:'Expired',failed:'Failed',completed:'Completed',captured:'Captured'}[value]||value.replaceAll('_',' '));
export const statusTone=value=>['active','visible','paid','approved','captured','reviewed'].includes(value)?'success':['pending','pending_payment','created','authorized'].includes(value)?'warning':['suspended','failed','removed'].includes(value)?'danger':'neutral';

export function RecordToolbar({tab,query,setQuery,status,setStatus,data,shown}){
  const statuses=[...new Set(data.map(item=>recordStatus(tab,item)).filter(Boolean))];
  return <div className="admin-record-toolbar"><div className="admin-record-filters"><label className="admin-search"><Search size={18} aria-hidden="true"/><input aria-label="Search this page" type="search" placeholder={'Search '+tab.toLowerCase()+' on this page'} value={query} onChange={event=>setQuery(event.target.value)}/></label>{statuses.length>0&&<select aria-label="Filter by status" value={status} onChange={event=>setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map(value=><option key={value} value={value}>{statusLabel(value)}</option>)}</select>}{(query||status)&&<button type="button" className="ait-link" onClick={()=>{setQuery('');setStatus('');}}>Clear filters</button>}</div><p>{shown} of {data.length} loaded records shown. <span>Filters apply to this page.</span></p></div>;
}

export function AdminEmpty({filtered=false,onClear,children}){
  return <div className="admin-empty"><Search size={28} aria-hidden="true"/><h3>{filtered?'No matching records':'Nothing here yet'}</h3><p>{filtered?'Try another search or clear the filters on this page.':children||'Records will appear here when available.'}</p>{filtered&&<button className="btn-secondary" onClick={onClear}>Clear filters</button>}</div>;
}

export function OverviewCards({data,onSelect,onCreate}){
  const counts=[['All shops',data.shops,'Shops'],['Public shops',data.publicShops,'Shops'],['Live products',data.listings,'Listings'],['Accounts',data.accounts,'Accounts']].filter(([,value])=>value!==undefined&&value!==null);
  return <div className="admin-simple-overview">
    <section className="admin-onboarding-hero"><div><p className="admin-kicker">GROW YOUR LOCAL MARKETPLACE</p><h3>A new shop starts with its owner.</h3><p>Create the storefront and owner login together. Owners can then manage categories, prices, visibility and customer conversations.</p><button type="button" className="btn-primary" onClick={()=>onCreate('Shops')}><Store size={17}/>Create shop & owner<ArrowUpRight size={16}/></button></div><ol><li><span>1</span><div><strong>Create a shop</strong><small>Add shop details and its owner.</small></div></li><li><span>2</span><div><strong>Share owner login</strong><small>Unique ID and first-login password reset.</small></div></li><li><span>3</span><div><strong>Publish products</strong><small>Owners choose what customers see.</small></div></li></ol></section>
    {counts.length>0&&<div className="admin-simple-counts">{counts.map(([label,count,target])=><button key={label} onClick={()=>onSelect(target)}><strong>{Number(count).toLocaleString('en-IN')}</strong><span>{label}</span><ArrowUpRight size={15}/></button>)}</div>}
    <section className="admin-start"><h3>What would you like to do?</h3><div className="admin-start-actions">
      <button className="admin-start-card admin-start-primary" onClick={()=>onCreate('Shops')}><span className="admin-start-icon"><Store size={25}/></span><strong>Onboard a shop owner</strong><span>Storefront, owner and secure login.</span><span className="admin-start-link">Create shop<ArrowUpRight size={16}/></span></button>
      <button className="admin-start-card" onClick={()=>onCreate('Listings')}><span className="admin-start-icon"><Package size={25}/></span><strong>Add product</strong><span>Photo, price and details.</span><span className="admin-start-link">Create product<ArrowUpRight size={16}/></span></button>
      <Link className="admin-start-card" to="/shops"><span className="admin-start-icon"><Store size={25}/></span><strong>View public shops</strong><span>See the directory your customers see.</span><span className="admin-start-link">Open directory<ArrowUpRight size={16}/></span></Link>
    </div></section>
    <section className="admin-simple-inbox"><span className="admin-simple-inbox-icon"><MessageCircle size={25}/></span><div><h3>Conversations that reach the right person</h3><p>Shop and product chats connect to their owner. Review your own conversations in Messages.</p></div><Link className="btn-primary" to="/messages">Open Messages<ArrowUpRight size={16}/></Link></section>
    {Number(data.reports)>0&&<button type="button" className="admin-review-callout" onClick={()=>onSelect('Reports')}><Shield size={20}/><span><strong>{data.reports} reports need review</strong><small>Review reported content and keep the marketplace useful.</small></span><ArrowUpRight size={18}/></button>}
  </div>;
}
