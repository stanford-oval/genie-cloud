import React from 'react';

import Link from 'next/link';

import './CarouselCard.scss';

export default props => {
  // Sets div background image
  const cardStyle = {
    background: `url(${props.img}) no-repeat center`,
    backgroundSize: 'cover',
  };
  return (
    <div className="carousel-card" style={cardStyle}>
      <a href={props.url} target="_blank">
        <div className="carousel-card-gradient">
          <h3>{props.title}</h3>
          <p className="carousel-card-subtitle">{props.subtitle}</p>
        </div>
      </a>
    </div>
  );
};
