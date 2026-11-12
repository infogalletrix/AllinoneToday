import { z } from 'zod';
import { isSupportedCategory, filterSiteOffering } from './offering.js';

const string = z.string().trim().max(3000);
export const safeUrl = z.string().max(500).refine(value => !value || /^\/(?!\/)[a-zA-Z0-9_/?#=&.%+-]*$/.test(value) || /^https:\/\//.test(value), 'Use a website path or an HTTPS address.');
export const defaultCategories = ['Vehicles', 'Groceries', 'Electronics', 'Mobiles', 'Services', 'Furniture'];
export const defaultSite = {
  companyName: 'All in One Today', supportEmail: 'kgaravind1988@gmail.com', supportPhone: '+919003540809',
  businessName: 'All in one Today', businessAddress: 'Pacode, Kanniyakumari district, Tamil Nadu - 629168',
  refundReviewDays: 3, refundInitiationDays: 2, refundProcessingDays: 7,
  tagline: 'Your local finds, all in one place. Discover and connect with people and shops near you.',
  theme: { primary: '#F95738', ink: '#14171C', background: '#F6F8FA' },
  popular: ['Vehicles', 'Mobiles', 'Electronics', 'Services', 'Furniture'].map(category => ({label: category, category})),
  sections: [
    {id:'hero',type:'hero',enabled:true,title:'Find What You Need.\nDiscover What’s Next.',body:'Explore products, vehicles and services from shops around you.',image:'/images/h.png'},
    {id:'categories',type:'categories',enabled:true,title:'Browse by category',body:'Curated collections across every need'},
    {id:'latest',type:'listings',enabled:true,title:'Fresh finds, all in one place.',body:'The latest listings from our community.',category:''},
    {id:'how',type:'steps',enabled:true,title:'How it works',body:'Find it. Connect with the shop. Make your next discovery.',items:[{title:'Search',body:'Find products and services.'},{title:'Connect',body:'Contact the seller and ask your questions.'},{title:'Discover',body:'Inspect the item before arranging your transaction.'}]},
    {id:'trust',type:'text',enabled:true,title:'A little care. Better connections.',body:'Inspect items and verify ownership before paying. Never share an OTP, password or UPI PIN. Report suspicious listings and block unwanted messages.'},
    {id:'downloads',type:'downloads',enabled:true,title:'All in One Today, on Android.',body:'Browse and connect wherever you are.'},
  ],
};
export const categorySchema = z.object({
  name:z.string().trim().min(2).max(50), slug:z.string().regex(/^[a-z0-9-]{2,60}$/),
  subtitle:z.string().trim().max(200).default(''),image_path:safeUrl.default(''),
  position:z.number().int().min(0).max(1000).default(0),enabled:z.boolean().default(true),
  module:z.enum(['product','service']).optional(),
}).refine(isSupportedCategory,'Employment categories are not offered.');
export const sectionSchema = z.object({
  id:z.string().regex(/^[a-zA-Z0-9_-]{1,70}$/),type:z.enum(['hero','categories','listings','steps','text','banner','downloads','shops']),
  enabled:z.boolean(),title:string,body:string,image:safeUrl.optional(),
  category:z.string().max(50).optional(),link:safeUrl.optional(),button:z.string().max(80).optional(),
  items:z.array(z.object({title:z.string().max(200),body:string})).max(12).optional(),
});
export const siteSchema = z.object({
  companyName:z.literal('All in One Today'),supportEmail:z.union([z.email(),z.literal('')]),supportPhone:z.string().max(30),
  businessName:z.string().trim().max(200).optional(),businessAddress:z.string().trim().max(1000).optional(),
  refundReviewDays:z.number().int().min(1).max(30).optional(),refundInitiationDays:z.number().int().min(1).max(30).optional(),refundProcessingDays:z.number().int().min(1).max(30).optional(),
  tagline:string,theme:z.object({primary:z.string().regex(/^#[a-fA-F0-9]{6}$/),ink:z.string().regex(/^#[a-fA-F0-9]{6}$/),background:z.string().regex(/^#[a-fA-F0-9]{6}$/)}),
  popular:z.array(z.object({label:z.string().trim().min(1).max(50),category:z.string().max(50)})).max(20),
  sections:z.array(sectionSchema).max(30).refine(items=>new Set(items.map(item=>item.id)).size===items.length,'Section IDs must be unique.'),
});
export async function seedContent(pool) {
  const details={Vehicles:['Car, bike & commercial','h1.png'],Groceries:['Fresh vegetables & produce','h4.png'],Electronics:['Laptops, audio & appliances','h5.png'],Mobiles:['Phones, tablets & accessories','h6.png'],Services:['Home, repair & cleaning','h7.png'],Furniture:['Living, bed & dining','h8.png']};
  for (const [position,name] of defaultCategories.entries()) await pool.query('INSERT INTO marketplace_categories(id,name,slug,subtitle,image_path,position,module) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[`cat_${name.toLowerCase()}`,name,name.toLowerCase(),details[name][0],`/images/${details[name][1]}`,position,name==='Services'?'service':'product']);
  await pool.query("INSERT INTO platform_settings(key,value) VALUES('website',$1) ON CONFLICT DO NOTHING",[defaultSite]);
}
export async function publicContent(pool) {
  const site=(await pool.query("SELECT value,revision FROM platform_settings WHERE key='website'")).rows[0];
  const categories=(await pool.query('SELECT * FROM marketplace_categories ORDER BY position,name')).rows;
  return {...filterSiteOffering(site.value,categories),revision:site.revision,categories:categories.filter(category=>category.enabled && isSupportedCategory(category))};
}
