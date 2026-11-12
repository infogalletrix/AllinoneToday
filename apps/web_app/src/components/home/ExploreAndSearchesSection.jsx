import React from 'react';
import { Link } from 'react-router-dom';
import { Bell, Edit2, Trash2 } from 'lucide-react';
import './ExploreAndSearchesSection.css';
import { useDialogs } from '../common/DialogProvider';

export default function ExploreAndSearchesSection() {
  const { alert } = useDialogs();
  const exploreItems = [
    {
      id: 'list_macbook_m3',
      imagePath: '/images/h5.png',
      price: '₹ 1,05,000',
      title: 'MacBook Pro 14" M3',
      location: 'Thiruvananthapuram',
      sellerType: 'Individual',
    },
    {
      id: 'list_teak_sofa',
      imagePath: '/images/h8.png',
      price: '₹ 30,000',
      title: 'Teakwood 5 - Seater Sofa Set',
      location: 'Thiruvananthapuram',
      sellerType: 'Business',
    },
  ];

  const savedSearches = [
    {
      query: 'Creta under ₹10L',
      matches: '24 matches ongoing',
      category: 'Vehicles',
    },
    {
      query: '2BHK Apartment in Trivandrum',
      matches: '18 matches ongoing',
      category: 'Property',
    },
    {
      query: 'UI/UX Designer jobs',
      matches: '7 matches ongoing',
      category: 'Jobs',
    },
  ];

  return (
    <section className="explore-searches-section-figma">
      <div className="container explore-searches-container">
        <div className="explore-searches-two-col">
          {/* ── Left Column: Continue Exploring ── */}
          <div className="explore-left-col">
            <div className="column-head">
              <h2 className="column-title-serif">Continue Exploring</h2>
              <p className="column-sub-clean">You recently viewed listings.</p>
            </div>

            <div className="continue-two-cards-grid">
              {exploreItems.map((item) => (
                <Link 
                  key={item.id} 
                  to={`/listings/${item.id}`}
                  className="continue-card-figma"
                >
                  <div className="continue-img-box">
                    <img src={item.imagePath} alt={item.title} className="continue-img" />
                  </div>
                  <div className="continue-info-box">
                    <span className="continue-price-text">{item.price}</span>
                    <h3 className="continue-title-text">{item.title}</h3>
                    <span className="continue-loc-text">{item.location}</span>
                    <div className="continue-seller-tag">
                      <span className="seller-status-dot" />
                      <span className="seller-type-text">{item.sellerType}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* ── Right Column: Your Saved Searches ── */}
          <div className="searches-right-col">
            <div className="column-head">
              <h2 className="column-title-serif">Your Saved Searches</h2>
              <p className="column-sub-clean">Get notified when new matches appear</p>
            </div>

            <div className="saved-searches-box-figma">
              {savedSearches.map((s, idx) => (
                <div key={idx} className="saved-search-item-row">
                  <Link 
                    to={`/listings?query=${encodeURIComponent(s.query)}&category=${s.category}`}
                    className="saved-search-text-col"
                  >
                    <strong className="saved-query-name">{s.query}</strong>
                    <span className="saved-matches-sub">{s.matches}</span>
                  </Link>

                  <div className="saved-search-icons-group">
                    <button 
                      type="button" 
                      className="search-icon-btn bell-btn" 
                      title="Notifications active"
                      onClick={() => alert({ title: 'Saved search notifications', message: `Notifications toggled for ${s.query}`, confirmLabel: 'Done' })}
                    >
                      <Bell size={14} className="bell-icon-orange" />
                    </button>
                    <button 
                      type="button" 
                      className="search-icon-btn" 
                      title="Edit search criteria"
                      onClick={() => alert({ title: 'Edit saved search', message: `Editing search ${s.query}`, confirmLabel: 'Done' })}
                    >
                      <Edit2 size={13} />
                    </button>
                    <button 
                      type="button" 
                      className="search-icon-btn" 
                      title="Delete saved search"
                      onClick={() => alert({ title: 'Saved search deleted', message: `Deleted ${s.query}`, confirmLabel: 'Done' })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
