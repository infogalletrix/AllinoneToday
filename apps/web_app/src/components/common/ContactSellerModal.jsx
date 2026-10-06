import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { useAccount } from "../../AccountContext";
import { sendInquiry } from "../../api/client";
import "./ContactSellerModal.css";
export default function ContactSellerModal({ isOpen, onClose, listing }) {
  const { user } = useAccount(),
    [phone, setPhone] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setPhone(user?.phone || "");
    setMessage(
      listing
        ? `Hi, I’m interested in ${listing.title}. Is it still available?`
        : "",
    );
    setError("");
    setSent(false);
  }, [listing, user]);
  if (!isOpen || !listing) return null;
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await sendInquiry({ listing_id: listing.id, phone, message });
      setSent(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="contact-title">Contact {listing.seller_name || "seller"}</h2>
          <button onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        {!user ? (
          <>
            <p>Sign in to send a message and keep track of replies.</p>
            <Link
              className="btn-primary"
              to={"/account?next=/listings/" + listing.id}
              onClick={onClose}
            >
              Sign in
            </Link>
          </>
        ) : sent ? (
          <div className="ait-form">
            <h3>Your inquiry has been delivered.</h3>
            <Link className="btn-primary" to="/messages" onClick={onClose}>
              Open messages
            </Link>
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="ait-form">
            <p>About: {listing.title}</p>
            <label>
              Your phone
              <input
                required
                type="tel"
                minLength={7}
                maxLength={30}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label>
              Message
              <textarea
                required
                minLength={2}
                maxLength={2000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <p>
              Your name and phone are shared with this seller when you submit.
            </p>
            {error && (
              <p role="alert" className="ait-error">
                {error}
              </p>
            )}
            <button className="btn-primary" disabled={busy}>
              {busy ? "Sending…" : "Send inquiry"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
