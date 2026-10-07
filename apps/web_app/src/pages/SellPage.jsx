import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAccount } from "../AccountContext";
import { request, createListing, uploadImage } from "../api/client";
import {useSite} from '../SiteContext';
export default function SellPage() {
  const {categories}=useSite();
  const { user, loading } = useAccount(),
    navigate = useNavigate(),
    [shops, setShops] = useState([]),
    [file, setFile] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState({
      title: "",
      price: "",
      category: "Vehicles",
      location: "",
      description: "",
      shop_id: "",
    });
  const field = (k) => ({
    value: form[k],
    onChange: (e) => setForm({ ...form, [k]: e.target.value }),
  });
  useEffect(() => {
    if (user?.role === "merchant")
      request("/shops/mine")
        .then((s) =>
          setShops(
            s.filter(
              (x) =>
                x.subscription?.paid_until &&
                new Date(x.subscription.paid_until) > new Date(),
            ),
          ),
        )
        .catch((e) => setError(e.message));
  }, [user]);
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (!file) throw new Error("Choose a photo for your listing.");
      const image_path = await uploadImage(file);
      const item = await createListing({
        ...form,
        price: Number(form.price),
        shop_id: form.shop_id || null,
        image_path,
      });
      navigate("/listings/" + item.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ait-page">
      <h1>Make room for something new.</h1>
      <p className="ait-lead">
        Create a listing and connect directly with interested buyers.
      </p>
      {error && (
        <p role="alert" className="ait-error">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading…</p>
      ) : !user ? (
        <Link className="btn-primary" to="/account?next=/sell">
          Sign in to post a listing
        </Link>
      ) : user.role === "merchant" && !shops.length ? (
        <div className="ait-panel">
          Activate your shop subscription before publishing business listings.{" "}
          <Link className="ait-link" to="/merchant">
            Manage your shop
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="ait-panel ait-form">
          <div className="ait-form-grid">
            <label>
              Title
              <input
                required
                minLength={3}
                maxLength={150}
                {...field("title")}
              />
            </label>
            <label>
              Price (₹)
              <input
                required
                type="number"
                min={0}
                max={99999999999}
                step="0.01"
                {...field("price")}
              />
            </label>
            <label>
              Category
              <select {...field("category")}>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Location
              <input
                required
                minLength={2}
                maxLength={180}
                {...field("location")}
              />
            </label>
            {user.role === "merchant" && (
              <label>
                Subscribed shop
                <select required {...field("shop_id")}>
                  <option value="">Choose shop</option>
                  {shops.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Photo (JPEG, PNG, WebP · maximum 8 MB)
              <input
                required
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files[0])}
              />
            </label>
          </div>
          <label>
            Description
            <textarea
              required
              minLength={10}
              maxLength={5000}
              rows={5}
              {...field("description")}
            />
          </label>
          <p>
            Only post items or services you are authorized to offer. Do not
            include sensitive personal details.
          </p>
          <button className="btn-primary" disabled={busy}>
            {busy ? "Publishing…" : "Publish listing"}
          </button>
        </form>
      )}
    </section>
  );
}
