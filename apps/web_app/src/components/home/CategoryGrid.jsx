import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import './CategoryGrid.css';
import {useSite} from '../../SiteContext';

export default function CategoryGrid({section}) {
  const {site}=useSite();
  const categories=site.categories.map(category=>({id:category.id,title:category.name,subtitle:category.subtitle,imagePath:category.image_path||'/images/h.png',route:'/listings?category='+encodeURIComponent(category.name)}));

  return (
    <section className="figma-categories-section">
      <div className="container figma-cat-container">
        {/* Section Header matching Figma slide node-id=99-109 */}
        <div className="figma-cat-header">
          <h2 className="figma-cat-headline">{section?.title}</h2>
          <p className="figma-cat-subtitle">{section?.body}</p>
        </div>

        {/* 4x2 Grid of Photo Cards matching Figma Screenshot */}
        <div className="figma-cat-grid">
          {categories.map((cat) => (
            <Link 
              key={cat.id} 
              to={cat.route}
              className="figma-cat-card"
            >
              <img 
                src={cat.imagePath} 
                alt={cat.title} 
                className="figma-cat-card-img" 
                loading="lazy"
              />
              
              {/* Frosted Dark Acrylic Panel spanning bottom of card */}
              <div className="figma-cat-bottom-panel">
                <div className="figma-cat-title-row">
                  <span className="figma-cat-card-title">{cat.title}</span>
                  <span className="figma-cat-arrow-circle">
                    <ArrowUpRight size={11} strokeWidth={2.4} />
                  </span>
                </div>
                <span className="figma-cat-card-sub">{cat.subtitle}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
