import React from 'react';

import FeaturePanel from 'components/FeaturePanel';
import Carousel from 'components/Carousel';

export default props => {
  return (
    <>
      <FeaturePanel
        title="Almond, made by you."
        subhead={
          'As an open-source virtual assistant, Almond depends on the work of our community to develop new features, support more devices, and build cool new applications.'
        }
      >
        <Carousel />
      </FeaturePanel>
    </>
  );
};
