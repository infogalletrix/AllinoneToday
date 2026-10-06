import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "../api/client";
import { useAccount } from "../AccountContext";
import ListingCard from "../components/common/ListingCard";
export default function MyListingsPage() {
  const { user } = useAccount(),
    [items, setItems] = useState([]),
    [error, setError] = useState("");
  async function refresh() {
    setItems(await request("/seller/catalogue"));
  }
  useEffect(() => {
    if (user) refresh().catch((e) => setError(e.message));
  }, [user]);
  async function remove(id) {
    if (!window.confirm("Remove this listing from the marketplace?")) return;
    try {
      await request("/listings/" + id, { method: "DELETE" });
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <section className="ait-page">
      <h1>My listings</h1>
      {error && <p className="ait-error">{error}</p>}
      {!user ? (
        <Link className="btn-primary" to="/account?next=/my-listings">
          Sign in
        </Link>
      ) : (
        <>
          <Link className="btn-primary" to="/sell">
            Post a listing
          </Link>
          <div className="ait-listing-grid">
            {items.map((i) => (
              <div key={i.id}>
                <ListingCard item={i} />
                <p>Status: {i.status}</p>
                {i.status === "active" && (
                  <button className="ait-link" onClick={() => remove(i.id)}>
                    Remove listing
                  </button>
                )}
              </div>
            ))}
          </div>
          {!items.length && (
            <p className="ait-empty">You haven’t posted any listings yet.</p>
          )}
        </>
      )}
    </section>
  );
}
