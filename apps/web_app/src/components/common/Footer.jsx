import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

export default function Footer() {
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
              Your local finds, all in one place. Discover, sell and connect with people and shops near you.
            </p>
          </div>

          {/* Column 2: Explore */}
          <div className="footer-col-links">
            <h4 className="footer-col-head">Explore</h4>
            <ul className="footer-links-list">
              <li><Link to="/listings?category=Vehicles">Vehicles</Link></li>
              <li><Link to="/listings?category=Property">Property</Link></li>
              <li><Link to="/listings?category=Jobs">Jobs</Link></li>
              <li><Link to="/listings?category=Mobiles">Mobiles</Link></li>
              <li><Link to="/listings?category=Services">Services</Link></li>
            </ul>
          </div>

          {/* Column 3: Company */}
          <div className="footer-col-links">
            <h4 className="footer-col-head">Your marketplace</h4>
            <ul className="footer-links-list">
              <li><Link to="/merchant">Register your shop</Link></li>
              <li><Link to="/account">Your account</Link></li>
              <li><Link to="/messages">Messages</Link></li>
              <li><Link to="/download">Download apps</Link></li>
              <li><a href="https://galletrix.com/contact">Contact support</a></li>
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
          <p className="footer-copy-text">© 2026 Galletrix · All in One Today. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
