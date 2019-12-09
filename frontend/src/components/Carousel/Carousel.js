import React from 'react';

import Slider from 'react-slick';
import CarouselCard from './CarouselCard';
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
    slidesToShow: 5,
    slidesToScroll: 1,
    speed: 1000,
  };

  return (
    <Slider {...settings}>
      <CarouselCard title="John Adams Likes Pie" img="https://www-tc.pbs.org/wgbh/americanexperience/media/filer_public_thumbnails/filer_public/4c/bc/4cbc0d5a-821c-490b-a699-6a2fa113d731/adams_potus_03.jpg__2000x2442_q85_crop_subsampling-2_upscale.jpg"/>
      <CarouselCard title="John Adams Likes Pie" img="https://www-tc.pbs.org/wgbh/americanexperience/media/filer_public_thumbnails/filer_public/4c/bc/4cbc0d5a-821c-490b-a699-6a2fa113d731/adams_potus_03.jpg__2000x2442_q85_crop_subsampling-2_upscale.jpg"/>
      <CarouselCard title="John Adams Likes Pie" img="https://www-tc.pbs.org/wgbh/americanexperience/media/filer_public_thumbnails/filer_public/4c/bc/4cbc0d5a-821c-490b-a699-6a2fa113d731/adams_potus_03.jpg__2000x2442_q85_crop_subsampling-2_upscale.jpg"/>
      <CarouselCard title="John Adams Likes Pie" img="https://www-tc.pbs.org/wgbh/americanexperience/media/filer_public_thumbnails/filer_public/4c/bc/4cbc0d5a-821c-490b-a699-6a2fa113d731/adams_potus_03.jpg__2000x2442_q85_crop_subsampling-2_upscale.jpg"/>
      <CarouselCard title="John Adams Likes Pie" img="https://www-tc.pbs.org/wgbh/americanexperience/media/filer_public_thumbnails/filer_public/4c/bc/4cbc0d5a-821c-490b-a699-6a2fa113d731/adams_potus_03.jpg__2000x2442_q85_crop_subsampling-2_upscale.jpg"/>
      <CarouselCard title="John Adams Likes Pie" img="https://www-tc.pbs.org/wgbh/americanexperience/media/filer_public_thumbnails/filer_public/4c/bc/4cbc0d5a-821c-490b-a699-6a2fa113d731/adams_potus_03.jpg__2000x2442_q85_crop_subsampling-2_upscale.jpg"/>
    </Slider>
  );
};
