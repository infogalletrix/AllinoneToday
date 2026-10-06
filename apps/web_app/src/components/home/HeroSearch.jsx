import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, ArrowRight } from 'lucide-react';
import './HeroSearch.css';

export default function HeroSearch() {
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (keyword.trim()) params.append('query', keyword.trim());
    if (location.trim()) params.append('location', location.trim());
    navigate(`/listings?${params.toString()}`);
  };

  const popularTags = [
    { label: 'Cars', category: 'Vehicles' },
    { label: 'Property', category: 'Property' },
    { label: 'Jobs', category: 'Jobs' },
    { label: 'Mobiles', category: 'Mobiles' },
    { label: 'Electronics', category: 'Electronics' },
    { label: 'Services', category: 'Services' },
    { label: 'Furniture', category: 'Furniture' },
  ];

  return (
    <section className="figma-hero-section">
      <div className="figma-hero-overlay"></div>

      <div className="container figma-hero-inner">
        {/* Left-aligned Hero Content matching Figma Desktop - 71 */}
        <div className="figma-hero-left-box">
          {/* Headline */}
          <h1 className="figma-hero-title">
            Find What You Need. <br />
            Discover What's Next.
          </h1>

          {/* Subtitle */}
          <p className="figma-hero-description">
            Explore products, properties, vehicles, jobs and services from people and shops around you.
          </p>

          {/* Translucent Search Pill Bar matching Figma Desktop - 71 */}
          <form onSubmit={handleSearch} className="figma-glass-search-capsule">
            {/* Search Input */}
            <div className="capsule-field query-field">
              <Search size={16} className="capsule-icon" />
              <input 
                type="text"
                placeholder="What are you looking for?"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>

            <div className="capsule-divider"></div>

            {/* Location Input */}
            <div className="capsule-field location-field">
              <MapPin size={16} className="capsule-icon" />
              <input 
                type="text"
                placeholder="Location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            {/* Blue Pill Button: Search → */}
            <button type="submit" className="capsule-blue-search-btn">
              <span>Search</span>
              <ArrowRight size={14} />
            </button>
          </form>

          {/* Popular Tags Row matching Figma Desktop - 71 */}
          <div className="figma-popular-row">
            <span className="popular-label">Popular :</span>
            <div className="popular-tags-group">
              {popularTags.map((tag) => (
                <button
                  key={tag.label}
                  type="button"
                  className="popular-pill-tag"
                  onClick={() => navigate(`/listings?category=${tag.category}`)}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
