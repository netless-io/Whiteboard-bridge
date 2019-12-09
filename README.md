# white-sdk-bridge

## 介绍

基于 dsbridge 将 [white-web-sdk](https://www.npmjs.com/package/white-web-sdk) 封装成 native 可用，Android iOS 一致的 API。

iOS 端使用[DSBridge-iOS](https://github.com/wendux/DSBridge-IOS)，Android 端使用[DSBridge-Android](https://github.com/wendux/DSBridge-Android) 调用，保证API 一致性。

web-sdk 使用见[文档](https://developer.netless.link/)

## 使用

本项目编译出的文件，会被整体打包进 white-sdk 对应的 native 端中，作为 native sdk 需要的桥接。一般情况下，并不会被直接使用。