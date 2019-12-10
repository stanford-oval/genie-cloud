import React from 'react';

import { Helmet } from 'react-helmet';

// Get helmet component for page given title.
// Meant to override existing duplicate settings.
export const getPageHead = title => (
  <Helmet>
    <title>{title} - Almond</title>
    <meta property="og:title" content={title} />
  </Helmet>
);
