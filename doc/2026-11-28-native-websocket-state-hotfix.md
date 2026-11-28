# Whiteboard Native WebSocket 状态常量修复

2026-11-28。本次为线上版本的紧急补丁。

## 发布状态

| 平台 | 线上基线 | 本次版本 | 状态 |
| --- | --- | --- | --- |
| iOS | 2.16.150 | 2.16.151 | CocoaPods 已发布，公开 spec 与源码内嵌资源已回读验证 |
| Android | 2.16.137 | 2.16.138 | 构建和单测通过；等待稳定 USB 完成真机验收，尚未发布 |
| Harmony | 0.2.14 | 0.2.15 | 真机验收通过，OHPM 已上传；平台审核中，尚未确认公开可安装 |

## 修复内容

Bridge 包装全局 WebSocket 时未保留构造器上的四个标准状态常量，导致上层读取 `WebSocket.CLOSED` 得到 `undefined`。旧连接即使已经关闭，也可能错误等待关闭超时。

本次为包装后的构造器恢复只读常量：`CONNECTING=0`、`OPEN=1`、`CLOSING=2`、`CLOSED=3`。连接已经 `CLOSED` 时，上层可以正确识别并继续重连。

未改变 Socket 实际状态、事件和关闭流程。真实连接仍处于 `CLOSING` 时，现有最多 10 秒的关闭等待继续保留；本次不宣称消除这条路径的等待。

## 版本范围

三端内嵌 Bridge 使用 [PR #284](https://github.com/netless-io/Whiteboard-bridge/pull/284) 合并提交 `914f623`。补丁分别从各平台线上主线基线构建，Native 产品逻辑保持原实现，仅更新内嵌资源和版本元数据。

依赖不变：white-web-sdk 2.16.63、WindowManager 1.0.29、Appliance Plugin 1.1.49、app-slide 0.2.109。未升级 Akko，未带入原计划下一版本功能。

## 发布前验证

- Bridge 类型和回归检查、Cypress、生产构建通过；各平台内嵌的 13 项资源全部通过大小与 SHA-256 对照。
- iOS：iPhone 6 / iOS 12.5.8，77 项真机自动化通过，包含普通及预加载入口、双向绘制、课件、撤销重做、离房重入、View 重建、重复入房与配置隔离；编译和 CocoaPods 校验通过。
- Harmony：DMG-W00 / OpenHarmony 6.1.1.120，同一组 77 项通过；另通过 PPT 媒体播放暂停、Slide 资源失败恢复，以及实际 Native → Bridge 入房 JSON 探针。release HAR 已解包检查，无测试凭据及本地签名。
- Android：构建通过；单测 184 项，0 失败、0 错误、1 跳过。真机验收因 USB 断连尚未完成，不计通过。

本轮按要求不新增物理断网测试。基础设施中断记录与完整重跑结果分别保留。

## 安装与源码

已发布的 iOS：`pod 'Whiteboard', '2.16.151'`。

Harmony 请等待 OHPM 审核及公开仓库可下载确认；Android 请等待真机验收和 JitPack 发布完成。

- [iOS 修复与版本 PR](https://github.com/netless-io/Whiteboard-iOS/pull/100)
- [Android 修复与版本 PR](https://github.com/netless-io/whiteboard-android/pull/24)
- [Harmony 修复与版本 PR](https://github.com/netless-io/whiteboard-harmony/pull/10)
