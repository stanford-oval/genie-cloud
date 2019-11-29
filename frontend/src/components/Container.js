import React from 'react';
import { Flex } from 'rebass';

export default props => (
  <Flex sx={{ px: props.noPadding ? 0 : 3, flexDirection: 'row' }}>
    {props.children}
  </Flex>
);
