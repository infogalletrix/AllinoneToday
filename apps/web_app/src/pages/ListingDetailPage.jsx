import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchListing, resolveImageUrl, post } from "../api/client";
import { useAccount } from "../AccountContext";
export default function ListingDetailPage({
  onOpenContact,
  favorites,
  onToggleFavorite,
}) {
  const { id } = useParams(),
    { user } = useAccount(),
    [item, setItem] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setItem(null);
    fetchListing(id)
      .then((x) => {
        if (live) setItem(x);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [id]);
  async function report() {
    const reason = window.prompt(
      "Tell us what is wrong with this listing (minimum 10 characters)",
    );
    if (!reason) return;
    try {
      await post("/reports", { listingId: id, reason });
      window.alert("Report submitted for review.");
    } catch (e) {
      setError(e.message);
    }
  }
  async function block() {
    if (
      !window.confirm(
        "Block this seller? Neither account will be able to send new messages to the other.",
      )
    )
      return;
    try {
      await post("/blocks", { accountId: item.seller_id });
      window.alert(
        "Seller blocked. Manage blocked accounts from your Account page.",
      );
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <section className="ait-page">
      <Link className="ait-link" to="/listings">
        ← Back to listings
      </Link>
      {loading ? (
        <p>Loading…</p>
      ) : !item ? (
        <p className="ait-error" role="alert">
          {error || "Listing not found."}
        </p>
      ) : (
        <>
          <div className="ait-detail">
            <img
              className="ait-detail-image"
              src={resolveImageUrl(item.image_path)}
              alt={item.title}
            />
            <div className="ait-panel">
              <p className="ait-eyebrow">{item.category}</p>
              <h1>{item.title}</h1>
              <p className="ait-price">{item.formatted_price}</p>
              <p>{item.location}</p>
              <p>Listed by {item.seller_name}</p>
              <div className="ait-actions">
                <button
                  className="btn-primary"
                  onClick={() => onOpenContact(item)}
                >
                  Contact seller
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => onToggleFavorite(id)}
                >
                  {favorites.includes(id) ? "Saved ♥" : "Save listing"}
                </button>
              </div>
              <p className="ait-safety">
                Inspect before paying. Never share an OTP or transfer an advance
                to an unverified seller. All in One Today does not collect
                payment for listed products.
              </p>
            </div>
          </div>
          <div className="ait-panel">
            <h2>About this listing</h2>
            <p className="ait-description">{item.description}</p>
            {Object.keys(item.specifications || {}).length > 0 && (
              <dl>
                {Object.entries(item.specifications).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p>Posted {new Date(item.created_at).toLocaleDateString()}</p>
            {user ? (
              <div className="ait-actions"><button className="ait-link" onClick={report}>
                Report this listing
              </button><button className="ait-link" onClick={block}>Block seller</button></div>
            ) : (
              <Link className="ait-link" to={"/account?next=/listings/" + id}>
                Sign in to report this listing
              </Link>
            )}
            {error && (
              <p role="alert" className="ait-error">
                {error}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
