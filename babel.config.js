module.exports = {
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
        "@babel/proposal-object-rest-spread"
    ]
}