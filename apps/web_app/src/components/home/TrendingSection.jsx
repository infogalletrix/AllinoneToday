import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchListings } from "../../api/client";
import ListingCard from "../common/ListingCard";
export default function TrendingSection({ favorites, onToggleFavorite, section }) {
  const [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchListings({category:section?.category})
      .then((x) => setItems(x.slice(0, 6)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [section?.category]);
  return (
    <section className="ait-home-section container">
      <div className="section-header">
        <div>
          <h2 className="section-title">{section?.title}</h2>
          <p className="section-subtitle">
            {section?.body}
          </p>
        </div>
        <Link className="section-link" to="/listings">
          Explore all →
        </Link>
      </div>
      {error ? (
        <p role="alert" className="ait-error">
          {error}
        </p>
      ) : loading ? (
        <p>Loading the latest finds…</p>
      ) : items.length ? (
        <div className="ait-listing-grid">
          {items.map((i) => (
            <ListingCard
              key={i.id}
              item={i}
              favorites={favorites}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      ) : (
        <div className="ait-empty">
          <h3>New discoveries are on their way.</h3>
          <p>Browse categories and check back for listings from local shops.</p>
        </div>
      )}
      {false && <div className="ait-download-banner">
        <div>
          <p className="ait-eyebrow">TAKE YOUR MARKETPLACE WITH YOU</p>
          <h2>All in One Today, on Android.</h2>
          <p>
            Browse and connect with the public app. Grow your business with the
            shop-owner app.
          </p>
        </div>
        <Link className="btn-dark" to="/download">
          Get the apps →
        </Link>
      </div>}
    </section>
  );
}
