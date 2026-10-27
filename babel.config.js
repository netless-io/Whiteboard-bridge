module.exports = {
    "exclude": [
        // \\ for Windows, / for macOS and Linux
        /node_modules[\\/]core-js/,
        /node_modules[\\/]webpack[\\/]buildin/,
      ],
    "presets": [
        ["@babel/preset-env",
        {
            "useBuiltIns": "entry",
            "corejs": 3,
            // Webpack must see import() to keep local Worker source chunks lazy.
            "exclude": ["proposal-dynamic-import"],
        }],
        "@babel/preset-typescript",
        "@babel/preset-react"
    ],
    "plugins": [
        "@babel/proposal-class-properties",
        "@babel/proposal-object-rest-spread",
        "@babel/plugin-transform-modules-commonjs"
    ]
}
