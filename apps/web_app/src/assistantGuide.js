const link = (label, to) => ({ label, to });
export const assistantWelcome = {
  text: "Hi! I’m the All in One Today assistant. I can help you find products, contact a seller, or manage your shop. What would you like to do?",
  links: [],
};

export function assistantReply(value, pathname = '/') {
  const message = String(value).trim().slice(0, 300), query = message.toLowerCase();
  const current = /^\/(shops|listings)\/[a-f0-9-]+$/i.test(pathname);
  if (/\b(password|login|log in|sign in|user id|credential|otp)\b/.test(query)) {
    return { text: 'Shop owners sign in with the user ID and temporary password supplied by the administrator. Your first sign-in asks you to choose a new password before opening your dashboard. If you forgot your password, use Forgot password on the sign-in page. Never share passwords or OTPs in chat.',
      links: [link('Shop owner sign-in', '/login?mode=owner'), link('Account help', '/support')] };
  }
  if (/\b(chat|contact|message|seller|owner|human)\b/.test(query) && !/\b(add|hide|product management|create|shop owner help)\b/.test(query)) {
    return { text: current ? 'Choose Chat with seller to send your question directly to the owner of this shop or listing. Sign in if asked. The owner’s reply will appear in Messages.' : 'Open a shop or product and choose Chat with seller. Your message goes directly to its owner. Existing conversations and replies are in Messages.',
      links: [...(current ? [link('Chat with this seller', pathname + '?chat=1')] : [link('Explore shops', '/shops')]), link('Open Messages', '/messages')] };
  }
  if (/\b(add|edit|hide|publish|visible|visibility|category|categories|manage|create shop|register shop|shop owner help)\b/.test(query)) {
    return { text: 'The administrator creates your shop and gives you an owner user ID. After changing your temporary password, open your shop dashboard to add or edit products, choose a category, enter a regular price and optional offer price, and show or hide each product. Hidden products are kept in your dashboard and are not public.',
      links: [link('Open shop dashboard', '/business'), link('Contact support', '/support')] };
  }
  if (/\b(delivery|shipping|stock|available|availability|discount|offer|price|payment|buy|purchase|order|refund)\b/.test(query) && !/\b(find|search|looking)\b/.test(query)) {
    return { text: 'Public products show the seller’s current regular and offer prices when provided. Ask the seller to confirm availability, delivery and final terms before paying. Purchases are arranged directly with sellers; this website does not take product orders.',
      links: [...(current ? [link('Ask this seller', pathname + '?chat=1')] : [link('Browse products', '/listings')]), link('Buying information', '/delivery')] };
  }
  if (/^(hi|hello|hey|help|what can you do)[!.?\s]*$/.test(query)) return assistantWelcome;
  if (/\b(shops|stores)\b/.test(query) && !/\b(product|products)\b/.test(query)) {
    return { text: 'Browse public shops to see their products and contact each owner directly.', links: [link('Explore shops', '/shops')] };
  }
  const category = [[/\b(electronics|laptop|computer)\b/, 'Electronics'], [/\b(mobile|mobiles|phone|phones)\b/, 'Mobiles'], [/\b(grocery|groceries)\b/, 'Groceries'], [/\b(furniture)\b/, 'Furniture'], [/\b(vehicle|vehicles)\b/, 'Vehicles'], [/\b(service|services)\b/, 'Services']].find(([pattern]) => pattern.test(query))?.[1];
  if (!category && !/\b(find|search|show|looking for)\b/.test(query)) {
    return { text: 'I can help with finding products, contacting sellers and managing your shop. To search the catalogue, try “find dining chairs”. For account-specific help, contact support.', links: [link('Open support', '/support'), link('Browse products', '/listings')] };
  }
  const search = message.replace(/^(please\s+)?(find|search for|search|show me|show|looking for|i am looking for|i’m looking for)\s+/i, '').replace(/[?!.]+$/, '').trim().slice(0, 100);
  return { text: 'I can search the public catalogue for you. Seller chat is the best place to confirm details about a product.', links: [], search: category ? { category } : { q: search } };
}
