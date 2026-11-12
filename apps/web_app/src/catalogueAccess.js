export const demoCatalogueId = '00000000-0000-4000-8000-00000000d001';
export const adminChatDisclosure = 'Your message goes directly to the owner of this shop or listing. Read their replies in Messages.';

export const isDemoCatalogueItem = item => item?.is_demo === true || item?.id === demoCatalogueId;

export function enquiryUnavailableReason(item, user) {
  if (isDemoCatalogueItem(item)) return 'Demo only — not for sale. This illustration is read-only.';
  if (user?.id && user.id === item?.enquiry_recipient_id) {
    return 'This is your shop or listing. Open Messages to read and reply to customer enquiries.';
  }
  if (item?.enquiry_enabled !== true) return 'Enquiries are currently unavailable for this ' + (item?.chat_target === 'shop' ? 'shop' : 'listing') + '. Please try again later.';
  return null;
}
