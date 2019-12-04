import React from 'react';

import TrainAlmondForm from 'components/TrainAlmondForm';

export default props => {
  return (
    <>
      <h1>Train Almond</h1>
      <p>
        If Almond is misbehaving or misinterpreting your input, you can correct
        it here.
      </p>
      <TrainAlmondForm />
    </>
  );
};
