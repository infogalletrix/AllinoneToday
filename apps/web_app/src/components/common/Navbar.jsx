import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, Heart, MessageSquare, Menu, X, Building2, LayoutDashboard } from 'lucide-react';
import { useAccount } from '../../AccountContext';
import './Navbar.css';
import BrandLogo from './BrandLogo';

export default function Navbar({ onOpenPostAd, favoritesCount = 0 }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const { user } = useAccount();
  const dashboardLink = user?.role === 'admin' ? '/admin' : user?.role === 'merchant' ? '/business' : user?.role === 'support' ? '/support' : null;
  const dashboardLabel = user?.role === 'admin' ? 'Admin dashboard' : user?.role === 'merchant' ? 'My business' : 'Support dashboard';
  useEffect(() => setMobileMenuOpen(false), [location.pathname, location.search]);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 40) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`navbar-root ${scrolled ? 'navbar-scrolled' : 'navbar-transparent'}`}>
      <div className="container navbar-container">
        {/* The supplied artwork includes the full wordmark. */}
        <Link to="/" className="figma-navbar-brand" aria-label="All in One Today home">
          <BrandLogo />
        </Link>

        {/* Desktop Navigation Links matching Figma Desktop - 71: Browse, Shops, Favorites, Message, Post an Ad */}
        <nav className="figma-desktop-nav">
          <Link to="/listings" className="figma-nav-item">
            <Search size={16} className="nav-item-icon" />
            <span>Browse</span>
          </Link>

          <Link to="/shops" className="figma-nav-item">
            <Building2 size={16} className="nav-item-icon" />
            <span>Shops</span>
          </Link>

          <Link to="/listings?favorites=true" className="figma-nav-item">
            <Heart size={16} className="nav-item-icon" />
            <span>Wishlist</span>
            {favoritesCount > 0 && <span className="nav-fav-pill">{favoritesCount}</span>}
          </Link>

          <Link to="/messages" className="figma-nav-item">
            <MessageSquare size={16} className="nav-item-icon" />
            <span>Messages</span>
          </Link>

          {dashboardLink&&<Link to={dashboardLink} className="figma-nav-item figma-business-link">
            <LayoutDashboard size={16} />
            <span>{dashboardLabel}</span>
          </Link>}
          <Link to={user?'/account':'/login'} className="figma-nav-item">{user ? 'My account' : 'Login'}</Link>
        </nav>

        {/* Mobile Toggle */}
        <button 
          className="mobile-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
          aria-expanded={mobileMenuOpen}
          aria-controls="public-mobile-menu"
        >
          {mobileMenuOpen ? <X size={24} color="#ffffff" /> : <Menu size={24} color="#ffffff" />}
        </button>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <nav className="figma-mobile-drawer" id="public-mobile-menu" aria-label="Mobile navigation">
          <Link to="/listings" onClick={() => setMobileMenuOpen(false)}>
            <Search size={16} />
            <span>Browse</span>
          </Link>
          <Link to="/listings?favorites=true" onClick={() => setMobileMenuOpen(false)}>
            <Heart size={16} />
            <span>Wishlist</span>
          </Link>
          <Link to="/shops" onClick={() => setMobileMenuOpen(false)}>
            <span>Shops</span>
          </Link>
          <Link to="/messages" onClick={() => setMobileMenuOpen(false)}>Messages</Link>
          {dashboardLink&&<Link to={dashboardLink} onClick={() => setMobileMenuOpen(false)}><LayoutDashboard size={16} />{dashboardLabel}</Link>}
          <Link to={user?'/account':'/login'} onClick={() => setMobileMenuOpen(false)}>{user ? 'My account' : 'Login'}</Link>
          <Link to="/download" onClick={() => setMobileMenuOpen(false)}>Get Android apps</Link>
        </nav>
      )}
    </header>
  );
}
