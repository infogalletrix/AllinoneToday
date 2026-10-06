import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchListings, categories } from "../api/client";
import ListingCard from "../components/common/ListingCard";
export default function ListingsPage({ favorites, onToggleFavorite }) {
  const [params, setParams] = useSearchParams(),
    [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    fetchListings(Object.fromEntries(params))
      .then((x) => {
        if (live) setItems(x);
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
  }, [params]);
  const shown =
    params.get("favorites") === "true"
      ? items.filter((i) => favorites.includes(i.id))
      : items;
  function submit(e) {
    e.preventDefault();
    const data = new FormData(e.target);
    const q = new URLSearchParams(params);
    for (const [k, v] of data) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    setParams(q);
  }
  return (
    <section className="ait-page">
      <p className="ait-eyebrow">EXPLORE YOUR POSSIBILITIES</p>
      <h1>
        {params.get("favorites") === "true"
          ? "Your saved finds"
          : "Find your next great find."}
      </h1>
      <form onSubmit={submit} className="ait-search">
        <input
          name="query"
          aria-label="Search listings"
          placeholder="Search products, services, locations…"
          defaultValue={params.get("query") || ""}
        />
        <input
          name="location"
          aria-label="Location"
          placeholder="Location"
          defaultValue={params.get("location") || ""}
        />
        <select
          name="category"
          aria-label="Category"
          defaultValue={params.get("category") || ""}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          name="sort"
          aria-label="Sort"
          defaultValue={params.get("sort") || ""}
        >
          <option value="">Newest first</option>
          <option value="price_low">Price: low to high</option>
          <option value="price_high">Price: high to low</option>
        </select>
        <button className="btn-primary">Search</button>
      </form>
      {error ? (
        <p className="ait-error" role="alert">
          {error}
        </p>
      ) : loading ? (
        <p>Loading listings…</p>
      ) : shown.length ? (
        <>
          <p className="ait-result-count">{shown.length} listing(s)</p>
          <div className="ait-listing-grid">
            {shown.map((i) => (
              <ListingCard
                key={i.id}
                item={i}
                favorites={favorites}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="ait-empty">
          <h2>No listings here yet.</h2>
          <p>
            Try another search, or be the first to share something worth
            finding.
          </p>
          <Link className="btn-primary" to="/sell">
            Post a listing
          </Link>
        </div>
      )}
    </section>
  );
}
