import React from 'react';

import Container from 'react-bootstrap/Container';

import Navbar from './Navbar';
import './Layout.scss';

export default props => (
  <>
    <Navbar />
    <Container className="overall-container" fluid>{props.children}</Container>
  </>
);
