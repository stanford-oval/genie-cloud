import React from 'react';

import Media from 'react-bootstrap/Media';
import './Prompt.scss';

export default props => (
  <Media className="media">
    {props.icon}
    <Media.Body className="media-body">
      <h4>{props.title}</h4>
      <p>
        {props.text}
      </p>
    </Media.Body>
  </Media>
);
