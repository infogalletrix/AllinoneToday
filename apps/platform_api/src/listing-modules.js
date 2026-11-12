import {z} from 'zod';
import {assertSupportedCategory} from './offering.js';
export function listingKind(category,kind) {
  assertSupportedCategory(category);
  return z.enum(['product','service']).parse(kind||(category==='Services'?'service':'product'));
}
export function validateListingModule(input,modules={Services:'service'}) {
  assertSupportedCategory(input.category);
  const categoryKind=modules[input.category]||'product';
  if(!['product','service'].includes(categoryKind)||input.kind==='job')throw Object.assign(new Error('Only product and service listings are offered.'),{status:400});
  const kind=z.enum(['product','service']).parse(input.kind||categoryKind);
  if(kind!==categoryKind)throw Object.assign(new Error('Choose the category for the matching Product or Service module.'),{status:400});
  const details=input.specifications||{};
  const required=kind==='service'?['Service area','Availability']:['Availability'];
  // Legacy product requests retain their existing format; new modules need complete fields.
  if(kind!=='product' && required.some(key=>!String(details[key]||'').trim()))throw Object.assign(new Error(`Complete all required ${kind} details.`),{status:400});
  return kind;
}
