const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const express = require('express');
const fs = require('fs');

const isProd = process.env.NODE_ENV === 'production';

// 🎯 ДОДАТИ КОНФІГУРАЦІЮ ДИРЕКТОРІЇ
const PROOFS_DIR = process.env.PROOFS_DIR || path.join(__dirname, 'output/proofs');

// Створити директорію при старті
if (!fs.existsSync(PROOFS_DIR)) {
  fs.mkdirSync(PROOFS_DIR, { recursive: true });
  console.log('📁 Created proofs directory:', PROOFS_DIR);
}

const envPlugin = new webpack.EnvironmentPlugin({
  NODE_ENV: 'development',
  LOCAL_NOTARY: true,
  LOCAL_WS: false,
  HEADLESS: false,
});

const rules = [
  {
    test: /\.node$/,
    use: 'node-loader',
  },
  {
    test: /\.tsx?$/,
    exclude: /(node_modules|.webpack)/,
    use: [
      {
        loader: 'ts-loader',
        options: {
          transpileOnly: true,
        },
      },
    ],
  },
];

const rendererRules = [];

const entry = {
  'integration': path.join(__dirname, 'test', 'new', 'integration.spec.ts'),
  'verify': path.join(__dirname, 'test', 'new', 'verify.spec.ts'),
};

module.exports = [
  {
    target: 'web',
    mode: isProd ? 'production' : 'development',
    entry,
    output: {
      path: __dirname + '/test-build',
      publicPath: '/',
      filename: `[name].js`,
    },
    devtool: 'source-map',
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.png', '.svg'],
    },
    module: {
      rules: [...rules, ...rendererRules],
    },
    plugins: [
      envPlugin,
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
      }),
      new webpack.ProvidePlugin({
        process: 'process',
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: 'node_modules/tlsn-wasm',
            to: path.join(__dirname, 'test-build'),
            force: true,
          },
        ],
      }),
      ...Object.keys(entry).map(
        (name) =>
          new HtmlWebpackPlugin({
            template: './test/test.ejs',
            filename: `${name}.html`,
            chunks: [name],
            inject: true,
            testName: name,
          })
      ),
      new HtmlWebpackPlugin({
        templateContent: () => `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <title>tlsn-js test index</title>
            </head>
            <body>
              <h1>tlsn-js test index</h1>
              <ul>
                ${Object.keys(entry)
          .map(
            (name) =>
              `<li><a href="${name}.html">${name}</a></li>`
          )
          .join('\n')}
              </ul>
            </body>
          </html>
        `,
        filename: 'index.html',
        inject: false,
      }),
    ],
    stats: 'minimal',

    // 🎯 ЗАМІНИТИ devServer НА ЦЕЙ КОД
    devServer: {
      historyApiFallback: true,
      port: 3001,

      // 🎯 ДОДАТИ setupMiddlewares
      setupMiddlewares: (middlewares, devServer) => {
        if (!devServer) {
          throw new Error('webpack-dev-server is not defined');
        }

        // 🎯 API для збереження proof
        devServer.app.post('/api/save-proof', express.json({ limit: '50mb' }), (req, res) => {
          try {
            const { filename, data, subdirectory } = req.body;

            if (!filename || !data) {
              return res.status(400).json({
                success: false,
                error: 'Missing filename or data'
              });
            }

            // Визначити директорію
            let targetDir = PROOFS_DIR;
            if (subdirectory) {
              targetDir = path.join(PROOFS_DIR, subdirectory);
              if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
              }
            }

            const filePath = path.join(targetDir, filename);

            // Перевірка безпеки
            const relativePath = path.relative(PROOFS_DIR, filePath);
            if (relativePath.startsWith('..')) {
              return res.status(403).json({
                success: false,
                error: 'Invalid file path'
              });
            }

            // Зберегти файл
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

            console.log('✅ Proof saved:', filePath);
            console.log('   Size:', (JSON.stringify(data).length / 1024).toFixed(2), 'KB');

            res.json({
              success: true,
              filename: filename,
              path: filePath,
              size: fs.statSync(filePath).size,
            });

          } catch (err) {
            console.error('❌ Error saving proof:', err);
            res.status(500).json({
              success: false,
              error: err.message
            });
          }
        });

        // 🎯 API для списку файлів
        devServer.app.get('/api/proofs', (req, res) => {
          try {
            const files = fs.readdirSync(PROOFS_DIR)
              .filter(f => f.endsWith('.json'))
              .map(f => {
                const stats = fs.statSync(path.join(PROOFS_DIR, f));
                return {
                  name: f,
                  size: stats.size,
                  created: stats.birthtime,
                  modified: stats.mtime,
                };
              })
              .sort((a, b) => b.modified - a.modified);

            res.json({
              success: true,
              files: files,
              directory: PROOFS_DIR,
            });
          } catch (err) {
            res.status(500).json({
              success: false,
              error: err.message
            });
          }
        });

        // 🎯 API для завантаження конкретного файлу
        devServer.app.get('/api/proofs/:filename', (req, res) => {
          try {
            const filename = req.params.filename;
            const filePath = path.join(PROOFS_DIR, filename);

            if (!fs.existsSync(filePath)) {
              return res.status(404).json({
                success: false,
                error: 'File not found'
              });
            }

            res.download(filePath);
          } catch (err) {
            res.status(500).json({
              success: false,
              error: err.message
            });
          }
        });

        return middlewares;
      },
    },
  },
];




// const webpack = require('webpack');
// const HtmlWebpackPlugin = require('html-webpack-plugin');
// const path = require('path');
// const CopyWebpackPlugin = require('copy-webpack-plugin');
//
// const isProd = process.env.NODE_ENV === 'production';
//
// const envPlugin = new webpack.EnvironmentPlugin({
//   NODE_ENV: 'development',
//   LOCAL_NOTARY: true,
//   LOCAL_WS: false,
//   HEADLESS: false,
// });
//
// const rules = [
//   {
//     test: /\.node$/,
//     use: 'node-loader',
//   },
//   {
//     test: /\.tsx?$/,
//     exclude: /(node_modules|.webpack)/,
//     use: [
//       {
//         loader: 'ts-loader',
//         options: {
//           transpileOnly: true,
//         },
//       },
//     ],
//   },
// ];
//
// const rendererRules = [];
//
// const entry = {
//   'integration': path.join(__dirname, 'test', 'new', 'integration.spec.ts'),
//   'verify': path.join(__dirname, 'test', 'new', 'verify.spec.ts'),
//   // add more entries as needed
// };
//
// module.exports = [
//   {
//     target: 'web',
//     mode: isProd ? 'production' : 'development',
//     entry,
//     output: {
//       path: __dirname + '/test-build',
//       publicPath: '/',
//       filename: `[name].js`,
//     },
//     devtool: 'source-map',
//     resolve: {
//       extensions: ['.ts', '.tsx', '.js', '.jsx', '.png', '.svg'],
//     },
//     module: {
//       rules: [...rules, ...rendererRules],
//     },
//     plugins: [
//       envPlugin,
//       new webpack.ProvidePlugin({
//         Buffer: ['buffer', 'Buffer'],
//       }),
//       new webpack.ProvidePlugin({
//         process: 'process',
//       }),
//       new CopyWebpackPlugin({
//         patterns: [
//           {
//             from: 'node_modules/tlsn-wasm',
//             to: path.join(__dirname, 'test-build'),
//             force: true,
//           },
//         ],
//       }),
//       // Generate an HTML file for each entry
//       ...Object.keys(entry).map(
//         (name) =>
//           new HtmlWebpackPlugin({
//             template: './test/test.ejs',
//             filename: `${name}.html`,
//             chunks: [name],
//             inject: true,
//             testName: name,
//           })
//       ),
//       // Add an index page listing all test pages
//       new HtmlWebpackPlugin({
//         templateContent: () => `
//           <!DOCTYPE html>
//           <html>
//             <head>
//               <meta charset="UTF-8">
//               <title>tlsn-js test index</title>
//             </head>
//             <body>
//               <h1>tlsn-js test index</h1>
//               <ul>
//                 ${Object.keys(entry)
//             .map(
//               (name) =>
//                 `<li><a href="${name}.html">${name}</a></li>`
//             )
//             .join('\n')}
//               </ul>
//             </body>
//           </html>
//         `,
//         filename: 'index.html',
//         inject: false,
//       }),
//     ],
//     stats: 'minimal',
//     devServer: {
//       historyApiFallback: true,
//     },
//   },
// ];
