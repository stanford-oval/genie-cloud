import React from 'react';

import Jumbotron from 'react-bootstrap/Jumbotron';
import './FeaturePanel.scss';

export default props => {
  return (
    <Jumbotron className="panel-container">
      <div className="panel-header">
        <h1>{props.title}</h1>
        <p>{props.subhead}</p>
      </div>
      {props.children}
    </Jumbotron>
  );
};
