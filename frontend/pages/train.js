import React from 'react';

import Container from 'react-bootstrap/Container';

import TrainAlmondForm from 'components/TrainAlmondForm';

export default props => {
  return (
    <Container fluid>
      <h1>Train Almond</h1>
      <p>
        If Almond is misbehaving or misinterpreting your input, you can correct
        it here.
      </p>
      <TrainAlmondForm />
    </Container>
  );
};
