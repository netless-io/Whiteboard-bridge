# 注入自定义插件

>注册的自定义插件，只在本地运行，各端需要自己单独进行注册。

1. 注册自定义插件

bridge 默认 window.windowPlugins 数组中存储着注入 plugin 的名称。然后会去 window 是中读取该 plugin 对象。最后将这些获取到的plugin 使用 white-web-sdk 的 createPlugins 方法生成初始化 sdk 时，白板需要的 plugin 对象。

>注入 window.windowPlugins 数组时，请自行确保 window.windowPlugins 为正确的数组结构。

```typescript
const windowPlugins: {[key in string]: any} = [];
for (const value of window.pluginParams || []) {
    const p = {
        [value.name]: (window as any)[value.variable]
    };
    windowPlugins.push(p);
}

const plugins = createPlugins({
    "video": videoPlugin,
    "audio": audioPlugin,
    "video2": videoPlugin2,
    "audio2": audioPlugin2,
    "video.js": videoJsPlugin({ log: videoJsLogger }),
    // 以上为 bridge 中，默认注册的 plugin，支持同名覆盖
    ...windowPlugins,
});
```

2. 配置插件配置

插件可能会根据业务需求，配置为不同的角色或者上下文信息，而进行不同表现。bridge 默认会从 window.pluginContext 数组中，获取插件所需要的本地配置信息。元素结构如下：{name: 插件名，params：配置信息}。

```typescript
// video.js 配置例子
plugins.setPluginContext("video.js", {enable: false, verbose: true});
for (const v of window.pluginContext || []) {
    plugins.setPluginContext(v.name, v.params);
}
```

>自定义插件，为 2.15.x 以前，增强白板功能的主要方式。该功能在 2.16.x 后，更改为使用 window-manager 注册的方式为主，不再建议使用。

# 向 windowManager 注入自定义插件

bridge 会查询 window.appRegisterParams 数组，遍历其中的每一个元素，将其转换为 windowManager 所需要的格式，并将其传递给 windowManager 的 register 逻辑。其元素结构为 {kind: string, appOptions:{appOptions}, src: string};

