import React from 'react';
import './HowItWorks.css';

export default function HowItWorks() {
  const steps = [
    {
      num: '01',
      title: 'Search',
      desc: 'Find products and services from local businesses.',
    },
    {
      num: '02',
      title: 'Connect',
      desc: 'Send a question directly to the shop or listing owner.',
    },
    {
      num: '03',
      title: 'Buy / Sell',
      desc: 'Complete your transaction with confidence.',
    },
  ];

  return (
    <section className="how-it-works-section" id="how-it-works">
      <div className="container how-container">
        {/* Dark Rounded Container Box matching Figma Desktop - 71 */}
        <div className="how-it-works-dark-box">
          <h2 className="how-title-serif">How It Works</h2>
          <p className="how-subtitle-clean">
            Three simple steps to find what you need or sell what you have.
          </p>

          <div className="how-steps-row">
            {steps.map((item, idx) => (
              <div key={idx} className="how-step-col">
                <span className="how-step-num">{item.num}</span>
                <h3 className="how-step-title">{item.title}</h3>
                <p className="how-step-desc">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
