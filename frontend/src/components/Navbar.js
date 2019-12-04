import React from 'react';
import Link from 'next/link';

import Navbar from 'react-bootstrap/Navbar';
import Nav from 'react-bootstrap/Nav';
import './Navbar.scss';

export default props => (
  <Navbar bg="light" expand="lg" fixed="top">
    <Navbar.Brand>
      <Link href="/">
        <a className="nav-brand-link">Almond</a>
      </Link>
    </Navbar.Brand>
    <Navbar.Toggle aria-controls="basic-navbar-nav" />
    <Navbar.Collapse id="basic-navbar-nav">
      <Nav className="mr-auto">
        <Link href="/developers/train">
          <a className="nav-local-link">Train</a>
        </Link>
      </Nav>
    </Navbar.Collapse>
  </Navbar>
);
