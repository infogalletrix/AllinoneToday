import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, Bot, MessageCircle, Send, X } from 'lucide-react';
import { fetchListings } from '../../api/client';
import { assistantReply, assistantWelcome } from '../../assistantGuide';
import './AssistantChat.css';

const suggestions = ['Find products', 'Contact a shop owner', 'Shop owner help'];

export default function AssistantChat() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false), [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([{ ...assistantWelcome, id: 0 }]), [busy, setBusy] = useState(false);
  const launcher = useRef(null), input = useRef(null), history = useRef(null), requestSequence = useRef(0), sendLock = useRef(false);
  useEffect(() => () => { requestSequence.current++; }, []);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { if (open && history.current) history.current.scrollTop = history.current.scrollHeight; }, [messages, open, busy]);
  useEffect(() => {
    if (!open) return;
    const escape = event => { if (event.key === 'Escape') { setOpen(false); launcher.current?.focus(); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);

  async function send(value) {
    const text = value.trim().slice(0, 300);
    if (!text || sendLock.current) return;
    sendLock.current = true;
    const sequence = ++requestSequence.current;
    setDraft(''); setBusy(true);
    setMessages(previous => [...previous.slice(-29), { id: sequence + '-user', text, mine: true }]);
    let reply = text.toLowerCase() === 'find products'
      ? { text: 'What are you looking for? Try “find chairs”, “find mobiles” or “find groceries”.', links: [{ label: 'Browse all products', to: '/listings' }] }
      : assistantReply(text, pathname);
    try {
      if (reply.search) {
        const items = (await fetchListings(reply.search)).filter(item => !item.is_demo).slice(0, 3);
        reply = { text: items.length ? 'Here are public products that match. Open a product to see its details or chat with the seller.' : 'I couldn’t find a matching public product. Try a shorter product name or browse the catalogue.',
          links: [...items.map(item => ({ label: item.title, to: '/listings/' + item.id })), { label: 'Browse catalogue', to: '/listings?' + new URLSearchParams(reply.search).toString() }] };
      }
    } catch {
      reply = { text: 'Product search is temporarily unavailable. You can try again or open the catalogue.', links: [{ label: 'Open catalogue', to: '/listings' }] };
    } finally {
      if (requestSequence.current === sequence) {
        setMessages(previous => [...previous, { ...reply, id: sequence + '-assistant' }]);
        setBusy(false); input.current?.focus();
      }
      sendLock.current = false;
    }
  }

  if (/^\/(reset-password|change-password|delete-account)(?:\/|$)/.test(pathname)) return null;
  return <div className={'ait-assistant'+(/^\/(business|admin)(?:\/|$)/.test(pathname)?' is-workspace':'')}>
    {open && <section className="ait-assistant-panel" role="dialog" aria-label="All in One Today automated assistant">
      <header><span className="ait-assistant-avatar"><Bot size={23} aria-hidden="true" /></span><div><h2>How can I help?</h2><p>All in One Today assistant</p></div><button type="button" aria-label="Close assistant" onClick={() => { setOpen(false); launcher.current?.focus(); }}><X size={19} /></button></header>
      <p className="ait-assistant-disclosure">Automated website guide. Sellers answer product enquiries.</p>
      <div className="ait-assistant-history" ref={history} role="log" aria-live="polite" aria-relevant="additions" aria-label="Assistant conversation">
        {messages.map(message => <article key={message.id} className={message.mine ? 'is-mine' : ''}><small>{message.mine ? 'You' : 'Assistant · automated'}</small><p>{message.text}</p>{message.links?.length > 0 && <div className="ait-assistant-links">{message.links.map(item => <Link to={item.to} key={item.to} onClick={() => setOpen(false)}>{item.label}<ArrowUpRight size={14} aria-hidden="true" /></Link>)}</div>}</article>)}
        {busy && <p role="status" className="ait-assistant-loading">Searching the catalogue…</p>}
      </div>
      <div className="ait-assistant-suggestions" aria-label="Suggested questions">{suggestions.map(text => <button key={text} type="button" disabled={busy} onClick={() => send(text)}>{text}</button>)}</div>
      <form onSubmit={event => { event.preventDefault(); send(draft); }}><label htmlFor="ait-assistant-message" className="ait-assistant-sr-only">Ask the assistant</label><input ref={input} id="ait-assistant-message" placeholder="Ask a question or find a product…" maxLength={300} value={draft} disabled={busy} onChange={event => setDraft(event.target.value)} /><button type="submit" disabled={busy || !draft.trim()} aria-label="Send to assistant"><Send size={19} /></button></form>
      <footer>Never share passwords, OTPs or payment details.</footer>
    </section>}
    <button ref={launcher} type="button" className={'ait-assistant-launcher' + (open ? ' is-open' : '')} aria-expanded={open} aria-label={open ? 'Close assistant' : 'Open assistant'} onClick={() => setOpen(previous => !previous)}>{open ? <X size={21} /> : <MessageCircle size={22} />}<span>{open ? 'Close' : 'Need help?'}</span></button>
  </div>;
}
