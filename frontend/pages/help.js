import React, { useEffect, useState } from 'react';

import BodyColumn from 'components/BodyColumn';
import BodyText from 'components/BodyText';
import Carousel from 'components/Carousel/Carousel';
import CarouselCard from 'components/Carousel/CarouselCard';
import { faStar } from '@fortawesome/free-regular-svg-icons';
import FeaturePanel from 'components/FeaturePanel';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { getPageHead } from 'libs/header';
import Prompt from 'components/Prompt';
import contributeText from '../content/help.md';
import haImage from '../media/example_projects/ha.png';
import musicImage from '../media/example_projects/almond_music.jpg';
import muImage from '../media/example_projects/multi_user_almond.jpg';
import mmiImage from '../media/example_projects/almond_mmi.jpg';
import sportsImage from '../media/example_projects/wikidata_sports.jpg';

const projects = [
  {
    title: 'Home Assistant',
    digest:
      'Home Assistant, a widely used open-source home automation platform built on Python that allows users to monitor and control their smart devices, uses Almond as a language interface to allow its users to control devices using their speech.',
    image: haImage,
    url: 'https://www.home-assistant.io/',
  },
  {
    title: 'Almond Music',
    digest:
      'Music enthusiasts, Gabby and Hemanth built Almond Music together as a quarter-long class project with the goal of creating the best music virtual assistant that can control their Spotify music through any device. What they built went beyond Alexa or Google Home, allowing for actions like the ability to change playlists.',
    image: musicImage,
    url: 'https://www.youtube.com/watch?v=M4HG-QDGmBI&feature=emb_title',
  },
  {
    title: 'Multi-user Almond',
    digest:
      'Sharing a smart speaker among multiple people in the household is useful but at the same time raises privacy and parental control issues. This project showed that Almond can be used to identify users with their voice and provide fine-grained access control based on the detected identity. ',
    image: muImage,
    url: 'https://www.youtube.com/watch?v=LFOB_AUmreE&feature=emb_title',
  },
  {
    title: 'Multi-modal Interface',
    digest:
      'Jackie Yang built a multi-modal interface that allows you to use Almond to make complex queries while interacting with someone over chat.',
    image: mmiImage,
    url: 'https://www.youtube.com/watch?v=M4HG-QDGmBI&feature=emb_title',
  },
  {
    title: 'Sports Wikidata',
    digest:
      'Description Needed',
    image: sportsImage,
    url: 'https://www.youtube.com/watch?v=M4HG-QDGmBI&feature=emb_title',
  },
];

export default props => {
  const handleItem = (item, i) => (
    <CarouselCard
      key={i}
      title={item.title}
      subtitle={item.digest}
      img={item.image}
      url={item.url}
    />
  );
  return (
    <>
      {getPageHead('Help')}

      <FeaturePanel
        title="Almond, made by you."
        subhead={
          'As an open-source virtual assistant, Almond depends on the work of our community to develop new features, support more devices, and build cool new applications.'
        }
      >
        <Carousel items={projects} getSlide={handleItem} />

        <BodyColumn>
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
        </BodyColumn>
      </FeaturePanel>
      <FeaturePanel bg="white">
        <BodyColumn>
          <BodyText md={contributeText} />
        </BodyColumn>
      </FeaturePanel>
    </>
  );
};
