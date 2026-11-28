# Whiteboard 多端紧急修复版本与客户接入说明

更新日期：2026-11-28。适用范围：Android、iOS、HarmonyOS。

**本版基于上一版，修复断线后旧连接已经关闭，SDK 仍额外等待关闭超时、导致自动重连变慢的问题。升级对应 Native SDK 即可使用，无需为本次修复修改业务入房、离房逻辑或开启预加载。**

## 当前版本与发布状态

| 接入端 | 上一版本 | 本次版本 | 当前状态 |
| --- | --- | --- | --- |
| Android | `2.16.137` | **`2.16.138`** | [JitPack POM](https://jitpack.io/com/github/netless-io/whiteboard-android/2.16.138/whiteboard-android-2.16.138.pom) / [AAR](https://jitpack.io/com/github/netless-io/whiteboard-android/2.16.138/whiteboard-android-2.16.138.aar) 已公开，构建提交、版本及内容核验通过 |
| iOS | `2.16.150` | **`2.16.151`** | [官方 Podspec](https://cdn.cocoapods.org/Specs/a/7/0/Whiteboard/2.16.151/Whiteboard.podspec.json) 与 [Git tag](https://github.com/netless-io/Whiteboard-iOS/tree/2.16.151) 已发布，公开 spec、源码和内嵌资源核验通过 |
| HarmonyOS | `0.2.14` | **`0.2.15`** | OHPM 审核已通过，[HAR](https://ohpm.openharmony.cn/ohpm/@shengwang/whiteboard/-/whiteboard-0.2.15.har) 已公开；latest、下载包与上传包完整性核验通过 |

配套 Web 依赖与上一版一致：White Web SDK `2.16.63`、WindowManager `1.0.29`、Appliance Plugin `1.1.49`、app-slide `0.2.109`。本次未升级 Akko，未带入原计划下一版本功能；无需单独升级 Web 依赖或替换 Native 包内 JS。

## 一、主要修复

### 1.1 旧连接已关闭，自动重连仍额外等待

Bridge 为支持不同 WebSocket 通道，对全局 WebSocket 构造器进行了包装，但没有保留构造器上的四个标准状态常量。上层读取 `WebSocket.CLOSED` 时得到 `undefined`，旧连接即使已经是 `CLOSED`，也可能识别失败，额外等待约 10 秒关闭超时后才继续重连。

本版恢复只读标准常量：`CONNECTING=0`、`OPEN=1`、`CLOSING=2`、`CLOSED=3`。**旧连接已经关闭时，SDK 能正确识别并继续重连，不再因常量缺失而额外等待关闭超时。**

修复同时覆盖 Bridge 的 WebView 自带 WebSocket 通道和 Native Socket 包装分支；不改变实际连接状态、事件、通道选择及关闭流程。

### 1.2 保留的重连边界

旧连接实际仍处于 `CLOSING` 时，现有最多 10 秒的关闭等待继续保留。本次未修改 Akko 的等待或旧会话清理策略，不能将此补丁理解为所有断网场景都能立即恢复。

实际恢复耗时仍受网络恢复、重新建连和房间初始化影响。此次针对的是“连接已关闭但识别失败”造成的额外等待。

## 二、安装与升级

### 2.1 Android

保留现有 JitPack 仓库配置，更新依赖：

```groovy
implementation 'com.github.netless-io:whiteboard-android:2.16.138'
```

### 2.2 iOS

CocoaPods 官方版本已发布，可固定引用：

```ruby
pod 'Whiteboard', '2.16.151'
```

使用 Git tag 接入的项目也可继续保持原方式：

```ruby
pod 'Whiteboard',
    :git => 'https://github.com/netless-io/Whiteboard-iOS.git',
    :tag => '2.16.151'
```

执行 `pod install`；已有工程按锁文件规则更新 Whiteboard。

### 2.3 HarmonyOS

OHPM 审核和公开下载核验均已完成，更新依赖：

```bash
ohpm install @shengwang/whiteboard@0.2.15
```

## 三、真机测试覆盖

普通入房与显式预加载入房均纳入验证。重入后同时检查实际绘制、笔迹同步和课件操作，验证当前白板可继续使用。

| 类别 | 覆盖场景 | 验证结果 |
| --- | --- | --- |
| 普通 / 预加载入房 | 两种入口分别执行完整功能组 | 三端各 `24/24`、`24/24` 通过 |
| 构造后立即入房 | 不显式调用准备接口，直接入房并双向绘制 | 三端各 `2/2` 通过 |
| 绘制与同步 | 双向绘制、绘制中加入、并发绘制、撤销 / 重做后继续绘制 | 三端验证通过，计入完整功能组 |
| 视角与课件 | 本地 / 共享视角；打开和翻页 Slide，快速翻页后收敛并继续前后翻页 | 三端验证通过，计入完整功能组 |
| 主动退出再进入 | 离房后重新入房，再检查绘制与课件 | 三端验证通过，计入完整功能组 |
| **直接关闭页面再进入** | 销毁 / 卸载旧白板宿主，重建并重新入房 | 三端验证通过，计入完整功能组 |
| 不关闭直接再次入房 | 保留页面和 SDK，再次调用 `joinRoom`，检查旧房间接替与后续使用 | 三端验证通过，计入完整功能组 |
| 配置隔离与受控失败恢复 | 普通配置、预加载开关、Worker 模式、动态配置和模型加载失败 / 超时回退、重入后绘制 | 三端各 `20/20` 通过 |
| 既有接入兼容 | Apps 空列表、共享音量、实际 Demo 普通和预加载入口 | 三端各 `2+3+2` 项通过 |
| WebSocket 回归 | 四个构造器常量及只读属性；浏览器透传和 Native Socket 包装分支、关闭识别 | Bridge 回归检查通过 |

| 真机验收汇总 | 已完成结果 |
| --- | --- |
| Android：Samsung SM-P610（Android 13） | **77 项通过**；稳定 USB 下完成全部组，实际安装 APK 与候选包哈希一致；另有单测 184 项，0 失败、0 错误、1 跳过 |
| iOS：iPhone 6（iOS 12.5.8） | **77 项通过**；真机编译与 CocoaPods 发布校验通过 |
| HarmonyOS：MatePad DMG-W00（OpenHarmony 6.1.1.120） | **77 项通过**；另完成 PPT 媒体播放 / 暂停、Slide 资源失败恢复，以及独立两用例的入房 JSON 探针 |

77 项为 `24+24+2+3+2+20+2`，功能组中的重入、绘制与课件检查不重复计数。本轮按要求未新增物理断网测试；之前 USB / 调试连接中断的轮次未计入通过，恢复连接后完成了整组重跑。

三端正式包内的 13 项 Bridge 资源均与批准构建的大小、SHA-256 一致。公开发布后再次核对：Android 构建提交、POM / AAR 和 SDK 版本；iOS 官方 spec 与 tag 源码；Harmony registry integrity 与下载 HAR。三端均未混入测试凭据、本地签名或下一版本需求。

## 四、升级建议

建议使用上述上一版本、遇到断网恢复后仍有额外关闭等待的客户升级对应 Native SDK。原有 `joinRoom`、`leaveRoom` / `disconnect` 调用方式保持不变，无需通过重建 WebView 或 SDK 来使用本修复。

三端均已合入正式主线：Android、iOS 为 `origin/master`，Harmony 为其正式默认分支 `origin/main`。release tag 指向对应主线合并提交，源码内容与真机验收候选一致。

- [Android 修复与版本 PR](https://github.com/netless-io/whiteboard-android/pull/24)
- [iOS 修复与版本 PR](https://github.com/netless-io/Whiteboard-iOS/pull/100)
- [Harmony 修复与版本 PR](https://github.com/netless-io/whiteboard-harmony/pull/10)
- [Bridge WebSocket 常量修复 PR](https://github.com/netless-io/Whiteboard-bridge/pull/284)
