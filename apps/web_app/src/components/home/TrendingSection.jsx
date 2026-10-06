import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchListings } from "../../api/client";
import ListingCard from "../common/ListingCard";
export default function TrendingSection({ favorites, onToggleFavorite }) {
  const [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchListings()
      .then((x) => setItems(x.slice(0, 6)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <section className="ait-home-section container">
      <div className="section-header">
        <div>
          <h2 className="section-title">Fresh finds, all in one place.</h2>
          <p className="section-subtitle">
            The latest listings from our community.
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
          <h3>Something great starts with the first listing.</h3>
          <p>Have something to sell? Make it someone’s next discovery.</p>
          <Link className="btn-primary" to="/sell">
            Post your first listing
          </Link>
          <Link className="btn-secondary" to="/merchant">
            For shop owners
          </Link>
        </div>
      )}
      <div className="ait-download-banner">
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
      </div>
    </section>
  );
}
