import React from 'react';
import { Box } from 'rebass';
import { useTheme } from 'emotion-theming';

export default props => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        width: '20%',
        p: 3,
        backgroundColor: theme.colors.lightgray,
        height: '94.5vh',
        display: 'block',
      }}
    ></Box>
  );
};
