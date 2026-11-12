import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAccount } from '../AccountContext';
import { request, createListing, uploadImage, resolveImageUrl } from '../api/client';
import { useSite } from '../SiteContext';
import { isSupportedListing, isSupportedCategory } from '../listingScope';

const moduleFields = {
  product: ['Availability'],
  service: ['Service area', 'Availability'],
};
const isActive = shop => shop.status === 'active' && !shop.moderated_hidden
  && new Date(shop.subscription?.paid_until).getTime() > Date.now();

export default function SellPage() {
  const { categories, site, error: siteError, refresh: refreshSite } = useSite();
  const { user, loading } = useAccount();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const requestedShop = params.get('shop');
  const [shops, setShops] = useState([]);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [form, setForm] = useState({ title: '', price: '', category: '', location: '',
    description: '', shop_id: '', branch_id: '', image_path: '', gallery: [], specifications: {}, subcategory: '' });
  const categoryData = site.categories.find(category => category.name === form.category);
  const kind = categoryData?.module === 'service' || form.category === 'Services' ? 'service' : 'product';
  const noun = kind === 'service' ? 'service' : 'product';
  const currentShop = shops.find(shop => shop.id === form.shop_id);
  const field = key => ({ value: form[key], onChange: event => setForm(previous => ({ ...previous, [key]: event.target.value })) });

  useEffect(() => {
    if (loading || user?.role !== 'merchant') return;
    let live = true;
    setFetching(true); setReady(false); setError(''); setFile(null);
    Promise.all([request('/shops/mine'), editId ? request('/seller/catalogue') : Promise.resolve([])])
      .then(([allShops, items]) => {
        if (!live) return;
        const active = allShops.filter(isActive);
        setShops(active);
        if (editId) {
          const item = items.find(value => value.id === editId && value.status === 'active');
          if (!item) throw new Error('This active listing was not found in your catalogue.');
          if (!isSupportedListing(item)) throw new Error('This listing category is no longer supported.');
          if (!active.some(shop => shop.id === item.shop_id)) throw new Error('Renew this shop subscription before editing its listings.');
          setForm({ title: item.title, price: item.price, category: item.category, location: item.location,
            description: item.description, shop_id: item.shop_id, branch_id: item.branch_id || '',
            image_path: item.image_path, gallery: item.gallery || [], specifications: item.specifications || {}, subcategory: item.subcategory || '' });
        } else {
          const selected = active.find(shop => shop.id === requestedShop) || active[0];
          setForm({ title: '', price: '', category: isSupportedCategory(selected?.category) ? selected?.category || '' : '', location: selected?.location || '',
            description: '', shop_id: selected?.id || '', branch_id: selected?.branch_details?.length === 1 ? selected.branch_details[0].id : '',
            image_path: '', gallery: [], specifications: {}, subcategory: '' });
        }
        setReady(true);
      }).catch(cause => { if (live) setError(cause.message); })
      .finally(() => { if (live) setFetching(false); });
    return () => { live = false; };
  }, [user?.id, user?.role, loading, editId, requestedShop, revision]);

  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      if (!ready || !currentShop || !isActive(currentShop)) throw new Error('Choose an active subscribed shop.');
      if (!categoryData || !isSupportedCategory(categoryData) || !categories.includes(form.category))
        throw new Error('Choose a supported product or service category.');
      if (file && (file.size > 8 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)))
        throw new Error('Choose a JPEG, PNG or WebP photo up to 8 MB.');
      if (!file && !form.image_path) throw new Error('Choose a photo for your listing.');
      const image_path = file ? await uploadImage(file) : form.image_path;
      const payload = { ...form, price: Number(form.price), kind, image_path,
        branch_id: form.branch_id || null };
      if (editId) await request('/listings/' + editId, { method: 'PATCH', body: JSON.stringify(payload) });
      else await createListing(payload);
      navigate('/business/products');
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  return <section className="ait-page">
    <p className="ait-eyebrow">BUSINESS CATALOGUE</p>
    <h1>{editId ? 'Edit your listing' : 'Add to your shop'}</h1>
    <p className="ait-lead">Publish products and services for customers on AllInOneToday.com.</p>
    {user?.role === 'merchant' && <Link className="ait-link" to="/business/products">← Back to business dashboard</Link>}
    {error && <p role="alert" className="ait-error">{error}</p>}
    {siteError && <div role="alert" className="ait-error">Categories could not be loaded. {siteError} <button type="button" className="ait-link" onClick={refreshSite}>Reload categories</button></div>}
    {loading ? <p role="status">Loading account…</p> : !user ? <div className="ait-panel">
      <h2>Sign in to your business account</h2>
      <p>A registered shop and active subscription are required to publish.</p>
      <Link className="btn-primary" to="/account?role=merchant&next=/sell">Business owner login</Link>
      <p><Link className="ait-link" to="/business/register">Register your business</Link></p>
    </div> : user.role !== 'merchant' ? <div className="ait-panel">
      <h2>A business owner account is required</h2>
      <p>Register your business to add a shop and publish its products.</p>
      <Link className="btn-primary" to={user.role === 'admin' ? '/admin' : '/business/register'}>
        {user.role === 'admin' ? 'Product-owner dashboard' : 'Register your business'}</Link>
    </div> : fetching ? <p role="status">Loading your shops and catalogue…</p> : !ready ? <div className="ait-panel">
      <p>Your listing could not be loaded. You can retry or return to your catalogue.</p>
      <button className="btn-secondary" onClick={() => setRevision(value => value + 1)}>Try again</button>
    </div> : !shops.length ? <div className="ait-panel">
      <h2>Activate your shop subscription</h2>
      <p>Complete shop registration and payment before publishing business listings.</p>
      <Link className="btn-primary" to="/business/register">Continue registration</Link>
    </div> : <form onSubmit={submit} className="ait-panel ait-form">
      <fieldset disabled={busy} className="ait-listing-fields">
        <div className="ait-form-grid">
          <label>Shop<select aria-label="Shop" required value={form.shop_id} onChange={event => {
            const shop = shops.find(value => value.id === event.target.value);
            setForm(previous => ({ ...previous, shop_id: event.target.value, location: shop?.location || '',
              branch_id: shop?.branch_details?.length === 1 ? shop.branch_details[0].id : '' }));
          }}><option value="">Choose your shop</option>{shops.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label>
          <label>Category<select aria-label="Category" required {...field('category')}>
            <option value="">Choose category</option>{categories.map(category => <option key={category}>{category}</option>)}
          </select></label>
          {currentShop?.branch_details?.length > 0 && <label>Branch<select aria-label="Branch" required {...field('branch_id')}>
            <option value="">Choose registered branch</option>{currentShop.branch_details.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select></label>}
          <label>{kind === 'service' ? 'Service name' : 'Product name'}
            <input required minLength={3} maxLength={150} {...field('title')} /></label>
          <label>Price (₹)<input required type="number" min={0} max={99999999999} step="0.01" {...field('price')} /></label>
          <label>Location<input required minLength={2} maxLength={180} {...field('location')} /></label>
          {moduleFields[kind].map(key => <label key={key}>{key}<input required maxLength={300}
            value={form.specifications[key] || ''} onChange={event => setForm(previous => ({ ...previous,
              specifications: { ...previous.specifications, [key]: event.target.value } }))} /></label>)}
          <label>{editId ? 'Replace photo (optional)' : 'Photo'}<input required={!form.image_path} type="file" accept="image/jpeg,image/png,image/webp"
            onChange={event => setFile(event.target.files?.[0] || null)} /><small>JPEG, PNG or WebP · maximum 8 MB</small></label>
        </div>
        {form.image_path && !file && <img className="ait-listing-edit-photo" src={resolveImageUrl(form.image_path)} alt="Current listing" />}
        <label>Description<textarea aria-label="Description" required minLength={10} maxLength={5000} rows={5} {...field('description')} /></label>
      </fieldset>
      <p>Customer enquiries about this {noun} arrive directly in your Messages inbox.</p>
      <button className="btn-primary" disabled={busy || !ready || !categories.includes(form.category)}>
        {busy ? 'Saving…' : editId ? 'Save changes' : `Publish ${noun}`}</button>
    </form>}
  </section>;
}
