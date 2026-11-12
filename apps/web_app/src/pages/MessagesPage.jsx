import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Inbox, MessageCircle, RefreshCw, Search, Send, ShieldCheck } from "lucide-react";
import { useAccount } from "../AccountContext";
import { request, post, resolveImageUrl } from "../api/client";
import { adminChatDisclosure } from "../catalogueAccess";
import "./MessagesPage.css";

function timeLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " + date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function completeHistory(conversation, history, userId) {
  const rows = Array.isArray(history) ? history : [];
  if (!conversation.message || rows.some(message => message.id === conversation.id)) return rows;
  return [{ id: conversation.id, sender_id: conversation.sender_id, content: conversation.message,
    sent_at: conversation.created_at, is_from_me: conversation.sender_id === userId }, ...rows];
}
export default function MessagesPage() {
  const { user, loading } = useAccount();
  const [params] = useSearchParams();
  const destination = "/messages" + (params.toString() ? "?" + params.toString() : "");
  if (loading || !user) return <section className="ait-page chat-page">
    <p className="ait-eyebrow">All in One Today</p><h1>Your messages</h1>
    {loading ? <p role="status">Loading your messages…</p> : <div className="ait-panel chat-signin">
      <MessageCircle size={36} aria-hidden="true" /><h2>Keep every conversation together</h2>
      <p>Sign in to ask about a shop or product and read replies directly from its owner.</p>
      <Link className="btn-primary" to={"/account?next=" + encodeURIComponent(destination)}>Sign in to view messages</Link>
    </div>}
  </section>;
  return <ConversationInbox key={user.id} user={user} />;
}
function ConversationInbox({ user }) {
  const [params, setParams] = useSearchParams(), activeId = params.get("conversation") || "";
  const [items, setItems] = useState([]), [active, setActive] = useState(null), [messages, setMessages] = useState([]);
  const [query, setQuery] = useState(""), [drafts, setDrafts] = useState({}), [previews, setPreviews] = useState({});
  const [inboxLoading, setInboxLoading] = useState(true), [threadLoading, setThreadLoading] = useState(false);
  const [listError, setListError] = useState(""), [threadError, setThreadError] = useState(""), [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false), [refresh, setRefresh] = useState(0), [refreshedAt, setRefreshedAt] = useState(null);
  const mounted = useRef(true), selectedId = useRef(activeId), sendLock = useRef(false), historyElement = useRef(null), stickToBottom = useRef(true);
  selectedId.current = activeId;
  const admin = user.role === "admin" || user.role === "merchant", content = drafts[activeId] || "";
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    setActive(null); setMessages([]); setThreadError(""); setSendError(""); stickToBottom.current = true;
  }, [activeId]);
  useEffect(() => {
    let current = true, timer;
    const controller = new AbortController();
    setThreadLoading(Boolean(activeId));
    async function poll() {
      const pathId = encodeURIComponent(activeId);
      const paths = ["/conversations", ...(activeId ? ["/conversations/" + pathId, "/conversations/" + pathId + "/messages"] : [])];
      const result = await Promise.allSettled(paths.map(path => request(path, { signal: controller.signal })));
      if (!current) return;
      if (result[0].status === "fulfilled") { setItems(result[0].value); setListError(""); }
      else setListError(result[0].reason.message || "Could not load conversations. Please refresh.");
      setInboxLoading(false);
      if (activeId) {
        if (result[1].status === "fulfilled" && result[2].status === "fulfilled") {
          const conversation = result[1].value, list = result[0].status === "fulfilled" ? result[0].value : [];
          const history = completeHistory(conversation, result[2].value, user.id);
          setActive({ ...list.find(item => item.id === activeId), ...conversation });
          setMessages(history); setThreadError("");
          const latest = history.at(-1);
          if (latest) setPreviews(previous => ({ ...previous, [activeId]: { message: latest.content, at: latest.sent_at || latest.created_at } }));
        } else {
          setThreadError((result[1].status === "rejected" ? result[1].reason : result[2].reason).message || "Could not load this conversation.");
          setActive(previous => previous ? { ...previous, can_reply: false } : null);
        }
        setThreadLoading(false);
      }
      setRefreshedAt(new Date());
      timer = window.setTimeout(poll, 12000);
    }
    poll();
    return () => { current = false; controller.abort(); window.clearTimeout(timer); };
  }, [activeId, user.id, refresh]);
  useEffect(() => {
    const element = historyElement.current;
    if (element && stickToBottom.current) element.scrollTop = element.scrollHeight;
  }, [messages]);
  function select(id) {
    if (sendLock.current) return;
    setParams(previous => { const next = new URLSearchParams(previous); if (id) next.set("conversation", id); else next.delete("conversation"); return next; });
  }
  async function send(event) {
    event.preventDefault();
    const id = activeId, text = content.trim();
    if (sendLock.current || threadLoading || active?.id !== id || active?.can_reply !== true || !text) return;
    sendLock.current = true; setSending(true); setSendError("");
    try {
      const message = await post("/conversations/" + encodeURIComponent(id) + "/messages", { content: text });
      if (!mounted.current) return;
      setDrafts(previous => ({ ...previous, [id]: "" }));
      const sent = { ...message, content: message?.content || text, is_from_me: true, sent_at: message?.sent_at || message?.created_at || new Date().toISOString() };
      setPreviews(previous => ({ ...previous, [id]: { message: sent.content, at: sent.sent_at } }));
      if (selectedId.current === id) { stickToBottom.current = true; setMessages(previous => previous.some(item => item.id === sent.id) ? previous : [...previous, sent]); }
      setRefresh(previous => previous + 1);
    } catch (error) {
      if (mounted.current && selectedId.current === id) setSendError(error.message || "Your message was not sent. Try again.");
    } finally { sendLock.current = false; if (mounted.current) setSending(false); }
  }
  const search = query.trim().toLowerCase();
  const visible = items.filter(item => [item.item_tag, item.sender_name, item.recipient_name, item.phone, previews[item.id]?.message, item.last_message || item.message]
    .some(value => String(value || "").toLowerCase().includes(search)));
  const participantName = item => item.sender_id !== user.id ? item.sender_name || "Customer"
    : item.recipient_name || "Shop owner";
  const otherName = active ? participantName(active) : "";
  return <section className="ait-page chat-page">
    <header className="chat-page-heading"><div><p className="ait-eyebrow">Your conversations, in one place</p><h1>{admin ? "Customer messages" : "Your messages"}</h1></div>
      <button type="button" className="chat-refresh" aria-label="Refresh messages" disabled={sending} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={17} aria-hidden="true" />Refresh</button>
    </header>
    <p className="chat-disclosure"><ShieldCheck size={18} aria-hidden="true" />{adminChatDisclosure}</p>
    <div className={"chat-workspace" + (activeId ? " chat-has-selection" : "")}>
      <aside className="chat-sidebar" aria-label="Conversations">
        <div className="chat-sidebar-top"><h2>Inbox <span>{items.length}</span></h2>
          <label className="chat-search"><Search size={18} aria-hidden="true" /><span className="chat-sr-only">Search conversations</span><input type="search" placeholder="Search conversations" value={query} onChange={event => setQuery(event.target.value)} /></label>
        </div>
        {listError && <div className="chat-inline-error" role="alert">{listError}<button type="button" onClick={() => setRefresh(value => value + 1)}>Try again</button></div>}
        <div className="chat-conversation-list">
          {inboxLoading ? <p className="chat-list-state" role="status">Loading conversations…</p> : !visible.length ? <div className="chat-list-state"><Inbox size={28} aria-hidden="true" /><p>{query ? "No conversations match your search." : "No conversations yet."}</p>{!query && <Link className="ait-link" to="/listings">Find a listing to start a chat</Link>}</div> : visible.map(item => {
            const latest = previews[item.id], participant = participantName(item);
            return <button type="button" key={item.id} className={"chat-conversation" + (item.id === activeId ? " is-selected" : "")} onClick={() => select(item.id)} disabled={sending} aria-pressed={item.id === activeId}>
              <span className="chat-avatar" aria-hidden="true">{item.item_thumbnail ? <img src={resolveImageUrl(item.item_thumbnail)} alt="" /> : <MessageCircle size={21} />}</span>
              <span className="chat-conversation-copy"><span className="chat-conversation-title">{item.item_tag || "Shop enquiry"}</span><span className="chat-participant">{participant}</span><span className="chat-preview">{latest?.message || item.last_message || item.message || "Open conversation"}</span><time>{timeLabel(latest?.at || item.last_message_at || item.created_at)}</time></span>
            </button>;
          })}
        </div>
        <p className="chat-refresh-note">{refreshedAt ? "Updates automatically every 12 seconds" : "Connecting to your inbox…"}</p>
      </aside>
      <div className="chat-thread">
        {!activeId ? <div className="chat-welcome"><span className="chat-welcome-icon"><MessageCircle size={36} aria-hidden="true" /></span><h2>A conversation starts here</h2><p>Select a chat to read messages and reply. Product and shop questions go directly to the seller.</p><Link className="btn-secondary" to="/listings">Explore listings</Link></div> : <>
          <header className="chat-thread-heading"><button type="button" className="chat-back" onClick={() => select("")} disabled={sending} aria-label="Back to conversations"><ArrowLeft size={20} /> <span>Inbox</span></button><div><h2>{active?.item_tag || items.find(item => item.id === activeId)?.item_tag || "Conversation"}</h2><p>{otherName || (threadLoading ? "Loading conversation…" : "Shop owner")}</p></div>{active?.listing_id ? <Link className="chat-product-link" to={"/listings/" + active.listing_id}>View listing</Link> : active?.shop_id && <Link className="chat-product-link" to={"/shops/" + active.shop_id}>View shop</Link>}</header>
          {active && active.sender_id !== user.id && <div className="chat-customer"><strong>{active.sender_name || "Customer"}</strong><span>Contact phone: {active.phone || "Not provided"}</span></div>}
          <div className="chat-history" ref={historyElement} aria-label="Conversation history" onScroll={event => { const element = event.currentTarget; stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; }}>
            {threadLoading && !messages.length && <p className="chat-list-state" role="status">Loading conversation…</p>}
            {messages.map((message, index) => {
              const mine = typeof message.is_from_me === "boolean" ? message.is_from_me : message.sender_id === user.id;
              return <article key={message.id || index} className={"chat-bubble" + (mine ? " is-mine" : "")}><span className="chat-message-author">{mine ? "You" : otherName || "Participant"}{message.id === active?.id ? " · First message" : ""}</span><p>{message.content}</p><time dateTime={message.sent_at || message.created_at}>{timeLabel(message.sent_at || message.created_at)}</time></article>;
            })}
            {!threadLoading && !threadError && active && !messages.length && <p className="chat-list-state">No messages in this conversation yet.</p>}
          </div>
          {threadError && <div className="chat-inline-error" role="alert">{threadError}<button type="button" onClick={() => setRefresh(value => value + 1)}>Retry conversation</button></div>}
          {!threadLoading && active?.can_reply !== true && !threadError && <p className="chat-readonly" role="status">{active?.read_only_reason || "Replies are unavailable for this conversation. Please try again later."}</p>}
          {active?.id === activeId && active?.can_reply === true && <form className="chat-composer" onSubmit={send}>
            {sendError && <p className="chat-send-error" role="alert">{sendError} Your draft is saved below; select Send message to retry.</p>}
            <label htmlFor="chat-message">Message</label><div className="chat-composer-row"><textarea id="chat-message" placeholder={active?.recipient_id === user.id ? "Write a reply to the customer…" : "Write a message to the seller…"} maxLength={2000} required rows={2} value={content} disabled={sending || threadLoading} onChange={event => setDrafts(previous => ({ ...previous, [activeId]: event.target.value }))} /><button type="submit" className="btn-primary" disabled={sending || threadLoading || !content.trim()}><Send size={17} aria-hidden="true" /><span>{sending ? "Sending…" : "Send message"}</span></button></div><p className="chat-composer-hint">{content.length}/2000 · Replies appear here automatically.</p>
          </form>}
        </>}
      </div>
    </div>
  </section>;
}
