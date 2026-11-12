import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, MessageCircle, Send, ShieldCheck, X } from "lucide-react";
import { useAccount } from "../../AccountContext";
import { sendInquiry, resolveImageUrl } from "../../api/client";
import { adminChatDisclosure, isDemoCatalogueItem, enquiryUnavailableReason } from "../../catalogueAccess";
import "./ContactSellerModal.css";
import ListingPrice from './ListingPrice';

export default function ContactSellerModal({ isOpen, onClose, listing }) {
  const { user } = useAccount();
  const shopTarget = listing?.chat_target === "shop";
  const [phone, setPhone] = useState(""), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [sent, setSent] = useState(null), [busy, setBusy] = useState(false);
  const dialog = useRef(null), submitLock = useRef(false), sequence = useRef(0);
  useEffect(() => {
    sequence.current += 1;
    const demo = isDemoCatalogueItem(listing);
    setPhone(demo ? "" : user?.phone || "");
    setMessage(listing && !demo ? (shopTarget
      ? "Hi, I’d like to know more about " + (listing.title || listing.name) + ". Could you help me?"
      : "Hi, I’m interested in " + listing.title + ". Is it still available?") : "");
    setError(""); setSent(null);
  }, [listing?.id, listing?.chat_target, shopTarget, user?.id, isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    dialog.current?.querySelector("input, a, button")?.focus();
    function keyboard(event) {
      if (event.key === "Escape" && !submitLock.current) onClose();
      if (event.key !== "Tab") return;
      const elements = [...(dialog.current?.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled)') || [])];
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); document.body.style.overflow=previousOverflow; previous?.focus?.(); };
  }, [isOpen, onClose]);
  if (!isOpen || !listing) return null;
  const unavailableReason = enquiryUnavailableReason(listing, user);
  async function submit(event) {
    event.preventDefault();
    if (submitLock.current || unavailableReason || !user || message.trim().length < 2) return;
    const current = sequence.current;
    submitLock.current = true; setBusy(true); setError("");
    try {
      const target = shopTarget ? { shop_id: listing.id } : { listing_id: listing.id };
      const conversation = await sendInquiry({ ...target, phone: phone.trim(), message: message.trim() });
      if (current === sequence.current) setSent(conversation || {});
    } catch (error) {
      if (current === sequence.current) setError(error.message || "Your message could not be sent. Try again.");
    } finally { submitLock.current = false; setBusy(false); }
  }
  function close() { if (!submitLock.current) onClose(); }
  return <div className="modal-backdrop contact-chat-backdrop" onClick={close}>
    <div ref={dialog} className="modal-card contact-chat-card" role="dialog" aria-modal="true" aria-labelledby="contact-title" aria-describedby="contact-routing" onClick={event => event.stopPropagation()}>
      <div className="modal-header contact-chat-header"><span className="contact-chat-icon"><MessageCircle size={23} aria-hidden="true" /></span><div><h2 id="contact-title">Chat with seller</h2><p>Ask a question. Keep the conversation here.</p></div><button type="button" onClick={close} aria-label="Close chat" disabled={busy}><X size={20} /></button></div>
      <div className="contact-chat-body">
        <div className="contact-chat-product">{listing.image_path && <img src={resolveImageUrl(listing.image_path)} alt="" />}<div><span>{shopTarget ? "About this shop" : "About this listing"}</span><strong>{listing.title || listing.name}</strong>{!shopTarget&&!isDemoCatalogueItem(listing)&&<ListingPrice item={listing} className="product-price-context"/>}</div></div>
        <p id="contact-routing" className="contact-chat-disclosure"><ShieldCheck size={18} aria-hidden="true" />{adminChatDisclosure}</p>
        {unavailableReason ? <p className="ait-notice" role="status">{unavailableReason}</p> : !user ? <div className="contact-chat-signin"><h3>Sign in to start your conversation</h3><p>Send a message about this {shopTarget ? "shop" : "listing"} and find every reply in your inbox.</p><Link className="btn-primary" to={"/account?next=" + encodeURIComponent((shopTarget ? "/shops/" : "/listings/") + listing.id + "?chat=1")} onClick={onClose}>Sign in to chat</Link></div> : sent ? <div className="contact-chat-success" role="status"><CheckCircle2 size={36} aria-hidden="true" /><h3>Your message is with the seller</h3><p>Continue this conversation in Messages. The owner of this {shopTarget ? "shop" : "listing"} can reply to you there.</p><Link className="btn-primary" to={"/messages" + (sent.id ? "?conversation=" + encodeURIComponent(sent.id) : "")} onClick={onClose}>Open conversation</Link><button type="button" className="ait-link" onClick={onClose}>Continue browsing</button></div> : <form onSubmit={submit} className="ait-form contact-chat-form">
          <label>Your phone<input required type="tel" autoComplete="tel" minLength={7} maxLength={30} value={phone} disabled={busy} onChange={event => setPhone(event.target.value)} /></label>
          <label>Message<textarea required minLength={2} maxLength={2000} rows={4} value={message} disabled={busy} onChange={event => setMessage(event.target.value)} /></label>
          <p className="contact-chat-privacy">Your name, phone number and message are shared with the owner of this {shopTarget ? "shop" : "listing"} so they can respond to your enquiry.</p>
          {error && <p role="alert" className="ait-error">{error} Your message is saved here; select Send message to retry.</p>}
          <button type="submit" className="btn-primary contact-chat-send" disabled={busy || message.trim().length < 2}><Send size={17} aria-hidden="true" />{busy ? "Sending…" : "Send message"}</button>
        </form>}
      </div>
    </div>
  </div>;
}
