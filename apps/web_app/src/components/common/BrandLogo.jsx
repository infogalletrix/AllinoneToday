import logo from '../../assets/all-in-one-today-logo.png';
import './BrandLogo.css';

export default function BrandLogo() {
  return <span className="ait-brand-logo">
    <img src={logo} alt="All in One Today logo" width="512" height="512" />
  </span>;
}
