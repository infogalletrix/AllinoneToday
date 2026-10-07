import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';
import {useSite} from '../../SiteContext';

export default function Footer() {
  const {site,categories}=useSite();
  return (
    <footer className="footer-root-figma">
      <div className="container footer-container-figma">
        <div className="footer-grid-figma">
          {/* Column 1: Marketplace Brand & Tagline */}
          <div className="footer-col-brand">
            <Link to="/" className="footer-brand-title">
              All in One Today
            </Link>
            <p className="footer-brand-desc">
              {site.tagline}
            </p>
          </div>

          {/* Column 2: Explore */}
          <div className="footer-col-links">
            <h4 className="footer-col-head">Explore</h4>
            <ul className="footer-links-list">
              {categories.slice(0,5).map(category=><li key={category}><Link to={'/listings?category='+encodeURIComponent(category)}>{category}</Link></li>)}
            </ul>
          </div>

          {/* Column 3: Company */}
          <div className="footer-col-links">
            <h4 className="footer-col-head">Your marketplace</h4>
            <ul className="footer-links-list">
              <li><Link to="/login">Login</Link></li>
              <li><Link to="/messages">Messages</Link></li>
              <li><Link to="/download">Download apps</Link></li>
              <li><Link to="/support">Contact support</Link></li>
            </ul>
          </div>

          {/* Column 4: Legal */}
          <div className="footer-col-links">
            <h4 className="footer-col-head">Legal</h4>
            <ul className="footer-links-list">
              <li><Link to="/terms">Terms</Link></li>
              <li><Link to="/privacy">Privacy</Link></li>
              <li><Link to="/safety">Safety Tips</Link></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom-bar-clean">
          <p className="footer-copy-text">© 2026 All in One Today. All rights reserved.</p>
          <a className="ait-powered" href="https://galletrix.com" target="_blank" rel="noopener noreferrer">Powered by Galletrix Innovations</a>
        </div>
      </div>
    </footer>
  );
}
