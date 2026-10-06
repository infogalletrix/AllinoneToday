import { Link } from "react-router-dom";
import { Heart, MapPin } from "lucide-react";
import { resolveImageUrl } from "../../api/client";
export default function ListingCard({
  item,
  favorites = [],
  onToggleFavorite,
}) {
  return (
    <article className="ait-listing card-hover">
      <Link to={"/listings/" + item.id}>
        <img
          src={resolveImageUrl(item.image_path)}
          alt={item.title}
          loading="lazy"
        />
        <div className="ait-listing-body">
          <small>{item.category}</small>
          <h3>{item.title}</h3>
          <strong>
            {item.formatted_price ||
              `₹${Number(item.price).toLocaleString("en-IN")}`}
          </strong>
          <p>
            <MapPin size={13} />
            {item.location}
          </p>
        </div>
      </Link>
      {onToggleFavorite && (
        <button
          className="ait-heart"
          onClick={() => onToggleFavorite(item.id)}
          aria-label={
            favorites.includes(item.id)
              ? "Remove from favorites"
              : "Save to favorites"
          }
        >
          <Heart
            size={20}
            fill={favorites.includes(item.id) ? "#F95738" : "none"}
          />
        </button>
      )}
    </article>
  );
}
