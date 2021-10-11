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