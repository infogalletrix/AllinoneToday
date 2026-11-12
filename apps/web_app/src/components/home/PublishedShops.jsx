import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowUpRight,MapPin,Store} from 'lucide-react';
import {fetchShops,resolveImageUrl} from '../../api/client';
import {startPublicCatalogueRefresh} from '../../publicCatalogueRefresh';
import './PublishedShops.css';

export const publicShopLink=id=>'/shops/'+encodeURIComponent(id);
export default function PublishedShops({section}){
  const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>startPublicCatalogueRefresh({
    load:signal=>fetchShops({}, {signal}),
    onPending:()=>setLoading(true),
    onData:shops=>{setItems(shops);setError('');},
    onError:failure=>setError(failure.message),
    onSettled:()=>setLoading(false),
  }),[attempt]);
  return <section className="published-shops container" aria-labelledby="published-shops-title">
    <header className="published-shops-heading"><div><p className="ait-eyebrow">DISCOVER LOCAL BUSINESSES</p><h2 id="published-shops-title">{section?.title||'Explore local shops'}</h2><p>{section?.body||'Meet the businesses in your community and see what they offer.'}</p></div><Link to="/shops">View all shops<ArrowUpRight size={17}/></Link></header>
    {error&&<div className="published-shops-state" role="alert"><p>Shops could not be refreshed. {error}{items.length?' Your last loaded shops are still shown.':''}</p><button type="button" className="btn-secondary" onClick={()=>setAttempt(value=>value+1)}>Retry shops</button></div>}
    {loading&&!items.length?<p role="status">Loading shops…</p>:!items.length?(!error&&<div className="published-shops-state"><Store size={30}/><p>New shops will appear here as they are published.</p><Link className="ait-link" to="/shops">Browse shops</Link></div>):<div className="published-shops-grid">{items.slice(0,6).map(shop=><article className="published-shop" key={shop.id}>
      <Link className="published-shop-image" to={publicShopLink(shop.id)} aria-label={'View '+shop.name}>{shop.image_path?<img src={resolveImageUrl(shop.image_path)} alt="" loading="lazy"/>:<span><Store size={40} strokeWidth={1.4}/><small>Local business</small></span>}</Link>
      <div className="published-shop-body"><span className="published-shop-category">{shop.category}</span><h3><Link to={publicShopLink(shop.id)}>{shop.name}</Link></h3>{shop.location&&<p className="published-shop-location"><MapPin size={14}/>{shop.location}</p>}{shop.description&&<p className="published-shop-description">{shop.description}</p>}<div className="published-shop-bottom"><small>{Number(shop.listings_count)>0?shop.listings_count+' products and services':'Products coming soon'}</small><Link to={publicShopLink(shop.id)}>View shop<ArrowUpRight size={15}/></Link></div></div>
    </article>)}</div>}
  </section>;
}
