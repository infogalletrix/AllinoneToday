import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import './CategoryGrid.css';

export default function CategoryGrid() {
  // Matching exact 8 cards from the Figma presentation screenshot (node-id=99-109)
  const categories = [
    {
      id: 'cat_vehicles',
      imagePath: '/images/h1.png',
      title: 'Vehicles',
      subtitle: 'Car , Bike & Commercial',
      route: '/listings?category=Vehicles',
    },
    {
      id: 'cat_property',
      imagePath: '/images/h2.png',
      title: 'Property',
      subtitle: 'Buy , rent & lease',
      route: '/listings?category=Property',
    },
    {
      id: 'cat_jobs',
      imagePath: '/images/h3.png',
      title: 'Jobs',
      subtitle: 'Full-time , Part - time',
      route: '/listings?category=Jobs',
    },
    {
      id: 'cat_groceries',
      imagePath: '/images/h4.png',
      title: 'Groceries',
      subtitle: 'Fresh vegetables & produce',
      route: '/listings?category=Groceries',
    },
    {
      id: 'cat_electronics',
      imagePath: '/images/h5.png',
      title: 'Electronics',
      subtitle: 'Laptops, audio & appliances',
      route: '/listings?category=Electronics',
    },
    {
      id: 'cat_mobiles',
      imagePath: '/images/h6.png',
      title: 'Mobiles',
      subtitle: 'Phones, tablets & accessories',
      route: '/listings?category=Mobiles',
    },
    {
      id: 'cat_services',
      imagePath: '/images/h7.png',
      title: 'Services',
      subtitle: 'Home, repair & cleaning',
      route: '/listings?category=Services',
    },
    {
      id: 'cat_furniture',
      imagePath: '/images/h8.png',
      title: 'Furniture',
      subtitle: 'Living, bed & dining sets',
      route: '/listings?category=Furniture',
    },
  ];

  return (
    <section className="figma-categories-section">
      <div className="container figma-cat-container">
        {/* Section Header matching Figma slide node-id=99-109 */}
        <div className="figma-cat-header">
          <h2 className="figma-cat-headline">Browse by category</h2>
          <p className="figma-cat-subtitle">Curated collections across every need</p>
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
