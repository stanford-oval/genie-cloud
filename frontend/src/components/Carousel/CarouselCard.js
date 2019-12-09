import React from 'react';

import './CarouselCard.scss';

export default props => {
  // Sets div background image
  const cardStyle = {
    background: `url(${props.img}) no-repeat center`,
    backgroundSize: 'cover',
  };
  return (
    <div className="carousel-card" style={cardStyle}>
      <div className="carousel-card-gradient">
        <h3>{props.title}</h3>
        <p className="carousel-card-subtitle">{props.subtitle}</p>
      </div>
    </div>
  );
};
