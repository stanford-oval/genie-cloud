'use strict';
$(() => {
  var glide = new Glide('#jumbotron-carousel', {
    type: 'carousel',
    perView: 5,
    focusAt: 'center',
    autoplay: 2500,
    animationDuration: 1500,
    breakpoints: {
      1800: {
        perView: 4
      },
      1450: {
        perView: 3
      },
      1100: {
        perView: 2
      },
      780: {
        perView: 1
      }
    }
  });

  glide.mount();
});
