// One reviewed, first-party illustration. It is never a marketplace/seller row.
import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isSupportedCategory} from './offering.js';

export const demoListingId='00000000-0000-4000-8000-00000000d001';
export const demoMediaName=demoListingId+'.png';
const categoryId='cat_furniture';
const template=Object.freeze({
  id:demoListingId,title:'DEMO ONLY — Example chair',kind:'product',subcategory:'Demo illustration',
  price:0,formatted_price:'DEMO ONLY — NOT FOR SALE',location:'DEMO — no real location',
  seller_id:null,seller_name:'DEMO — no seller',shop_id:null,branch_id:null,
  description:'Illustrative sample only. This chair is not offered for sale. There is no seller, shop, availability, address or contact. Contact, messages, saving, reports and transactions are disabled for this read-only demonstration.',
  gallery:Object.freeze([]),specifications:Object.freeze({Availability:'DEMO ONLY — NOT FOR SALE'}),
  status:'demo',is_demo:true,is_featured:false,created_at:null,
});
const sha=value=>createHash('sha256').update(value).digest('hex');
export const demoReviewVersion=imageSha256=>sha(JSON.stringify({categoryId,template,imageSha256}));
export function loadDemoReviewManifest(file=new URL('./demo-catalogue-review.json',import.meta.url)){
  try{return JSON.parse(readFileSync(file,'utf8'));}catch{return {enabled:false};}
}
const approved=loadDemoReviewManifest();
const readMethods=new Set(['GET','HEAD','OPTIONS']);
const mutationRoutes=/^\/api\/(?:listings|vehicles|shops|conversations|inquiries|messages|favorites|profile\/favorites|blocks|reports|family(?:-|\/)reports|admin\/(?:listings|shops|family-review|family-reports)|billing|payments|checkout|cart|orders)(?:\/|$)/i;
function referencesDemo(value){
  if(typeof value==='string'){
    let decoded=value;
    for(let attempt=0;attempt<3;attempt++){
      if(decoded.toLowerCase().includes(demoListingId))return true;
      try{const next=decodeURIComponent(decoded);if(next===decoded)break;decoded=next;}catch{break;}
    }
    return false;
  }
  if(Array.isArray(value))return value.some(referencesDemo);
  if(value&&typeof value==='object')return Object.entries(value).some(([key,item])=>referencesDemo(key)||referencesDemo(item));
  return false;
}
const targetKey=/^(?:id|listing_?id|vehicle_?id|shop_?id|inquiry_?id|conversation_?id|account_?id|target_?id|request_?id|payment_?id|subscription_?id|item_?id|product_?id|seller_?id|owner_?id)$/i;
function bodyTargetsDemo(value){
  if(Array.isArray(value))return value.some(item=>item&&typeof item==='object'?bodyTargetsDemo(item):referencesDemo(item));
  if(value&&typeof value==='object')return Object.entries(value).some(([key,item])=>targetKey.test(key.replace(/\[[^\]]*\]/g,''))?referencesDemo(item):item&&typeof item==='object'&&bodyTargetsDemo(item));
  return false;
}
export function rejectDemoMutation(req,res,next){
  if(readMethods.has(req.method))return next();
  const url=req.originalUrl||req.url||req.path||'';
  let path=req.path||url.split('?')[0];
  for(let attempt=0;attempt<3;attempt++){try{const next=decodeURIComponent(path);if(next===path)break;path=next;}catch{break;}}
  if(referencesDemo(url)||(mutationRoutes.test(path)&&bodyTargetsDemo(req.body))){
    return res.status(403).json({success:false,code:'DEMO_READ_ONLY',message:'This is a read-only DEMO. Contact, messages, saving, reports and transactions are disabled.'});
  }
  return next();
}

export function createDemoCatalogue(pool,{manifest=approved,assetFile=new URL('./demo-assets/chair-demo.png',import.meta.url),publicUrl=process.env.PUBLIC_URL||'https://allinonetoday.com'}={}){
  const origin=new URL(publicUrl).origin;
  const approvedVersion=manifest?.enabled===true&&manifest.listingId===demoListingId&&manifest.categoryId===categoryId&&/^[a-f0-9]{64}$/.test(manifest.imageSha256||'')&&manifest.reviewedContentSha256===demoReviewVersion(manifest.imageSha256);
  async function image(){
    if(!approvedVersion)return null;
    try{const bytes=await readFile(assetFile);return sha(bytes)===manifest.imageSha256?bytes:null;}catch{return null;}
  }
  async function category(family){
    if(!approvedVersion||!await image())return null;
    const row=(await pool.query('SELECT c.id,c.name,c.slug,c.module,c.enabled,c.family_safe,EXISTS(SELECT 1 FROM listings l WHERE l.id=$2::uuid) AS reserved_id_exists FROM marketplace_categories c WHERE c.id=$1',[categoryId,demoListingId])).rows[0];
    if(!row||!row.enabled||row.reserved_id_exists||row.module!=='product'||!isSupportedCategory(row)||(family&&!row.family_safe))return null;
    return row;
  }
  async function readListing({family=false,query={}}={}){
    const row=await category(family);if(!row)return null;
    if(query.shop_id)return null;
    if(query.kind&&String(query.kind).toLowerCase()!==template.kind)return null;
    for(const [key,below]of[['min_price',true],['max_price',false]]){
      if(query[key]===undefined||query[key]==='')continue;
      const amount=Number(query[key]);if(!Number.isFinite(amount)||(below?template.price<amount:template.price>amount))return null;
    }
    if(query.category&&query.category!=='All'&&String(query.category).toLowerCase()!==row.name.toLowerCase())return null;
    const search=String(query.q||query.query||'').slice(0,100).toLowerCase();
    if(search&&!`${template.title} ${template.location}`.toLowerCase().includes(search))return null;
    if(query.location&&!template.location.toLowerCase().includes(String(query.location).slice(0,180).toLowerCase()))return null;
    return {...template,gallery:[],specifications:{...template.specifications},category:row.name,
      image_path:family?'/uploads/'+demoMediaName:origin+'/api/demo-media/'+demoMediaName};
  }
  async function mergeListings(rows,query={},options={}){
    if(rows.length>=100||rows.some(row=>row.id===demoListingId))return rows;
    const demo=await readListing({...options,query});return demo?[...rows,demo]:rows;
  }
  async function sendMedia(req,res,{family=false,name=req.params?.name}={}){
    if(name!==demoMediaName||!await category(family))return res.status(404).json({success:false,message:'Reviewed demo image not found.'});
    const bytes=await image();if(!bytes)return res.status(404).json({success:false,message:'Reviewed demo image not found.'});
    res.set('Cache-Control','private, no-store, max-age=0');res.set('Pragma','no-cache');
    return res.type('png').send(bytes);
  }
  return {id:demoListingId,mediaName:demoMediaName,readListing,mergeListings,sendMedia};
}
