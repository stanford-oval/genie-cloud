import React from 'react';

import ReactMarkdown from 'react-markdown';

import './BodyText.scss';

export default props => (
  <div className="body-text">
    <ReactMarkdown source={props.md} />
  </div>
);