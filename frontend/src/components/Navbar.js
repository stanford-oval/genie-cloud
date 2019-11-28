import React from 'react';
import { Flex, Text, Box } from 'rebass';
import Link from './Link';
import NextLink from 'next/link';
import styled from 'styled-components';

const Navbar = styled(Flex)`
  background-color: ${props => props.theme.colors.red};
  color: ${props => props.theme.colors.white};
`;

const BrandLink = styled(Link)`
  color: ${props => props.theme.colors.white};
  text-decoration: none;
  text-transform: uppercase;
`;

const NavLink = styled(Link)`
  color: ${props => props.theme.colors.white};
  text-decoration: none;
`;

export default props => {
  return (
    <Navbar p={3} bg="primary" alignItems="center">
      <BrandLink href="/" fontWeight="bold" fontSize={3}>
        Almond
      </BrandLink>
      <Box mx="auto" />
      <NavLink variant="nav" href="#!">
        Logout
      </NavLink>
    </Navbar>
  );
};
