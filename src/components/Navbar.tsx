import { Link, useLocation } from 'react-router-dom';

const Navbar = () => {
  const location = useLocation();

  return (
    <nav className="navbar">
      <div className="nav-brand">RT Logistics</div>
      <div className="nav-links">
        <Link to="/" className={location.pathname === '/' ? 'active' : ''}>路線規劃</Link>
        <Link to="/inventory" className={location.pathname === '/inventory' ? 'active' : ''}>庫存管理</Link>
      </div>
    </nav>
  );
};

export default Navbar;
