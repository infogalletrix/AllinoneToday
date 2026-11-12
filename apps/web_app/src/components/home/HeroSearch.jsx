import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, ArrowRight } from 'lucide-react';
import './HeroSearch.css';
import {useSite} from '../../SiteContext';
import LocationInput from '../common/LocationInput';

export default function HeroSearch({section}) {
  const {site}=useSite();
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    for(const [name,value] of new FormData(e.currentTarget))if(String(value).trim())params.set(name,String(value).trim());
    navigate(`/listings?${params.toString()}`);
  };

  const popularTags=site.popular;

  return (
    <section className="figma-hero-section" style={section?.image?{backgroundImage:`url("${section.image}")`}:undefined}>
      <div className="figma-hero-overlay"></div>

      <div className="container figma-hero-inner">
        {/* Left-aligned Hero Content matching Figma Desktop - 71 */}
        <div className="figma-hero-left-box">
          {/* Headline */}
          <h1 className="figma-hero-title" style={{whiteSpace:'pre-line'}}>
            {section?.title}
          </h1>

          {/* Subtitle */}
          <p className="figma-hero-description">
            {section?.body}
          </p>

          {/* Translucent Search Pill Bar matching Figma Desktop - 71 */}
          <form onSubmit={handleSearch} className="figma-glass-search-capsule">
            {/* Search Input */}
            <div className="capsule-field query-field">
              <Search size={16} className="capsule-icon" />
              <input 
                type="search"
                name="query"
                aria-label="Search shops and listings"
                maxLength={100}
                placeholder="What are you looking for?"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>

            <div className="capsule-divider"></div>

            {/* Location Input */}
            <div className="capsule-field location-field">
              <MapPin size={16} className="capsule-icon" />
              <LocationInput value={location} onChange={setLocation} cancelPendingOnSubmit variant="hero" placeholder="All areas" />
            </div>

            {/* Blue Pill Button: Search → */}
            <button type="submit" className="capsule-blue-search-btn">
              <span>Search</span>
              <ArrowRight size={14} />
            </button>
          </form>
          <p className="hero-location-note">Leave location blank to search all areas. Add a city or use your location to narrow results.</p>

          {/* Popular Tags Row matching Figma Desktop - 71 */}
          <div className="figma-popular-row">
            <span className="popular-label">Popular :</span>
            <div className="popular-tags-group">
              {popularTags.map((tag) => (
                <button
                  key={tag.label}
                  type="button"
                  className="popular-pill-tag"
                  onClick={() => navigate(`/listings?category=${encodeURIComponent(tag.category)}`)}
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
