import React from 'react';

import './CarouselCard.scss';

export default props => {
  // Sets div background image
  const cardStyle = {
    background: `linear-gradient(0deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 50%), url(${props.img}) no-repeat center`,
    backgroundSize: 'cover',
  };
  return (
    <div className="carousel-card" style={cardStyle}>
      <h3>{props.title}</h3>
      <p>{props.subtitle}</p>
    </div>
  );
};
