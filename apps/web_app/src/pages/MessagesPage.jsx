import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "../AccountContext";
import { request, post } from "../api/client";
export default function MessagesPage() {
  const { user, loading } = useAccount(),
    [items, setItems] = useState([]),
    [active, setActive] = useState(null),
    [messages, setMessages] = useState([]),
    [content, setContent] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (user)
      request("/conversations")
        .then(setItems)
        .catch((e) => setError(e.message));
  }, [user]);
  async function open(i) {
    setActive(i);
    setMessages([]);
    try {
      setMessages(await request("/conversations/" + i.id + "/messages"));
    } catch (e) {
      setError(e.message);
    }
  }
  async function send(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await post("/conversations/" + active.id + "/messages", { content });
      setContent("");
      await open(active);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ait-page">
      <h1>Your messages</h1>
      {error && (
        <p className="ait-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading…</p>
      ) : !user ? (
        <Link className="btn-primary" to="/account?next=/messages">
          Sign in to view messages
        </Link>
      ) : !items.length ? (
        <div className="ait-empty">
          No inquiries yet. Find a listing and contact its seller to start a
          conversation.
        </div>
      ) : (
        <div className="ait-messages">
          <aside className="ait-panel">
            {items.map((i) => (
              <button
                className={
                  "ait-conversation " + (active?.id === i.id ? "selected" : "")
                }
                key={i.id}
                onClick={() => open(i)}
              >
                <strong>{i.item_tag || "Shop inquiry"}</strong>
                <span>{i.is_buying ? i.recipient_name : i.sender_name}</span>
                <small>{new Date(i.created_at).toLocaleDateString()}</small>
              </button>
            ))}
          </aside>
          <div className="ait-panel">
            {active ? (
              <>
                <h2>{active.item_tag || "Shop inquiry"}</h2>
                <p>Contact phone: {active.phone}</p>
                <div className="ait-chat">
                  {messages.map((m) => (
                    <p key={m.id} className={m.is_from_me ? "mine" : ""}>
                      <small>
                        {m.is_from_me ? "You" : "Other participant"}
                      </small>
                      {m.content}
                    </p>
                  ))}
                </div>
                <form onSubmit={send} className="ait-form">
                  <label>
                    Reply
                    <textarea
                      required
                      maxLength={2000}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                    />
                  </label>
                  <button className="btn-primary" disabled={busy}>
                    {busy ? "Sending…" : "Send reply"}
                  </button>
                  <button
                    type="button"
                    className="ait-link"
                    onClick={() => open(active)}
                  >
                    Refresh conversation
                  </button>
                </form>
              </>
            ) : (
              <p>Select a conversation.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
