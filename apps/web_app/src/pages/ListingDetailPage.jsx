import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { fetchListing, resolveImageUrl, post } from "../api/client";
import { useAccount } from "../AccountContext";
import { useWishlist } from "../WishlistContext";
import { adminChatDisclosure, isDemoCatalogueItem, enquiryUnavailableReason } from "../catalogueAccess";
import ListingPrice from '../components/common/ListingPrice';
import {MRP_KEY,OFFER_PRICE_KEY} from '../productPricing';
import { useDialogs } from '../components/common/DialogProvider';
import {startPublicCatalogueRefresh,publicCatalogueDetailFailure,publicCatalogueUnavailable} from '../publicCatalogueRefresh';
export default function ListingDetailPage({
  onOpenContact,
  favorites,
  onToggleFavorite,
}) {
  const { confirm, prompt, alert } = useDialogs();
  const { id } = useParams(),
    { user } = useAccount(),
    [state, setState] = useState({id,item:null,error:'',loading:true,unavailable:false}),
    [attempt,setAttempt]=useState(0);
  const {item,error,loading,unavailable}=state.id===id?state:{item:null,error:'',loading:true,unavailable:false};
  const setError=value=>setState(previous=>previous.id===id?{...previous,error:value}:previous);
  const [params] = useSearchParams();
  const autoOpened = useRef("");
  const wishlist = useWishlist();
  const demo = isDemoCatalogueItem(item) || isDemoCatalogueItem({ id });
  const unavailableReason = enquiryUnavailableReason(item, user);
  const visibleSpecifications=Object.entries(item?.specifications||{}).filter(([key])=>![MRP_KEY,OFFER_PRICE_KEY].includes(key));
  useEffect(()=>startPublicCatalogueRefresh({
    load:signal=>fetchListing(id,{signal}),
    onPending:()=>setState(previous=>previous.id===id?{...previous,loading:!previous.item,error:''}:{id,item:null,error:'',loading:true,unavailable:false}),
    onData:value=>setState({id,item:value,error:'',loading:false,unavailable:false}),
    onError:failure=>{
      setState(previous=>publicCatalogueDetailFailure(previous.id===id?previous:{id,item:null},failure));
      if(publicCatalogueUnavailable(failure))onOpenContact?.(null);
    },
  }),[id,attempt,onOpenContact]);
  useEffect(() => {
    if (!user || !item || params.get("chat") !== "1" || enquiryUnavailableReason(item, user)) return;
    const key = user.id + ":" + item.id;
    if (autoOpened.current === key) return;
    autoOpened.current = key;
    onOpenContact(item);
  }, [user, item, params, onOpenContact]);
  async function report() {
    if (demo) return;
    const reason = await prompt({
      title: 'Report this listing',
      message: 'Tell us what is wrong with this listing. Include at least 10 characters so we can review your report.',
      inputLabel: 'Reason for reporting',
      required: true,
      minLength: 10,
      maxLength: 2000,
      confirmLabel: 'Submit report',
    });
    if (reason === null) return;
    try {
      await post("/reports", { listingId: id, reason });
      await alert({ title: 'Report submitted', message: 'Your report has been submitted for review.', confirmLabel: 'Done' });
    } catch (e) {
      setError(e.message);
    }
  }
  async function block() {
    if (demo) return;
    if (!await confirm({
      title: 'Block this seller?',
      message: 'You and this seller will no longer be able to send each other messages. Manage blocked accounts from your Account page.',
      confirmLabel: 'Block seller',
      tone: 'danger',
    })) return;
    try {
      await post("/blocks", { accountId: item.seller_id });
      await alert({ title: 'Seller blocked', message: 'Manage blocked accounts from your Account page.', confirmLabel: 'Done' });
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
          {unavailable?"This listing is no longer available.":error || "Listing not found."}
          <button className="ait-link" type="button" onClick={()=>setAttempt(value=>value+1)}>Check again</button>
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
              <ListingPrice item={item}/>
              {!demo && <p>{item.location}</p>}
              {!demo && <p>Listed by {item.seller_name}</p>}
              {demo ? (
                <p className="ait-notice" role="status">This illustration is read-only. It has no seller or enquiry form.</p>
              ) : <>
                <div className="ait-actions">
                <button
                  className="btn-primary"
                  onClick={() => { if (!enquiryUnavailableReason(item, user)) onOpenContact(item); }}
                  disabled={Boolean(unavailableReason)}
                >
                  Chat with seller
                </button>
                <button
                  className="btn-secondary"
                  aria-pressed={favorites.includes(id)}
                  disabled={wishlist.loading || wishlist.pendingIds.includes(id)}
                  onClick={() => { if (!isDemoCatalogueItem(item)) onToggleFavorite(id); }}
                >
                  {favorites.includes(id) ? "Remove from wishlist" : "Add to wishlist"}
                </button>
                </div>
                <p className="ait-safety">{adminChatDisclosure}</p>
                {unavailableReason && <p className="ait-notice" role="status">{unavailableReason}</p>}
              <p className="ait-safety">
                Your message goes directly to the seller. Inspect before
                paying. Never share an OTP or transfer an advance
                to an unverified seller. All in One Today does not collect
                payment for listed products or services.
              </p>
              </>}
            </div>
          </div>
          <div className="ait-panel">
            <h2>About this listing</h2>
            <p className="ait-description">{item.description}</p>
            {visibleSpecifications.length > 0 && (
              <dl>
                {visibleSpecifications.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {!demo && <p>Posted {new Date(item.created_at).toLocaleDateString()}</p>}
            {!demo && (user ? (
              <div className="ait-actions"><button className="ait-link" onClick={report}>
                Report this listing
              </button><button className="ait-link" onClick={block}>Block listing publisher</button></div>
            ) : (
              <Link className="ait-link" to={"/account?next=/listings/" + id}>
                Sign in to report this listing
              </Link>
            ))}
            {error && (
              <p role="alert" className="ait-error">
                {error}
                <button className="ait-link" type="button" onClick={()=>setAttempt(value=>value+1)}>Try again</button>
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
