import { readFileSync } from 'node:fs';
export const categories = ['Vehicles', 'Property', 'Jobs', 'Groceries', 'Electronics', 'Mobiles', 'Services', 'Furniture'];
export function readPricing() {
  if (!process.env.PRICING_FILE) return { approved: false, startingAmountMinor: 49900, currency: 'INR', categories: [] };
  return JSON.parse(readFileSync(process.env.PRICING_FILE, 'utf8'));
}
export function quote(pricing, category, branches) {
  if (!Number.isInteger(branches) || branches < 1 || branches > 100) throw Object.assign(new Error('Choose between 1 and 100 branches.'),{status:400});
  const rate = pricing.categories.find(item => item.category === category);
  if (!pricing.approved || !rate || !['month', 'year'].includes(pricing.period) || !pricing.version) throw Object.assign(new Error('Shop subscription pricing is awaiting confirmation.'),{status:503});
  if(!Number.isSafeInteger(rate.baseAmountMinor)||rate.baseAmountMinor<49900||!Number.isSafeInteger(rate.additionalBranchAmountMinor)||rate.additionalBranchAmountMinor<0)throw Object.assign(new Error('Shop pricing configuration requires review.'),{status:503});
  const total = rate.baseAmountMinor + (branches - 1) * rate.additionalBranchAmountMinor;
  if (!Number.isSafeInteger(total) || total < 49900 || total > 10000000) throw Object.assign(new Error('This shop requires a custom subscription quote.'),{status:400});
  return { category, branches, amountMinor: total, baseAmountMinor: rate.baseAmountMinor, additionalBranchAmountMinor: (branches - 1) * rate.additionalBranchAmountMinor, currency: 'INR', period: pricing.period, version: pricing.version };
}
