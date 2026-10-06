import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, Heart, MessageSquare, Menu, X, Building2 } from 'lucide-react';
import './Navbar.css';

export default function Navbar({ onOpenPostAd, favoritesCount = 0 }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

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
        {/* Brand Logo matching Figma Desktop - 71 */}
        <Link to="/" className="figma-navbar-brand">
          <span className="figma-brand-text">All in One Today</span>
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
            <span>Favorites</span>
            {favoritesCount > 0 && <span className="nav-fav-pill">{favoritesCount}</span>}
          </Link>

          <Link to="/messages" className="figma-nav-item">
            <MessageSquare size={16} className="nav-item-icon" />
            <span>Message</span>
          </Link>

          <Link to="/account" className="figma-nav-item">Account</Link>
          <Link to="/merchant" className="figma-nav-item">For shops</Link>

          {/* Black Pill Button: "Post an Ad" matching Figma Desktop - 71 */}
          <button 
            type="button"
            onClick={onOpenPostAd}
            className="figma-post-btn-black"
          >
            Post an Ad
          </button>
        </nav>

        {/* Mobile Toggle */}
        <button 
          className="mobile-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X size={24} color="#ffffff" /> : <Menu size={24} color="#ffffff" />}
        </button>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="figma-mobile-drawer">
          <Link to="/listings" onClick={() => setMobileMenuOpen(false)}>
            <Search size={16} />
            <span>Browse</span>
          </Link>
          <Link to="/listings?favorites=true" onClick={() => setMobileMenuOpen(false)}>
            <Heart size={16} />
            <span>Favorites</span>
          </Link>
          <Link to="/shops" onClick={() => setMobileMenuOpen(false)}>
            <span>Shops</span>
          </Link>
          <Link to="/messages" onClick={() => setMobileMenuOpen(false)}>Messages</Link>
          <Link to="/account" onClick={() => setMobileMenuOpen(false)}>Account</Link>
          <Link to="/merchant" onClick={() => setMobileMenuOpen(false)}>For shop owners</Link>
          <Link to="/download" onClick={() => setMobileMenuOpen(false)}>Download apps</Link>
          <button 
            type="button"
            onClick={() => { setMobileMenuOpen(false); onOpenPostAd(); }}
            className="figma-post-btn-black"
            style={{ width: '100%', marginTop: '10px' }}
          >
            Post an Ad
          </button>
        </div>
      )}
    </header>
  );
}
