import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchListings } from "../../api/client";
import ListingCard from "../common/ListingCard";
import {startPublicCatalogueRefresh} from "../../publicCatalogueRefresh";
export default function TrendingSection({ favorites, onToggleFavorite, section }) {
  const [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => startPublicCatalogueRefresh({
    load:signal=>fetchListings({category:section?.category},{signal}),
    onPending:()=>setLoading(true),
    onData:rows=>{setItems(rows.slice(0,6));setError("");},
    onError:failure=>setError(failure.message),
    onSettled:()=>setLoading(false),
  }), [section?.category]);
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
      {error && (
        <p role="alert" className="ait-error">
          {error}{items.length ? " Your last loaded listings are still shown." : ""}
        </p>
      )}
      {loading&&!items.length ? (
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
      ) : !error && (
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
            Browse local shops in All in One Today. Platform administrators
            manage the marketplace with All in One Business.
          </p>
        </div>
        <Link className="btn-dark" to="/download">
          Get Android apps on Google Play →
        </Link>
      </div>}
    </section>
  );
}
