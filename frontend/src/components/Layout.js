import React, { useState } from 'react';
import Navbar from './Navbar';

export default props => {
  return (
    <div className="layout">
      <Navbar />
      {props.children}
    </div>
  );
};
