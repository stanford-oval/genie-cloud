import React from 'react';

import FullWidthContainer from 'components/FullWidthContainer';

import Navbar from './Navbar';
import './Layout.scss';

export default props => (
  <>
    <Navbar />
    <FullWidthContainer className="overall-container" fluid>
      {props.children}
    </FullWidthContainer>
  </>
);
