import {Link} from 'react-router-dom';
import {AlertCircle,ArrowUpRight,CheckCircle2,EyeOff,RefreshCw} from 'lucide-react';
import './ShopPublication.css';

export const publicShopHref=id=>'/shops/'+encodeURIComponent(id);
export function publicShopStatus(shop,state,categories){
  if(shop.status!=='active'||shop.moderated_hidden)return {kind:'draft',title:'Draft · hidden from visitors',detail:'Publish this shop when it is ready.'};
  if(state.loading)return {kind:'checking',title:'Checking public visibility…',detail:''};
  if(state.error)return {kind:'unknown',title:'Visibility not confirmed',detail:'The shop directory could not be checked. Try again to confirm what visitors see.'};
  if(state.items.some(item=>item.id===shop.id))return {kind:'public',title:'Public · visible to everyone',detail:'Visitors can find this shop in the public Shops directory.'};
  if(!categories.some(category=>category.name===shop.category&&category.enabled!==false))return {kind:'missing',title:'Not visible to visitors',detail:'Its category is hidden or unavailable. Enable the category or choose a visible one.'};
  return {kind:'missing',title:'Not in the public directory',detail:shop.admin_managed?'The shop is saved, but public visibility has not been confirmed. Check again or review its details.':'This shop uses the business subscription publishing rules.'};
}
export function ShopPublicStatus({shop,state,categories}){
  const status=publicShopStatus(shop,state,categories),Icon=status.kind==='public'?CheckCircle2:status.kind==='draft'?EyeOff:status.kind==='checking'?RefreshCw:AlertCircle;
  return <div className={'shop-public-status is-'+status.kind}><p><Icon size={16} aria-hidden="true"/><strong>{status.title}</strong></p>{status.detail&&<small>{status.detail}</small>}</div>;
}
export function ShopSavedNotice({notice,onAddProducts,onCheck}){
  const confirmed=notice.kind==='public',draft=notice.kind==='draft';
  return <div className={'shop-saved-notice is-'+notice.kind} role="status"><div>{confirmed?<CheckCircle2 size={23}/>:draft?<EyeOff size={23}/>:<AlertCircle size={23}/>}<div><h3>{confirmed?'Your shop is now public':draft?'Shop saved as a draft':'Shop saved · visibility needs checking'}</h3><p><strong>{notice.name}</strong>{confirmed?' is visible to visitors in Shops.':draft?' is hidden from visitors until you publish it. You can prepare its products as drafts now.':'. '+notice.detail}</p></div></div><div className="shop-saved-actions">{confirmed&&<Link className="btn-primary" to={publicShopHref(notice.id)}>View public shop<ArrowUpRight size={16}/></Link>}<button type="button" className={confirmed?'btn-secondary':'btn-primary'} onClick={()=>onAddProducts(notice)}>Add products to this shop</button>{!confirmed&&!draft&&<button type="button" className="btn-secondary" onClick={onCheck}>Check public visibility</button>}</div></div>;
}
