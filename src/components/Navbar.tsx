import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Navbar = () => {
  const location = useLocation();

  return (
    <nav className="navbar">
      <div className="nav-brand">RT Logistics</div>
      <div className="nav-links">
        <Link to="/" className={location.pathname === '/' ? 'active' : ''}>首頁</Link>
        {/* <Link to="/warehouse" className={location.pathname === '/warehouse' ? 'active' : ''}>倉管系統</Link> */}
      </div>
    </nav>
  );
};

export default Navbar;
