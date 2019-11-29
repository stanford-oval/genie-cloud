import { ThemeProvider } from 'emotion-theming';
import { Global, css } from '@emotion/core';
import emotionNormalize from 'emotion-normalize';
import withRedux from 'next-redux-wrapper';
import { Provider } from 'react-redux';
import { withRouter } from 'next/router';
import App from 'next/app';

import createStore from 'store/createStore';
import Layout from 'components/Layout';
import theme from 'theme';

const GlobalStyle = css`
  ${emotionNormalize}
  @supports (font-variation-settings: normal) {
    html {
      font-family: 'Inter var', sans-serif;
    }
  }
  body {
    background-color: #f4f4f4;
  }
`;

class MyApp extends App {
  render() {
    const { Component, pageProps, router, store } = this.props;
    return (
      <ThemeProvider theme={theme}>
        <Provider store={store}>
          <Global styles={GlobalStyle} />
          <Layout>
            <Component router={router} {...pageProps} />
          </Layout>
        </Provider>
      </ThemeProvider>
    );
  }
}

export default withRedux(createStore)(withRouter(MyApp));
