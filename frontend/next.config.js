const withCSS = require('@zeit/next-css');
const withSass = require('@zeit/next-sass');
const withOptimizedImages = require('next-optimized-images');

const { ANALYZE, ASSET_HOST } = process.env;

// for those who using CDN
const assetPrefix = ASSET_HOST || '';

module.exports = withCSS(
  withSass(
    withOptimizedImages({
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
          test: /\.(txt|md)$/i,
          use: [
            {
              loader: 'raw-loader',
            },
          ],
        });

        return config;
      },
    }),
  ),
);
