import { Link } from 'react-router-dom';
import { ArrowUpRight, MapPin, Store } from 'lucide-react';
import { resolveImageUrl } from '../../api/client';
import './ShopSearchResults.css';

export default function ShopSearchResults({ shops, error, onRetry, loading = false, hasMore = false, loadingMore = false, loadMoreError = '', onLoadMore }) {
  if (!shops.length && !error && !hasMore && !loading) return null;
  return <section className="shop-search-results" aria-label="Matching shops">
    <h2>Shops</h2>
    {loading && <p className="ait-result-count" role="status">Finding matching shops…</p>}
    {error && <p className="ait-error" role="alert">We couldn’t search shops. {error} <button type="button" className="ait-link" onClick={onRetry}>Try again</button></p>}
    {shops.length > 0 && <>
      <p className="ait-result-count" aria-live="polite">{shops.length} {shops.length === 1 ? 'shop' : 'shops'}{hasMore ? ' shown' : ''}</p>
      <div className="shop-search-grid">{shops.map(shop => <article className="shop-search-card" key={shop.id} aria-label={shop.name}>
        <Link className="shop-search-photo" to={'/shops/' + encodeURIComponent(shop.id)} aria-label={'View ' + shop.name}>
          {shop.image_path ? <img src={resolveImageUrl(shop.image_path)} alt="" loading="lazy" /> : <Store size={40} strokeWidth={1.3} aria-hidden="true" />}
        </Link>
        <div className="shop-search-body">
          <span className="shop-search-category">{shop.category}</span>
          <h3><Link to={'/shops/' + encodeURIComponent(shop.id)}>{shop.name}</Link></h3>
          <p className="shop-search-location"><MapPin size={15} aria-hidden="true" />{shop.location || 'Location not provided'}</p>
          {shop.description && <p className="shop-search-description">{shop.description}</p>}
          <div className="shop-search-footer"><span>{Number(shop.listings_count) > 0 ? shop.listings_count + (Number(shop.listings_count) === 1 ? ' listing' : ' listings') : 'No products yet'}</span><Link to={'/shops/' + encodeURIComponent(shop.id)}>View shop<ArrowUpRight size={16} aria-hidden="true" /></Link></div>
        </div>
      </article>)}</div>
    </>}
    {loadMoreError && <p className="ait-error" role="alert">We couldn’t load more shops. {loadMoreError} <button type="button" className="ait-link" onClick={onLoadMore}>Try loading more shops</button></p>}
    {hasMore && !loadMoreError && <div className="shop-search-more"><button type="button" className="btn-secondary" disabled={loadingMore||loading} onClick={onLoadMore}>{loadingMore ? 'Loading more shops…' : 'Load more shops'}</button></div>}
  </section>;
}
