import React, { useState } from 'react';
import { X, Upload, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import { createListing } from '../../api/client';
import './PostAdModal.css';
import { useDialogs } from './DialogProvider';

export default function PostAdModal({ isOpen, onClose, onListingCreated }) {
  const { alert } = useDialogs();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Vehicles');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('Thiruvananthapuram');
  const [description, setDescription] = useState('');
  const [fuelType, setFuelType] = useState('Petrol');
  const [transmission, setTransmission] = useState('Automatic');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !price) {
      await alert({ title: 'Complete your listing', message: 'Please fill in the title and price before publishing.', confirmLabel: 'Continue editing' });
      return;
    }

    setSubmitting(true);
    const parsedPrice = parseFloat(price.replace(/[^0-9.]/g, '')) || 500000;

    const payload = {
      id: `list_${Date.now()}`,
      title,
      price: parsedPrice,
      formatted_price: `₹ ${parsedPrice.toLocaleString('en-IN')}`,
      location,
      category,
      subcategory: category === 'Vehicles' ? 'Car' : 'General',
      image_path: category === 'Vehicles' ? 'assets/images/h1.png' : 'assets/images/h2.png',
      description: description || `${title} in excellent condition with genuine documentation.`,
      seller_id: 'usr_default',
      seller_name: 'Alex Morgan',
      is_featured: false,
      specifications: {
        fuel_type: fuelType,
        transmission: transmission,
        owner: '1st Owner • Verified',
        total_capacity: '5 Seats'
      }
    };

    const res = await createListing(payload);
    setSubmitting(false);
    setSuccess(true);
    if (onListingCreated) onListingCreated(payload);

    setTimeout(() => {
      setSuccess(false);
      onClose();
    }, 1600);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title-group">
            <Sparkles size={20} className="modal-sparkle" />
            <h3 className="modal-title">Post a New Ad</h3>
          </div>
          <button onClick={onClose} className="modal-close-btn" aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {success ? (
          <div className="modal-success-state">
            <CheckCircle size={48} className="success-icon" />
            <h4>Listing Submitted Successfully!</h4>
            <p>Your listing is verified and is now live on the marketplace.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="form-group">
              <label>Ad Title *</label>
              <input 
                type="text" 
                placeholder="e.g. 2022 Hyundai Creta SX Automatic" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                required 
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Category *</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="Vehicles">Vehicles</option>
                  <option value="Property">Property</option>
                  <option value="Mobiles">Mobiles</option>
                  <option value="Electronics">Electronics</option>
                  <option value="Furniture">Furniture</option>
                  <option value="Services">Services</option>
                </select>
              </div>

              <div className="form-group">
                <label>Price (₹) *</label>
                <input 
                  type="text" 
                  placeholder="e.g. 725000" 
                  value={price} 
                  onChange={(e) => setPrice(e.target.value)} 
                  required 
                />
              </div>
            </div>

            {category === 'Vehicles' && (
              <div className="form-row">
                <div className="form-group">
                  <label>Fuel Type</label>
                  <select value={fuelType} onChange={(e) => setFuelType(e.target.value)}>
                    <option value="Petrol">Petrol</option>
                    <option value="Diesel">Diesel</option>
                    <option value="Electric">Electric</option>
                    <option value="Hybrid">Hybrid</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Transmission</label>
                  <select value={transmission} onChange={(e) => setTransmission(e.target.value)}>
                    <option value="Automatic">Automatic</option>
                    <option value="Manual">Manual</option>
                  </select>
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Location *</label>
              <select value={location} onChange={(e) => setLocation(e.target.value)}>
                <option value="Thiruvananthapuram">Thiruvananthapuram</option>
                <option value="Bengaluru">Bengaluru</option>
                <option value="Kochi">Kochi</option>
                <option value="Kowdiar">Kowdiar</option>
              </select>
            </div>

            <div className="form-group">
              <label>Detailed Description</label>
              <textarea 
                rows="3" 
                placeholder="Mention key details, service records, condition, and highlights..." 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="modal-actions">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? 'Submitting...' : 'Publish Listing'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
