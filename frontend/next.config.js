const withCSS = require('@zeit/next-css');
const withSass = require('@zeit/next-sass');

const { ANALYZE, ASSET_HOST } = process.env;

// for those who using CDN
const assetPrefix = ASSET_HOST || '';

module.exports = withCSS(
  withSass({
    assetPrefix,
    target: 'serverless',
    webpack: (config, { dev }) => {
      config.output.publicPath = `${assetPrefix}${config.output.publicPath}`;

      if (ANALYZE) {
        const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
        config.plugins.push(
          new BundleAnalyzerPlugin({
            analyzerMode: 'server',
            analyzerPort: 8888,
            openAnalyzer: true,
          }),
        );
      }

      config.module.rules.push({
        test: /\.(png|jpg|gif|svg|eot|ttf|woff|woff2)$/,
        use: {
          loader: 'url-loader',
          options: {
            limit: 100000,
          },
        },
      });

      config.module.rules.push({
        test: /\.(txt|md)$/i,
        use: {
          loader: 'raw-loader',
        },
      });

      return config;
    },
  }),
);
