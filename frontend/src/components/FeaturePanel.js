import React from 'react';

import Jumbotron from 'react-bootstrap/Jumbotron';
import './FeaturePanel.scss';

export default props => {
  const bgStyle = {
    backgroundColor: props.bg ? props.bg : 'none',
    marginBottom: props.last ? '0px' : 'inherit',
  };
  return (
    <Jumbotron className="panel-container" style={bgStyle}>
      <div className="panel-header">
        <h1>{props.title}</h1>
        <p>{props.subhead}</p>
      </div>
      {props.children}
    </Jumbotron>
  );
};
