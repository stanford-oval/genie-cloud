import React, { useEffect, useState } from 'react';

import BodyText from 'components/BodyText';
import Carousel from 'components/Carousel/Carousel';
import { faStar } from '@fortawesome/free-regular-svg-icons';
import FeaturePanel from 'components/FeaturePanel';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { getPageHead } from 'libs/header';
import Prompt from 'components/Prompt';
import ReactMarkdown from 'react-markdown';
import contributeText from '../content/help.md';

export default props => {
  return (
    <>
      {getPageHead('Help')}

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
      <FeaturePanel
        bg="white"
      >
        <BodyText>
          <ReactMarkdown source={contributeText} />
        </BodyText>
      </FeaturePanel>
    </>
  );
};
