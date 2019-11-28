import React from 'react';
import NextLink from 'next/link';
import { Link } from 'rebass';
import styled from 'styled-components';

const MyLink = props => (
  <NextLink href={props.href}>
    <Link className={props.className} fontWeight={props.fontWeight} fontSize={props.fontSize}>{props.children}</Link>
  </NextLink>
);

export default styled(MyLink)`
  cursor: pointer;
`;