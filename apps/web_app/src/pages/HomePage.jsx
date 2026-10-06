import React from 'react';
import HeroSearch from '../components/home/HeroSearch';
import CategoryGrid from '../components/home/CategoryGrid';
import TrendingSection from '../components/home/TrendingSection';
import HowItWorks from '../components/home/HowItWorks';
import TrustSection from '../components/home/TrustSection';
import SellCtaBanner from '../components/home/SellCtaBanner';

export default function HomePage({ onOpenPostAd, favorites, onToggleFavorite }) {
  return (
    <div className="figma-home-page">
      {/* 1. Hero Section with h.png Background */}
      <HeroSearch />

      {/* 2. Browse by category (8 cards in 2x4 grid: h1 to h8) */}
      <CategoryGrid />

      {/* 3. Discover What's trending + Featured Near You + Discover Trusted Business */}
      <TrendingSection 
        favorites={favorites} 
        onToggleFavorite={onToggleFavorite} 
      />

      {/* 4. How It Works (Dark block with 01, 02, 03) */}
      <HowItWorks />

      {/* 5. Marketplace built around trust. (6 Trust Cards) */}
      <TrustSection />

      {/* 6. Continue Exploring (2 items) & Saved Searches Table */}

      {/* 7. Orange CTA Banner (Have something to sell? Post a listing -> / Learn How It Works) */}
      <SellCtaBanner onOpenPostAd={onOpenPostAd} />
    </div>
  );
}
