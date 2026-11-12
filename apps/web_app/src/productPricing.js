export const MRP_KEY='MRP';
export const OFFER_PRICE_KEY='Offer price';
export const MAX_PRODUCT_PRICE=99999999999;

export function parseProductAmount(value){
  if(!['number','string'].includes(typeof value)||String(value).trim()==='')return null;
  const amount=Number(value);
  return Number.isFinite(amount)&&amount>=0&&amount<=MAX_PRODUCT_PRICE&&Number(amount.toFixed(2))===amount?(amount===0?0:amount):null;
}

// The API's price remains the actual selling price, including sorting and chat context.
// MRP is explicitly entered by the administrator; legacy prices never invent a discount.
export function getProductPricing(item){
  const price=parseProductAmount(item?.price),declaredMrp=parseProductAmount(item?.specifications?.[MRP_KEY]);
  const hasMrp=price!==null&&declaredMrp!==null&&declaredMrp>=price;
  const mrp=hasMrp?declaredMrp:price;
  const hasOffer=hasMrp&&mrp>price;
  const savings=hasOffer?Number((mrp-price).toFixed(2)):0;
  const discountPercent=hasOffer&&mrp>0?Math.round(savings/mrp*100):0;
  return {price,mrp,hasMrp,hasOffer,savings,discountPercent};
}

export const formatProductAmount=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:0,maximumFractionDigits:2}).format(value);
