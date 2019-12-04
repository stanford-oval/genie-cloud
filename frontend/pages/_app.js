import withRedux from 'next-redux-wrapper';
import { Provider } from 'react-redux';
import { withRouter } from 'next/router';
import App from 'next/app';

import createStore from 'store/createStore';
import 'core.scss';
import Layout from 'components/Layout';

class MyApp extends App {
  render() {
    const { Component, pageProps, router, store } = this.props;
    return (
      <Provider store={store}>
        <Layout>
          <Component router={router} {...pageProps} />
        </Layout>
      </Provider>
    );
  }
}

export default withRedux(createStore)(withRouter(MyApp));
