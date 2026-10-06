import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
  useNavigate,
  Link,
} from "react-router-dom";
import Navbar from "./components/common/Navbar";
import Footer from "./components/common/Footer";
import ContactSellerModal from "./components/common/ContactSellerModal";
import HomePage from "./pages/HomePage";
import ShopsPage from "./pages/ShopsPage";
import ListingsPage from "./pages/ListingsPage";
import ListingDetailPage from "./pages/ListingDetailPage";
import AccountPage from "./pages/AccountPage";
import AdminPage from "./pages/AdminPage";
import MerchantPage from "./pages/MerchantPage";
import MessagesPage from "./pages/MessagesPage";
import SellPage from "./pages/SellPage";
import MyListingsPage from "./pages/MyListingsPage";
import InformationPage from "./pages/InformationPage";
import { AccountProvider } from "./AccountContext";
import "./production.css";
function Application() {
  const navigate = useNavigate(),
    location = useLocation(),
    [contact, setContact] = useState(null),
    [favorites, setFavorites] = useState(() => {
      try {
        return JSON.parse(localStorage.getItem("ait_favorites")) || [];
      } catch {
        return [];
      }
    });
  useEffect(() => {
    window.scrollTo(0, 0);
    setContact(null);
  }, [location.pathname]);
  function toggle(id) {
    setFavorites((previous) => {
      const next = previous.includes(id)
        ? previous.filter((x) => x !== id)
        : [...previous, id];
      localStorage.setItem("ait_favorites", JSON.stringify(next));
      return next;
    });
  }
  const listingProps = { favorites, onToggleFavorite: toggle },
    onOpenPostAd = () => navigate("/sell");
  return (
    <>
      <Navbar onOpenPostAd={onOpenPostAd} favoritesCount={favorites.length} />
      <main style={{ flex: 1 }}>
        <Routes>
          <Route
            path="/"
            element={<HomePage onOpenPostAd={onOpenPostAd} {...listingProps} />}
          />
          <Route
            path="/listings"
            element={<ListingsPage {...listingProps} />}
          />
          <Route
            path="/listings/:id"
            element={
              <ListingDetailPage onOpenContact={setContact} {...listingProps} />
            }
          />
          <Route path="/shops" element={<ShopsPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/merchant" element={<MerchantPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/sell" element={<SellPage />} />
          <Route path="/my-listings" element={<MyListingsPage />} />
          {["download", "terms", "privacy", "safety"].map((path) => (
            <Route key={path} path={"/" + path} element={<InformationPage />} />
          ))}
          <Route
            path="*"
            element={
              <section className="ait-page">
                <h1>Page not found</h1>
                <Link className="btn-primary" to="/">
                  Return home
                </Link>
              </section>
            }
          />
        </Routes>
      </main>
      <Footer />
      <ContactSellerModal
        isOpen={!!contact}
        listing={contact}
        onClose={() => setContact(null)}
      />
    </>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <AccountProvider>
        <Application />
      </AccountProvider>
    </BrowserRouter>
  );
}
