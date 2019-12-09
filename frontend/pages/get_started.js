import React from 'react';

import Carousel from 'components/Carousel/Carousel';
import FeaturePanel from 'components/FeaturePanel';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar } from '@fortawesome/free-regular-svg-icons';

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

        <FontAwesomeIcon icon={faStar} style={{fontSize: '4em', color: '#fbc531'}} />
      </FeaturePanel>
    </>
  );
};
