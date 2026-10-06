import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "../api/client";
export default function ShopsPage() {
  const [shops, setShops] = useState([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    request("/shops")
      .then(setShops)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <section className="ait-page">
      <p className="ait-eyebrow">DISCOVER LOCAL BUSINESS</p>
      <h1>Good shops. Great discoveries.</h1>
      <p className="ait-lead">
        Explore businesses with active shop registrations on All in One Today.
      </p>
      <Link className="btn-primary" to="/merchant">
        Register your shop
      </Link>
      {error ? (
        <p className="ait-error">{error}</p>
      ) : loading ? (
        <p>Loading shops…</p>
      ) : shops.length ? (
        <div className="ait-listing-grid">
          {shops.map((s) => (
            <article className="ait-panel" key={s.id}>
              <p className="ait-eyebrow">{s.category}</p>
              <h2>{s.name}</h2>
              <p>{s.location}</p>
              <p>{s.description}</p>
              <p>
                {s.listings_count} listing(s) · {s.branches} branch(es)
              </p>
              <Link className="ait-link" to={"/listings?shop_id=" + s.id}>
                Browse shop listings →
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="ait-empty">
          <h2>Our shop community starts here.</h2>
          <p>Subscribed shops will appear here when registration opens.</p>
        </div>
      )}
    </section>
  );
}
