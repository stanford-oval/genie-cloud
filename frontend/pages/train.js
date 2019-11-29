import React, { useState } from 'react';
import Container from 'components/Container';
import Sidebar from '../src/components/Sidebar';
import { Flex, Box } from 'rebass';

export default props => {
  return (
    <Container noPadding>
      <Sidebar />
      <h1>Train Genie</h1>
    </Container>
  );
};
