# Native 显式预加载隔离（Android 验证）

所有可选项默认关闭：`enableModelPreload` 为 false；`dynamicConfig` 未配置；`preloadBuiltinApps` 未配置/null/[]；新增 Native-only `enablePreLoadAppliancePlugin` 为 false。`enableAppliancePlugin` 仅控制功能，不能独立触发预加载。教具前置必须两个教具开关同时为 true。

普通路径直接调用 SDK.joinRoom；Bridge 不调用 SDK 私有 prepare 方法，也不构造可选准备器、Promise 聚合和观察任务。教具 Worker Blob 及探针留在 Room/WindowManager 成功后的原初始化点。App 类只有非空列表才调用 WindowManager.preloadApps。模型和动态配置由 SDK 自行准备/消费，Bridge 的可选观察不会成为入房前置总等待。

配置了动态配置且开启教具前置时，通过内部只读 `__observeDynamicConfigPreload()` 取得 SDK 已启动任务；该方法不请求、不刷新缓存、不启动定时器。没有有效配置结果时，前置教具任务报告 warn，留给实际 Room 配置完成正常初始化。异步 Worker source 就绪后先调用 prepare，再交出 options 供实际 getInstance 复用；初始化不会越过同一启动任务再触发迟到 prepare。

首份教具配置遵循 1.1.49 的 JS 文档级规则。普通首次初始化可以接受 Room 参数；前置时 SDK 级参数已冻结，Room 不覆盖。Blob URL 文档级复用，不在 releaseRoom/leaveRoom 撤销；探针及绘制 Worker 各自按既有生命周期终止。

## 本地 SDK / Akko 链路

当前未发布的 SDK 2.16.63 只用于本地验证，包含 Akko master 849e007c。`package.json` 的 file: 指向工作区 output 下构建包，不指向旧工作区主副本 2.16.62。appliance-plugin 使用已发布的 npm 1.1.49，其他依赖继续使用 npm。

从工作区根目录执行（源路径按本机实际位置设置）：

```sh
SDK_SOURCE_ROOT=/absolute/path/to/current/white-sdk \
AKKO_SOURCE_ROOT=/absolute/path/to/current/akko \
node scripts/build-native-preload-sdk.cjs output/native-preload-isolation-20261108/white-web-sdk
```

该脚本检查 SDK/所需 Akko 源码类型、编译真正入口、生成类型声明、写入 Git 与产物 hash。随后在 Bridge 执行 `yarn install`。Yarn 1 的 file: 会复制包；需要实时软链接时将 `node_modules/white-web-sdk` 指向同一输出包。webpack 固定一个 SDK 物理入口；构建门禁验证 local-source.json 中的 hash，其他 npm 包禁止软链接。

`yarn run check`（显式 run，避免 Yarn 内置 check 同名命令）运行所有 Bridge 回归，包括普通流程与延迟/失败清理。`yarn run build` 后仅同步 Android 内嵌资源；不改变 iOS/Harmony 已发布资源。Native 使用方式见 Android 的 docs/PRELOAD_ISOLATION.md。

## 超时与观察

prepareCompletion 只等基础 JS，默认 15 秒属于宿主显式等待。构造阶段不添加准备期限。SDK 消费模型/动态配置时分别用既有 120 秒/5 秒等待规则；Native 入房总时限仍默认 45 秒，先到期的 Native 总时限可以终止本次入房。可选 onPreloadStateChange 对已开启任务观察一次 success/warn；全部关闭时 Android 连 sdk.observePreload 都不发送。
