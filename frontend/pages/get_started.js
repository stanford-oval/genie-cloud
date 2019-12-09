import React from 'react';

import BodyText from 'components/BodyText';
import Carousel from 'components/Carousel/Carousel';
import { faStar } from '@fortawesome/free-regular-svg-icons';
import FeaturePanel from 'components/FeaturePanel';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Prompt from 'components/Prompt';

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

        <BodyText>
          <Prompt
            icon={
              <FontAwesomeIcon
                icon={faStar}
                style={{ fontSize: '4em', color: '#fbc531' }}
              />
            }
            text="Start learning how to use Almond in your project by consulting our documentation."
            title="Getting Started"
          />
        </BodyText>
      </FeaturePanel>
    </>
  );
};
