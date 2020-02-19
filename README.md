# white-sdk-bridge

## 介绍

基于 dsbridge 将 [white-web-sdk](https://www.npmjs.com/package/white-web-sdk) 封装成 native 可用，Android iOS 一致的 API。

iOS 端使用[DSBridge-iOS](https://github.com/wendux/DSBridge-IOS)，Android 端使用[DSBridge-Android](https://github.com/wendux/DSBridge-Android) 调用，保证API 一致性。

web-sdk 使用见[文档](https://developer.netless.link/)

## 使用

本项目编译出的文件，会被整体打包进 white-sdk 对应的 native 端中，作为 native sdk 需要的桥接。一般情况下，并不会被直接使用。

## 使用约定

### 1. 时间单位

在本项目中，时间单位都与 js 习惯保持一致，使用毫秒为单位。
iOS 习惯为秒，在 iOS sdk 中进行转换。

### DSBridge 使用

`dsBridge.registerAsyn`方法中，不使用`Promise`，使用`.then()`写法。
`dsBridge`的注册方法：`dsBridge.register`，`dsBridge.registerAsyn`区分命名空间。
没有异步的 API，除遗留问题外，尽可能使用`dsBridge.register`注册。