/**
 * @type {import('webpack').Configuration}
 */

const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const {CleanWebpackPlugin} = require('clean-webpack-plugin');
const TerserJSPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const { DefinePlugin } = require('webpack');

config = {
  entry: './src/index',
  output: {
    path: path.join(__dirname, '/build'),
    filename: `[name].[contenthash:8].js`
  },
  target: ["web", "es5"],
  resolve: {
    extensions: ['.ts', '.tsx', '.js', "cjs"],
    mainFields: ["main", "module"],
    fallback: {
      buffer: "buffer",
    }
  },
  optimization: {
    minimizer: [new TerserJSPlugin({extractComments: false, parallel: true}), new CssMinimizerPlugin({})],
    moduleIds: 'deterministic',
    runtimeChunk: 'single',
    splitChunks: {
      chunks: "all",
      cacheGroups: {
        white: {
          test: /[\\/]node_modules[\\/](white-web-sdk)[\\/]/,
          name: 'web-sdk',
          chunks: 'all',
          priority: 10,
          reuseExistingChunk: true
        },
        video: {
          test: /video/,
          name: 'video',
          chunks: 'all',
          priority: 7,
          reuseExistingChunk: true
        },
        netless: {
          test: /@netless/,
          name: 'netless',
          chunks: 'all',
          priority: 7,
          reuseExistingChunk: true
        },
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendor',
          chunks: 'all',
          priority: 1,
          reuseExistingChunk: true
        }
      }
    }
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      template: './src/index.html'
    }),
    new MiniCssExtractPlugin()
  ],
  module: {
    rules: [
      {
        test: /\.(ts|js|cjs)x?$/,
        use: [
          "thread-loader",
          'babel-loader',
        ],
      },
      {
        test: /\.css$/,
        use: [{loader: MiniCssExtractPlugin.loader}, 'css-loader']
      },
      {
        test: /\.(svg|png)/,
        use: ['file-loader']
      }
    ],
    unknownContextCritical: false,
  },
  cache: {
    type: "filesystem",
    // 手动修改 node_modules 缓存不会失效。可以通过手动修改 config 或者删除 .cache 文件来触发，同时观察文件名是否有变化。
    buildDependencies: {
      config: [__filename],
    },
  }
};

module.exports = (env, argv) => {
  if (argv.mode === 'development') {
    config.output.filename = '[name].[hash].js';
    config.module.rules[0].exclude = /node_modules/;
  }
  config.plugins.push(new DefinePlugin({
    'process.env.NODE_ENV': JSON.stringify(argv.mode)
  }))
  return config;
}