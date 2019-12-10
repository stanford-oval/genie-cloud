import React from 'react';

import Slider from 'react-slick';
import 'slick-carousel/slick/slick.css';
import './Carousel.scss';

export default props => {
  const settings = {
    autoplay: true,
    centerMode: true,
    className: 'custom-slick-carousel',
    dots: false,
    easing: 'ease',
    focusOnSelect: true,
    infinite: true,
    responsive: [
      {
        breakpoint: 1800,
        settings: {
          slidesToShow: 4,
          infinite: true,
        },
      },
      {
        breakpoint: 1450,
        settings: {
          slidesToShow: 3,
          infinite: true,
        },
      },
      {
        breakpoint: 1100,
        settings: {
          slidesToShow: 2,
        },
      },
      {
        breakpoint: 780,
        settings: {
          slidesToShow: 1,
        },
      },
    ],
    slidesToShow: 5,
    slidesToScroll: 1,
    speed: 1000,
    variableWidth: false,
  };

  const items = props.items.map(props.getSlide);

  return <Slider {...settings}>{items}</Slider>;
};
