import React from 'react';
import { 
  UserCheck, 
  ShieldCheck, 
  Flag, 
  CheckCircle2, 
  Lock, 
  Headphones 
} from 'lucide-react';
import './TrustSection.css';

export default function TrustSection() {
  const trustCards = [
    {
      icon: UserCheck,
      title: 'Know your seller',
      desc: 'Inspect the item and verify ownership before agreeing to a purchase.',
    },
    {
      icon: ShieldCheck,
      title: 'Secure communication',
      desc: 'Send inquiries and keep replies together in your account.',
    },
    {
      icon: Flag,
      title: 'Report suspicious listings',
      desc: 'Sign in and use the listing report option to flag suspicious content.',
    },
    {
      icon: CheckCircle2,
      title: 'Responsible listings',
      desc: 'Only offer products and services you are authorized to sell.',
    },
    {
      icon: Lock,
      title: 'Protected account access',
      desc: 'Strong passwords and protected sessions help safeguard your account.',
    },
    {
      icon: Headphones,
      title: 'Help desk support',
      desc: 'Reach Galletrix through the support link for account and billing help.',
    },
  ];

  return (
    <section className="trust-section-figma">
      <div className="container trust-container">
        <div className="trust-header-figma">
          <h2 className="trust-title-serif">A little care. Better connections.</h2>
          <p className="trust-subtitle-clean">
            Stay informed when buying, selling and connecting online.
          </p>
        </div>

        <div className="trust-cards-grid">
          {trustCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <div key={idx} className="trust-card-figma">
                <div className="trust-icon-bubble">
                  <Icon size={16} strokeWidth={2.2} />
                </div>
                <h3 className="trust-card-title">{card.title}</h3>
                <p className="trust-card-desc">{card.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
