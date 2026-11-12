import { Link } from "react-router-dom";
import { Heart, MapPin, MessageCircle } from "lucide-react";
import { resolveImageUrl } from "../../api/client";
import { isDemoCatalogueItem } from "../../catalogueAccess";
import {useWishlist} from '../../WishlistContext';
import {useAccount} from '../../AccountContext';
import ListingPrice from './ListingPrice';
export default function ListingCard({
  item,
  favorites = [],
  onToggleFavorite,
}) {
  const demo = isDemoCatalogueItem(item);
  const wishlist=useWishlist();
  const {user}=useAccount();
  const chatPath='/listings/'+item.id+'?chat=1';
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
          <ListingPrice item={item}/>
          {!demo && <p>
            <MapPin size={13} />
            {item.location}
          </p>}
        </div>
      </Link>
      {!demo&&item.enquiry_enabled===true&&item.enquiry_recipient_id!==user?.id&&<div className="ait-card-chat"><Link to={user?chatPath:'/login?next='+encodeURIComponent(chatPath)}><MessageCircle size={16}/>Chat with seller</Link><small>Directly with the shop or listing owner</small></div>}
      {onToggleFavorite && !demo && (
        <button
          className="ait-heart"
          disabled={wishlist?.loading||wishlist?.pendingIds.includes(item.id)}
          aria-pressed={favorites.includes(item.id)}
          onClick={() => { if (!isDemoCatalogueItem(item)) onToggleFavorite(item.id); }}
          aria-label={
            favorites.includes(item.id)
              ? "Remove from wishlist"
              : "Add to wishlist"
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
