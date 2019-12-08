import React from 'react';

import Container from 'react-bootstrap/Container';
import './FullWidthContainer.scss';

export default props => (
  <Container className={`${props.className} full-width-container`} fluid>
    {props.children}
  </Container>
);
