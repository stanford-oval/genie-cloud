import React from 'react';
import Link from 'next/link';

import Navbar from 'react-bootstrap/Navbar';
import Nav from 'react-bootstrap/Nav';
import './Navbar.scss';

export default props => (
  <Navbar className="navbar" expand="lg" fixed="top">
    <Navbar.Brand>
      <Link href="/">
        <a className="nav-brand-link">Almond</a>
      </Link>
    </Navbar.Brand>
    <Navbar.Toggle aria-controls="basic-navbar-nav" />
    <Navbar.Collapse id="basic-navbar-nav" className="justify-content-end">
      <Nav>
        <Link href="/developers/train">
          <a className="nav-local-link right-nav-link">Train</a>
        </Link>
        <Link href="/get-started">
          <a className="nav-local-link">Getting Started</a>
        </Link>
      </Nav>
    </Navbar.Collapse>
  </Navbar>
);
