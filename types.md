## 提供外部调用的API

src/bridge 中 SDKBridge.ts、RoomBridge.ts、PlayerBridge.ts 三个文件，都是对外调用的API，不过这三个文件中实现的 API 并不是和外部调用时 API 一模一样。所以需要单独写一份调用 interface 给外部展示。

## 调用外部的API，需要外部实现

CallbackHandler 中，以 dsbridge.call 形势调用外部的，就是需要外部实现的。不过也和外部实际使用时的逻辑不一致。