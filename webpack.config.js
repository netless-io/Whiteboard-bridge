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
    alias: {
      // rbush v4 ships an ESM entry that the legacy Babel pipeline rewrites to
      // bare CommonJS globals. Use its official browser bundle in WebView builds.
      "rbush$": path.join(path.dirname(require.resolve("rbush")), "rbush.min.js"),
      "@netless/window-manager/dist/style.css": require.resolve("@netless/window-manager").replace("index.js", "style.css"),
      "@netless/window-manager": require.resolve("@netless/window-manager"),

      "@netless/appliance-plugin/dist/style.css": require.resolve("@netless/appliance-plugin").replace("appliance-plugin.js", "style.css"),
      "@netless/appliance-plugin/dist/subWorker.js": require.resolve("@netless/appliance-plugin").replace("appliance-plugin.js", "subWorker.js"),
      "@netless/appliance-plugin/dist/fullWorker.js": require.resolve("@netless/appliance-plugin").replace("appliance-plugin.js", "fullWorker.js"),
      "@netless/appliance-plugin": require.resolve("@netless/appliance-plugin"),
    },
    extensions: ['.ts', '.tsx', '.js', "cjs"],
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
    new webpack.NormalModuleReplacementPlugin(/^\.\/worker-factory(?:\.js)?$/, resource => {
      if (/[\\/]agora-foundation[\\/](?:lib|lib-es)[\\/]worker$/.test(resource.context)) {
        resource.request = path.resolve(__dirname, 'src/FoundationWorkerFactory.ts');
      }
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
        test: /node_modules[\\/]rbush[\\/]rbush\.min\.js$/,
        type: "javascript/auto",
      },
      {
        test: /\.(ts|js|cjs)x?$/,
        resourceQuery: { not: [/raw/] },
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
      },
      {
        resourceQuery: /raw/,
        type: 'asset/source',
      }
    ],
    unknownContextCritical: false,
  },
  cache: {
    type: "filesystem",
    // 手动修改 node_modules 缓存不会失效。可以通过手动修改 config 或者删除 .cache 文件来触发，同时观察文件名是否有变化。
    buildDependencies: {
      config: [
        __filename,
        path.join(__dirname, 'babel.config.js'),
        path.join(__dirname, '.generated/foundation-worker.js'),
        path.join(__dirname, '.generated/foundation-worker.manifest.json'),
      ],
    },
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'build'),
    },
  }
};

module.exports = (env, argv) => {
  if (argv.mode === 'development') {
    config.output.filename = '[name].[hash].js';
    config.module.rules[0].exclude = /node_modules/;
  }
  config.plugins.push(new DefinePlugin({
    'process.env.NODE_ENV': JSON.stringify(argv.mode),
    'process.env.DEBUG': argv.mode === "development"
  }))
  return config;
}
