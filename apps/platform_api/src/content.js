import { z } from 'zod';

const string = z.string().trim().max(3000);
export const safeUrl = z.string().max(500).refine(value => !value || /^\/(?!\/)[a-zA-Z0-9_/?#=&.%+-]*$/.test(value) || /^https:\/\//.test(value), 'Use a website path or an HTTPS address.');
export const defaultCategories = ['Vehicles', 'Property', 'Jobs', 'Groceries', 'Electronics', 'Mobiles', 'Services', 'Furniture'];
export const defaultSite = {
  companyName: 'All in One Today', supportEmail: '', supportPhone: '',
  tagline: 'Your local finds, all in one place. Discover and connect with people and shops near you.',
  theme: { primary: '#F95738', ink: '#14171C', background: '#F6F8FA' },
  popular: ['Vehicles', 'Property', 'Jobs', 'Mobiles', 'Electronics', 'Services', 'Furniture'].map(category => ({label: category, category})),
  sections: [
    {id:'hero',type:'hero',enabled:true,title:'Find What You Need.\nDiscover What’s Next.',body:'Explore products, properties, vehicles, jobs and services from shops around you.',image:'/images/h.png'},
    {id:'categories',type:'categories',enabled:true,title:'Browse by category',body:'Curated collections across every need'},
    {id:'latest',type:'listings',enabled:true,title:'Fresh finds, all in one place.',body:'The latest listings from our community.',category:''},
    {id:'how',type:'steps',enabled:true,title:'How it works',body:'Find it. Connect with the shop. Make your next discovery.',items:[{title:'Search',body:'Find products, services, jobs and properties.'},{title:'Connect',body:'Contact the seller and ask your questions.'},{title:'Discover',body:'Inspect the item before arranging your transaction.'}]},
    {id:'trust',type:'text',enabled:true,title:'A little care. Better connections.',body:'Inspect items and verify ownership before paying. Never share an OTP, password or UPI PIN. Report suspicious listings and block unwanted messages.'},
    {id:'downloads',type:'downloads',enabled:true,title:'All in One Today, on Android.',body:'Browse and connect wherever you are.'},
  ],
};
export const categorySchema = z.object({
  name:z.string().trim().min(2).max(50), slug:z.string().regex(/^[a-z0-9-]{2,60}$/),
  subtitle:z.string().trim().max(200).default(''),image_path:safeUrl.default(''),
  position:z.number().int().min(0).max(1000).default(0),enabled:z.boolean().default(true),
});
export const sectionSchema = z.object({
  id:z.string().regex(/^[a-zA-Z0-9_-]{1,70}$/),type:z.enum(['hero','categories','listings','steps','text','banner','downloads','shops']),
  enabled:z.boolean(),title:string,body:string,image:safeUrl.optional(),
  category:z.string().max(50).optional(),link:safeUrl.optional(),button:z.string().max(80).optional(),
  items:z.array(z.object({title:z.string().max(200),body:string})).max(12).optional(),
});
export const siteSchema = z.object({
  companyName:z.literal('All in One Today'),supportEmail:z.union([z.email(),z.literal('')]),supportPhone:z.string().max(30),
  tagline:string,theme:z.object({primary:z.string().regex(/^#[a-fA-F0-9]{6}$/),ink:z.string().regex(/^#[a-fA-F0-9]{6}$/),background:z.string().regex(/^#[a-fA-F0-9]{6}$/)}),
  popular:z.array(z.object({label:z.string().trim().min(1).max(50),category:z.string().max(50)})).max(20),
  sections:z.array(sectionSchema).max(30).refine(items=>new Set(items.map(item=>item.id)).size===items.length,'Section IDs must be unique.'),
});
export async function seedContent(pool) {
  const subtitles=['Car, bike & commercial','Buy, rent & lease','Full-time & part-time','Fresh vegetables & produce','Laptops, audio & appliances','Phones, tablets & accessories','Home, repair & cleaning','Living, bed & dining'];
  for (const [position,name] of defaultCategories.entries()) await pool.query('INSERT INTO marketplace_categories(id,name,slug,subtitle,image_path,position) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[`cat_${name.toLowerCase()}`,name,name.toLowerCase(),subtitles[position],`/images/h${position+1}.png`,position]);
  await pool.query("INSERT INTO platform_settings(key,value) VALUES('website',$1) ON CONFLICT DO NOTHING",[defaultSite]);
}
export async function publicContent(pool) {
  const site=(await pool.query("SELECT value,revision FROM platform_settings WHERE key='website'")).rows[0];
  const categories=(await pool.query('SELECT * FROM marketplace_categories WHERE enabled=true ORDER BY position,name')).rows;
  return {...site.value,revision:site.revision,categories};
}
