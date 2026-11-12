import {isDemoCatalogueItem} from '../../catalogueAccess';
import {formatProductAmount,getProductPricing} from '../../productPricing';
import './ListingPrice.css';

export default function ListingPrice({item,className=''}){
  if(isDemoCatalogueItem(item))return <div className={'product-price '+className}><strong>Demo only — not for sale</strong></div>;
  const pricing=getProductPricing(item);
  if(pricing.price===null)return <div className={'product-price '+className}><strong>{item?.formatted_price||'Price unavailable'}</strong></div>;
  return <div className={'product-price '+className}>
    <strong className="product-price-current" aria-label={(pricing.hasOffer?'Offer price ':'Price ')+formatProductAmount(pricing.price)}>{formatProductAmount(pricing.price)}</strong>
    {pricing.hasOffer?<span className="product-price-mrp"><span>MRP</span><del aria-label={'MRP '+formatProductAmount(pricing.mrp)}>{formatProductAmount(pricing.mrp)}</del><small>Offer price</small></span>:pricing.hasMrp&&<span className="product-price-label">MRP</span>}
  </div>;
}
