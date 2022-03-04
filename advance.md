# 注入自定义组件

>注册的自定义组件，只在本地运行，各端需要自己单独进行注册。
>该文档，不管提供组件编写的内容，只提供如何在 bridge 中注册组件的文档。
## 自定义 app

`white-web-sdk`在 2.16 版本开启多窗口模式后，在`window-manager`的支持下，提供了自定义 app 的功能，每一个 App，都会作为一个独立的白板窗口展示。

目前`window-manager`自带`DocsViewer`,`MediaPlayer`,`bridge`额外添加注册了`Slide`组件。

`bridge`在初始化初始化 sdk 时，会遍历`window.appRegisterParams`数组的每一个元素，根据`windowManager`所需要的格式`{kind: string, appOptions:{appOptions}, src: string}`读取每一个元素的结构，然后依次调用`windowManager.registerApp`注册组件。

>app 的编写可以访问[window-manager/example](https://github.com/netless-io/window-manager/tree/master/example) 进行了解。

```typescript
for (const v of window.appRegisterParams || []) {
    WindowManager.register({
        // 注册 app 的名称
        kind: v.kind,
        // 注册 app 时，传给所有 app 实例的参数
        appOptions: v.appOptions,
        // app 在 window 对象上挂载的名称，目前只支持挂载 window 对象的内容
        src: src: v.variable ? window[v.variable] : v.url,
    });
}
```

### 实例

之后在任意一段，使用 window-manger 的添加 app 接口，在多窗口插入该 App，可以在注册该 app（同名）的客户端上看到 app 成功展示。

> 如何开发 app 逻辑，需要查看 [@netless/windowManager](https://github.com/netless-io/window-manager) 文档。

1. 自定义 app 代码

通过 webview 注入 js 的方法，将这段代码注入到 bridge 的网页中。

```typescript
const HelloWorldApp = async () => {
    console.log("start loading HelloWorld...");
    // await new Promise(resolve => setTimeout(resolve, 2000))
    console.log("HelloWorld Loaded");
    return {
        setup: (context) => {
            // const state = context.createStorage<>("HelloWorldApp", { a: 1 });
            context.storage.onStateChanged.addListener(diff => {
                if (diff.a) {
                    console.log("diff", diff.a.newValue, diff.a.oldValue);
                }
                console.log("diff all", diff);
            });
            const c = { c: 3 };
            if (context.getIsWritable()) {
                context.storage.setState({ a: 2, b: c });
                context.storage.setState({ a: 2, b: c });
            }

            console.log("helloworld options", context.getAppOptions());

            context.addMagixEventListener("event1", message => {
                console.log("MagixEvent", message);
            });
            // context.dispatchMagixEvent("event1", { count: 1 });
            context.mountView(context.getBox().$content);
            context.emitter.on("destroy", () => console.log("[HelloWorld]: destroy"));
            setTimeout(() => {
                console.log(context.getAttributes());
            }, 1000);
            return "Hello World Result";
        },
    };
};
```

2. 注册自定义 app


a. 手动使用代码注册
```typescript
// bridge 注册了全局变量 windowManager
windowManager.register({
    // 注册 app 的名称
    kind: "HelloWorldApp",
    // 自己需要的参数，只对本地的 app 有效
    appOptions: {},
    // app 方法初始化的入口
    src: HelloWorldApp,
});
```
>使用该方法注册的 app，需要保证 webview 中的内容，已经完整加载完成。否则`windowManager`对象，还没有挂载到`window`上，无法手动注册。
>同时需要在调用初始化 sdk 前，执行以上代码。

b. 通过 window 中的`appRegisterParams`变量，存储 app 的注册信息。在初始化 sdk 时，bridge 会提取`appRegisterParams`中的内容，自动进行注册。

```typescript
// 在原来的 app 的代码里面，就应该注册上，不过如果是手动注册，不需要
window.HelloWorldApp = HelloWorldApp;

window.appRegisterParams = [] || window.appRegisterParams;
// 这种方式，可以由 native 比较灵活的控制 appOption 等参数，但是只能传可以被 JSON 化的数据。
window.appRegisterParams.push({
    kind: "HelloWorldApp",
    // 自己需要的参数，只对本地的 app 有效
    appOptions: {},
    // 需要把上面的 HelloWorldApp 方法挂载到 window 对象上，此处可以直接取
    variable: "HelloWorldApp"
});
```


3. 插入实例 app 进行展示

> 在 webview，或者启动 bridge 加入房间后，调用一下代码以下代码，插入一个 app 实例。

```typescript
window.manager.addApp({
    kind: "HelloWorldApp",
    options: {
        // scenePath 为白板页面，如果没有填写，则出现的窗口里面，不存在白板。
        scenePath: "/dawda",
        // 可以传入任意的参数
        name: "hello world",
    },
});
```

## 自定义 plugin

white-web-sdk 可以通过使用暴露的 `createPlugins` 方法，生成 sdk 支持的自定义插件（传入的类，需要实现 sdk 定义的 plugin 生命周期和方法），然后在初始化 sdk 时，传入。

bridge 目前自带音视频插件。

1. 注册自定义插件

bridge 会从 `window.windowPlugins` 数组读取需要注入的自定义插件的名称，然后会从 window 中读取该 plugin 对象（通过 window.plugin 的方式读取）。最后将这些获取到的对象，使用 white-web-sdk 的 `createPlugins`方法生成初始化白板 sdk 需要的封装的`plugin`对象。

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