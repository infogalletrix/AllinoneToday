import { useCallback, useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
  useNavigate,
  Link,
  Navigate,
} from "react-router-dom";
import Navbar from "./components/common/Navbar";
import Footer from "./components/common/Footer";
import ContactSellerModal from "./components/common/ContactSellerModal";
import AssistantChat from './components/common/AssistantChat';
import HomePage from "./pages/HomePage";
import ShopsPage from "./pages/ShopsPage";
import ShopProductsPage from "./pages/ShopProductsPage";
import ListingsPage from "./pages/ListingsPage";
import ListingDetailPage from "./pages/ListingDetailPage";
import AccountPage from "./pages/AccountPage";
import AdminPage from "./pages/ProductOwnerPage";
import MerchantPage from "./pages/MerchantPage";
import BusinessDashboardPage from "./pages/BusinessDashboardPage";
import MessagesPage from "./pages/MessagesPage";
import SellPage from "./pages/SellPage";
import MyListingsPage from "./pages/MyListingsPage";
import InformationPage from "./pages/InformationPage";
import ReviewInformationPage from "./pages/ReviewInformationPage";
import ResetPasswordPage from './pages/ResetPasswordPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import SupportPage from './pages/SupportPage';
import DeleteAccountPage from './pages/DeleteAccountPage';
import { AccountProvider, useAccount } from "./AccountContext";
import { SiteProvider } from "./SiteContext";
import { WishlistProvider, useWishlist } from './WishlistContext';
import { DialogProvider } from './components/common/DialogProvider';
import "./production.css";
function Application() {
  const navigate = useNavigate(),
    location = useLocation(),
    [contact, setContact] = useState(null);
  const wishlist=useWishlist(),favorites=wishlist.items.map(item=>item.id);
  const {user}=useAccount();
  const closeContact=useCallback(()=>setContact(null),[]);
  useEffect(() => {
    window.scrollTo(0, 0);
    setContact(null);
  }, [location.pathname]);
  const listingProps = { favorites, onToggleFavorite: wishlist.toggle },
    onOpenPostAd = () => navigate("/sell");
  const embedded=location.pathname==='/admin' && new URLSearchParams(location.search).get('embedded')==='1';
  return (
    <>
      {!embedded && <Navbar onOpenPostAd={onOpenPostAd} favoritesCount={favorites.length} />}
      <main style={{ flex: 1 }}>
        {(wishlist.notice||wishlist.error)&&<div className={'ait-wishlist-feedback '+(wishlist.error?'is-error':'')} role={wishlist.error?'alert':'status'}>{wishlist.error||wishlist.notice}{wishlist.error&&<button type="button" onClick={()=>{wishlist.clearError();wishlist.retry();}}>Retry wishlist</button>}</div>}
        {user?.must_change_password && location.pathname !== '/change-password' ? <Navigate replace to={'/change-password?next='+encodeURIComponent(location.pathname+location.search)} /> : <Routes>
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
          <Route path="/shops/:id" element={<ShopProductsPage onOpenContact={setContact} {...listingProps} />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/login" element={<AccountPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/delete-account" element={<DeleteAccountPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/merchant" element={<MerchantPage />} />
          <Route path="/business/register" element={<MerchantPage />} />
          <Route path="/business/*" element={<BusinessDashboardPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/sell" element={<SellPage />} />
          <Route path="/my-listings" element={<MyListingsPage />} />
          {["download", "terms", "privacy", "safety"].map((path) => (
            <Route key={path} path={"/" + path} element={<InformationPage />} />
          ))}
          {["about", "contact", "pricing", "refunds", "delivery"].map((path) => (
            <Route key={path} path={"/" + path} element={<ReviewInformationPage />} />
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
        </Routes>}
      </main>
      {!embedded && <Footer />}
      <ContactSellerModal
        isOpen={!!contact}
        listing={contact}
        onClose={closeContact}
      />
      {!embedded && !user?.must_change_password && <AssistantChat />}
    </>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <AccountProvider>
        <SiteProvider><WishlistProvider>
        <DialogProvider><Application /></DialogProvider>
        </WishlistProvider></SiteProvider>
      </AccountProvider>
    </BrowserRouter>
  );
}
