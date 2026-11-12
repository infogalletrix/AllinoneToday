import { z } from 'zod';

export const shopTypes = ['Retail / General Store','Textile / Clothing','Grocery / Supermarket','Electronics / Appliances','Mobile / Accessories','Pharmacy / Medical','Jewellery / Watches','Furniture / Home Decor','Restaurant / Cafe','Bakery / Sweets','Hardware / Tools','Building Materials','Automotive / Spare Parts','Books / Stationery','Toys / Gifts','Beauty / Cosmetics','Sports / Fitness','Footwear / Bags','Pet Supplies','Agriculture / Garden','Services / Repairs','Other'];
export const branchSchema=z.object({name:z.string().trim().min(2).max(120),address:z.string().trim().min(5).max(300),phone:z.string().trim().min(7).max(30)});
export const registrationFields={owner_name:z.string().trim().min(2).max(100).optional(),shop_type:z.enum(shopTypes).default('Retail / General Store'),branch_details:z.array(branchSchema).max(100).default([])};
export const shopImage=z.string().regex(/^\/uploads\/[a-f0-9-]+\.webp$/).or(z.literal(''));
export const shopProfileSchema=z.object({
  name:z.string().trim().min(2).max(120),location:z.string().trim().min(2).max(180),phone:z.string().trim().min(7).max(30),
  description:z.string().trim().max(2000),image_path:shopImage.default(''),
  owner_name:registrationFields.owner_name,shop_type:z.enum(shopTypes).optional(),
  branch_details:z.array(branchSchema.extend({id:z.string().uuid()})).min(1).max(100).optional(),
});
export function validateBranches(shop) {
  if(shop.branch_details.length===0&&shop.branches===1)return [{name:'Main branch',address:shop.location,phone:shop.phone}];
  if(shop.branch_details.length!==shop.branches)throw Object.assign(new Error('Add details for every registered branch.'),{status:400});
  if(new Set(shop.branch_details.map(b=>b.name.toLowerCase())).size!==shop.branches)throw Object.assign(new Error('Each branch needs a different name.'),{status:400});
  return shop.branch_details;
}
export function updatedBranches(shop,details) {
  if(details===undefined)return shop.branch_details;
  validateBranches({...shop,branch_details:details});
  const registered=new Set(shop.branch_details.map(branch=>branch.id));
  if(registered.size!==details.length||new Set(details.map(branch=>branch.id)).size!==details.length||details.some(branch=>!registered.has(branch.id)))
    throw Object.assign(new Error('Keep the registered branches when updating shop details.'),{status:400});
  return details;
}
