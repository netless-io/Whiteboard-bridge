import { currentScope, documentId, failure, inScope, lifecycle, Task } from "./Lifecycle";
import { withDynamicConfigDefaults, splitNativeConfiguration, resolveNativeConfiguration } from "./DynamicConfigParameters";
import { hookCreateElement } from '../utils/ImgError';
import {CursorTool} from "@netless/cursor-tool";
import { registerAsyn } from '.';
import { NativeSDKConfig, NativeJoinRoomParams, NativeReplayParams, AppRegisterParams, NativeSlideAppOptions } from "@netless/whiteboard-bridge-types";
import type { DynamicConfigOptions } from "white-web-sdk";
import {WhiteWebSdk, Room, Player, createPlugins, PlayerPhase, setAsyncModuleLoadMode, AsyncModuleLoadMode} from "white-web-sdk";
import {videoPlugin} from "@netless/white-video-plugin";
import {audioPlugin} from "@netless/white-audio-plugin";
import {videoPlugin2} from "@netless/white-video-plugin2";
import {audioPlugin2} from "@netless/white-audio-plugin2";
import {videoJsPlugin} from "@netless/video-js-plugin";
import SlideApp, { addHooks as addHooksSlide, usePlugin}  from "@netless/app-slide";
import type { AppOptions as AppSlideOptions } from "@netless/app-slide";
import { EffectPlugin, MixingPlugin } from '@netless/slide-rtc-plugin';
import { MountParams, WindowManager } from "@netless/window-manager";
import { SyncedStorePlugin } from "@netless/synced-store";
import {IframeBridge, IframeWrapper} from "@netless/iframe-bridge";
import {logger, enableReport} from "../utils/Logger";
import {convertBound} from "../utils/BoundConvert";
import { addManagerListener, createAppState } from "./Manager";
import {
    aggregateBackgroundImageQueryResults,
    aggregateBackgroundImageReloadResults,
    assertBackgroundImageCapability,
    backgroundImageProviderParams,
    BackgroundImageSource,
    HasBackgroundImageParams,
    resolveBackgroundImageEventViewId,
    shouldQueryApplianceBackgroundImage,
    validateHasBackgroundImageParams,
} from "./BackgroundImageViewId";
import { mergeDefaultAppliancePluginExtras } from "./AppliancePluginDefaults";
import type {
    NativeSlidePerformanceOptions,
} from "./SlidePerformanceDefaults";
import { resolveSlidePerformanceOptions } from "./SlidePerformanceDefaults";
import { RoomCallbackHandler } from "../native/RoomCallbackHandler";
import { addBridgeLogHook, createPageState } from "../utils/Funs";
import { lastSchedule, ReplayerCallbackHandler, ReplayerCallbackHandlerImp } from "../native/ReplayerCallbackHandler";
import CombinePlayerFactory from "@netless/combine-player";
import { registerBridgeRoom } from "./Room";
import { registerPlayerBridge } from "./Player";
import { RtcAudioMixingClient } from '../RtcAudioMixingClient';
import { SDKCallbackHandler } from '../native/SDKCallbackHandler';
import { destroySyncedStore, initSyncedStore } from './SyncedStore'
import { SlideLoggerPlugin } from '../utils/SlideLogger';
import { RtcAudioEffectClient } from '../RtcAudioEffectClient';
import { prepare } from '@netless/white-prepare';

import { ApplianceMultiPlugin } from '@netless/appliance-plugin';
import fullWorkerString from '@netless/appliance-plugin/dist/fullWorker.js?raw';
import subWorkerString from '@netless/appliance-plugin/dist/subWorker.js?raw';
import { createWorkerInstance as createFoundationWorkerInstance } from '../FoundationWorkerFactory';
import { PCMProxy } from '../PCMProxy';

interface ExtraNativeJoinRoomParams {
  appliancePluginOptions?: Record<string, any>;
  windowParams?: NativeWindowParams;
}

type NativePresentationViewport = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type NativePresentationAppOptions = {
    disableCameraTransform?: boolean;
    maxCameraScale?: number;
    viewport?: NativePresentationViewport;
    justDocsViewReadonly?: boolean;
    useScrollbar?: boolean;
    debounceSync?: boolean;
    goToPageByClick?: boolean;
    useClipView?: boolean;
};

type NativeBuiltinAppOptions = {
    presentation?: NativePresentationAppOptions;
};

type NativeSDKConfigWithPresentation = NativeSDKConfig & {
    disableDeviceInputs?: boolean;
    dynamicConfig?: DynamicConfigOptions;
    __nativeConfigDefaults?: readonly string[];
    presentationAppOptions?: NativePresentationAppOptions;
    backgroundImageLoadOptions?: BackgroundImageLoadOptions;
};

/** 背景图片加载重试次数：`-1`（无限重试）或 `0`~`10` 的整数。 */
type BackgroundImageMaxRetries = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

type BackgroundImageLoadOptions = {
    /** 背景图片加载重试次数。
     *  - `-1`：无限重试，对外统一使用该值（由 appliance-plugin 内部归一为 `Infinity`）；
     *  - `0`~`10`：有限重试次数。
     */
    maxRetries?: BackgroundImageMaxRetries;
    timeoutMs?: number;
    retryIntervalMs?: number;
};

function validateBackgroundImageLoadOptions(options?: BackgroundImageLoadOptions): void {
    if (!options) {
        return;
    }
    const { maxRetries, timeoutMs, retryIntervalMs } = options;
    if (maxRetries !== undefined && maxRetries !== -1 &&
        (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 10)) {
        throw new RangeError("backgroundImageLoadOptions.maxRetries must be -1 (infinite retry) or an integer from 0 to 10");
    }
    if (timeoutMs !== undefined &&
        (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000)) {
        throw new RangeError("backgroundImageLoadOptions.timeoutMs must be from 1000 to 120000");
    }
    if (retryIntervalMs !== undefined &&
        (!Number.isFinite(retryIntervalMs) || retryIntervalMs < 0 || retryIntervalMs > 30000)) {
        throw new RangeError("backgroundImageLoadOptions.retryIntervalMs must be from 0 to 30000");
    }
}

type BackgroundImageLoadEvent = {
    name: "backgroundImageLoad";
    state: "success" | "failed" | "cancelled";
    source: BackgroundImageSource;
    resourceId: string;
    resourceUrl: string;
    viewId: string;
    scenePath: string;
};

type ReloadBackgroundImageParams = {
    source: BackgroundImageSource;
    viewId: string;
    scenePath?: string;
    url?: string;
};

type ReloadBackgroundImageResult = {
    accepted: boolean;
    reloadedCount: number;
    reason?: "viewNotFound" | "sceneNotFocused" | "resourceNotFound" | "alreadyLoading";
};

type NativeOriginSize = {
    width: number;
    height: number;
};

type NativePageScaleRange = {
    minScale?: number;
    maxScale?: number;
};

type NativeWindowParams = Omit<
    MountParams,
    "room" | "container" | "originSize" | "pageScaleRange"
> & {
    /** Use per-window boxesStatus state management. Applies to joinRoom and replayRoom. */
    useBoxesStatus?: boolean;
    /** Force the shared room window state to maximized. Ignored when useBoxesStatus is true. */
    forceMaximized?: boolean;
    /** Lazily set up the focused App runtime while force-maximized mode is active. */
    lazySetupInMaximizedMode?: boolean;
    /** Maximum number of App runtimes retained by the local lazy LRU cache. */
    maxCachedAppsInMaximizedMode?: number;
    /** MainView reference size. Slide/Presentation receive originSize through addApp attributes. */
    originSize?: NativeOriginSize;
    /** Optional relative scale bounds. Omitted bounds mean no business limit. */
    pageScaleRange?: NativePageScaleRange;
    builtinAppOptions?: NativeBuiltinAppOptions;
};

type ExtraNativeReplayParams = Omit<NativeReplayParams, "windowParams"> & {
    windowParams?: NativeWindowParams;
};

type NativeLocalLogOptions = {
    enabled?: boolean;
    enabledUpload?: boolean;
};

let sdk: WhiteWebSdk | undefined = undefined;
let room: Room | undefined = undefined;
let player: Player | undefined = undefined;

let nativeConfig: NativeSDKConfigWithPresentation | undefined = undefined;
let cursorAdapter: CursorTool | undefined = undefined;
function postBackgroundImageLoadEvent(event: BackgroundImageLoadEvent): void {
    if ((event as { source?: string }).source !== "appliance") {
        return;
    }
    const normalized: BackgroundImageLoadEvent = {
        name: "backgroundImageLoad",
        state: event.state,
        source: event.source,
        resourceId: String(event.resourceId),
        resourceUrl: event.resourceUrl,
        viewId: resolveBackgroundImageViewId(event),
        scenePath: event.scenePath,
    };
    sdkCallbackHandler.onPostMessage(JSON.stringify(normalized));
}

type ApplianceInitLoadingChangeInfo = {
    loading: boolean;
    phase: string;
    status: string;
};

function postApplianceInitLoadingChange(info: ApplianceInitLoadingChangeInfo): void {
    sdkCallbackHandler.onPostMessage(JSON.stringify({
        name: "applianceInitLoadingChange",
        loading: info.loading,
        phase: info.phase,
        status: info.status,
    }));
}

function resolveBackgroundImageViewId(event: BackgroundImageLoadEvent): string {
    const originalViewId = String(event.viewId);
    try {
        return resolveBackgroundImageEventViewId(
            originalViewId,
            !!(room?.useMultiViews ?? player?.useMultiViews ?? nativeConfig?.useMultiViews),
        );
    } catch {
        // WindowManager may exist before AppManager finishes initialization.
        return originalViewId;
    }
}

export const sdkCallbackHandler = new SDKCallbackHandler();

let divRef: ()=>(HTMLElement | undefined);

const textareaCSSId = "whiteboard-native-css"
const nativeFontFaceCSS = "whiteboard-native-font-face";
setAsyncModuleLoadMode(AsyncModuleLoadMode.StoreAsBase64);

export function setWhiteboardDivGetter(aGetter: ()=>(HTMLElement)) {
    divRef = aGetter;
}

const sdkNameSpace = "sdk";
const maxRegisterAppJavascriptStringLength = 500;
const logTruncatedSuffix = "...";
let disposeLocalLogStateChange: (() => void) | undefined;
let applianceFullWorkerBlobUrl: string | undefined;
let applianceSubWorkerBlobUrl: string | undefined;
let sdkConfigurationJson: string | undefined;

export function registerSDKBridge() {
    const sdk = new SDKBridge();
    registerAsyn(sdkNameSpace, sdk);
    (window as any).newWhiteSdk = sdk.newWhiteSdk;
    (window as any).joinRoom = sdk.joinRoom;
    (window as any).replayRoom = sdk.replayRoom;
    addBridgeLogHook([sdkNameSpace], logger, { excludedFunNames: ["registerApp"] });
}

function getRegisterAppLogParams(para: AppRegisterParams): AppRegisterParams {
    if (typeof para.javascriptString !== "string" || para.javascriptString.length <= maxRegisterAppJavascriptStringLength) {
        return para;
    }

    return {
        ...para,
        javascriptString: `${para.javascriptString.slice(0, maxRegisterAppJavascriptStringLength)}${logTruncatedSuffix}`,
    };
}

function pickNativeLocalLogOptions(localLog: any): NativeLocalLogOptions | undefined {
    if (!localLog || typeof localLog !== "object") {
        return undefined;
    }

    const picked: NativeLocalLogOptions = {};

    if (typeof localLog.enabled === "boolean") {
        picked.enabled = localLog.enabled;
    }
    if (typeof localLog.enabledUpload === "boolean") {
        picked.enabledUpload = localLog.enabledUpload;
    }

    return Object.keys(picked).length > 0 ? picked : undefined;
}

function createFoundationLogWorker(): Worker {
    logger("localLog worker blob url");
    return createFoundationWorkerInstance();
}

function createWorkerBlobUrl(workerString: string): string {
    const blob = new Blob([workerString], { type: "text/javascript" });
    return URL.createObjectURL(blob);
}

function getApplianceWorkerUrls(): { fullWorkerUrl: string; subWorkerUrl: string } {
    const fullWorkerUrl = applianceFullWorkerBlobUrl || (applianceFullWorkerBlobUrl = createWorkerBlobUrl(fullWorkerString));
    const subWorkerUrl = applianceSubWorkerBlobUrl || (applianceSubWorkerBlobUrl = createWorkerBlobUrl(subWorkerString));

    return {
        fullWorkerUrl,
        subWorkerUrl,
    };
}

function mergeLocalLogOptions(restConfig: any): any {
    const nativeLocalLog = pickNativeLocalLogOptions(restConfig.loggerOptions?.localLog);
    const localLog = nativeLocalLog?.enabled === true ?
        {
            enabled: true,
            ...nativeLocalLog,
            createWorker: createFoundationLogWorker,
        } :
        { enabled: false };

    return {
        ...restConfig,
        loggerOptions: {
            ...restConfig.loggerOptions,
            localLog,
        },
    };
}

function toNativeError(error: any) {
    if (!error) {
        return undefined;
    }
    if (error instanceof Error) {
        const stack = typeof error.stack === "string" ? error.stack : undefined;
        return {
            name: error.name,
            message: error.message,
            stack,
            jsStack: stack,
        };
    }
    return { name: "Error", message: String(error) };
}

function toNativeFile(file: any) {
    if (!file || typeof file !== "object") {
        return undefined;
    }
    const converted: any = {};

    if (file.name !== undefined) converted.name = file.name;
    if (file.size !== undefined) converted.size = file.size;
    if (file.type !== undefined) converted.type = file.type;
    if (file.lastModified !== undefined) converted.lastModified = file.lastModified;

    return converted;
}

function toNativeLocalLogResult(result: any): any {
    if (!result || typeof result !== "object") {
        return { status: "skipped", reason: "unsupported" };
    }

    const converted: any = {
        status: result.status || "skipped",
    };

    if (result.reason !== undefined) converted.reason = result.reason;
    if (result.stage !== undefined) converted.stage = result.stage;
    if (result.fileSize != null) converted.fileSize = result.fileSize;
    if (result.fileName != null) converted.fileName = result.fileName;
    if (result.taskId != null) converted.taskId = result.taskId;
    if (result.lastId != null) converted.lastId = result.lastId;
    if (result.serialNumber != null) converted.serialNumber = result.serialNumber;
    if (result.error) converted.error = toNativeError(result.error);

    return converted;
}

function toNativeLocalLogState(state: any): any {
    if (!state || typeof state !== "object") {
        return {};
    }

    const converted: any = {};
    const keys = [
        "enabled",
        "enabledUpload",
        "isUploading",
        "lastUploadStatus",
        "unavailableReason",
        "foundationVersion",
        "policyHostSource",
        "effectiveWhiteboardPolicyHost",
    ];

    for (const key of keys) {
        if (state[key] !== undefined) {
            converted[key] = state[key];
        }
    }
    return converted;
}

function toNativeLocalLogExportResult(result: any): any {
    if (!result || typeof result !== "object") {
        return {};
    }

    const converted: any = {};

    if (result.file) converted.file = toNativeFile(result.file);
    if (result.labels !== undefined) converted.labels = result.labels;
    if (result.byteLength !== undefined) converted.byteLength = result.byteLength;

    return converted;
}

function bindLocalLogStateChange(nextSdk: any) {
    disposeLocalLogStateChange?.();
    if (typeof nextSdk?.onLocalLogStateChange === "function") {
        disposeLocalLogStateChange = nextSdk.onLocalLogStateChange((state: any) => {
            sdkCallbackHandler.onLocalLogStateChange(toNativeLocalLogState(state));
        });
    } else {
        disposeLocalLogStateChange = undefined;
    }
}

function removeBind() {
    if (window.manager) {
        window.manager.destroy()
        window.manager = undefined;
        room = undefined;
        player = undefined;
    } else if (room) {
        room.bindHtmlElement(null);
        // FIXME:最好执行 disconnect，但是由于如果主动执行 disconnect，会触发状态变化回调，导致一定问题，所以此处不能主动执行。
        room = undefined;
    } else if (player) {
        player.bindHtmlElement(null);
        player = undefined;
    }
    if (window.syncedStore) {
        destroySyncedStore();
    }
}

function toBuiltinAppOptions(options?: NativeBuiltinAppOptions) {
    const presentation = options?.presentation;
    if (!presentation) {
        return undefined;
    }
    return {
        Presentation: {
            disableCameraTransform: presentation.disableCameraTransform,
            maxCameraScale: presentation.maxCameraScale,
            viewport: presentation.viewport,
            justDocsViewReadonly: presentation.justDocsViewReadonly,
            useScrollbar: presentation.useScrollbar,
            debounceSync: presentation.debounceSync,
            goToPageByClick: presentation.goToPageByClick,
            useClipView: presentation.useClipView,
        },
    };
}

async function mountWindowManager(room: Room, handler: RoomCallbackHandler | ReplayerCallbackHandler, windowParams?: NativeWindowParams, setup = nativeConfig, task?: Task) {
    const roomLogger = (room as unknown as { logger?: { info(message: string): void; error(message: string): void } }).logger;
    const windowLayers = splitNativeConfiguration(windowParams || {});
    const { builtinAppOptions, ...restWindowParams } = windowLayers.explicit;
    const setupLayers = splitNativeConfiguration<Partial<NativeSDKConfigWithPresentation>>(setup || {});
    const presentation = builtinAppOptions?.presentation ?? setup?.presentationAppOptions;
    roomLogger?.info("[Bridge] WindowManager.mount start");
    let manager: WindowManager | undefined;
    try {
        manager = await WindowManager.mount(withDynamicConfigDefaults({
            containerSizeRatio: 9/16,
            chessboard: true,
            cursor: !!cursorAdapter,
            ...windowLayers.defaults,
        }, {
            ...(setupLayers.explicit.userCursor !== undefined ? { cursor: !!setupLayers.explicit.userCursor } : {}),
            ...(setupLayers.explicit.enableAppliancePlugin !== undefined ? { supportAppliancePlugin: setupLayers.explicit.enableAppliancePlugin } : {}),
            ...restWindowParams,
            builtinAppOptions: toBuiltinAppOptions(
                presentation ? { presentation } : undefined
            ),
            container: divRef(),
            room,
        } as MountParams));
        roomLogger?.info("[Bridge] WindowManager.mount success");
        if (!task?.cancelled) inScope(task?.scope, () => addManagerListener(manager!, logger, handler));
        return manager;
    } catch (error) {
        if (manager) {
            try { manager.destroy(); } catch (cleanupError) { console.warn("[Bridge] failed to clean mount", cleanupError); }
            if (window.manager === manager) window.manager = undefined;
        }
        roomLogger?.error(`[Bridge] WindowManager.mount failed: ${error?.message || error}`);
        throw error;
    }
}

class SDKBridge {
    hasBackgroundImage = async (
        params: HasBackgroundImageParams,
        responseCallback: any,
    ) => {
        try {
            validateHasBackgroundImageParams(params);
            if (!shouldQueryApplianceBackgroundImage(params.sources)) {
                responseCallback(false);
                return;
            }

            const plugin = window.appliancePlugin as any;
            assertBackgroundImageCapability(
                !!(room?.useMultiViews ?? player?.useMultiViews ?? nativeConfig?.useMultiViews),
                !!nativeConfig?.enableAppliancePlugin,
                plugin?.hasBackgroundImage,
            );
            responseCallback(aggregateBackgroundImageQueryResults([Boolean(
                await plugin.hasBackgroundImage.call(
                    plugin,
                    backgroundImageProviderParams(params),
                ),
            )]));
        } catch (error) {
            const e = error as Error;
            responseCallback(JSON.stringify({ __error: { message: e.message, jsStack: e.stack } }));
        }
    };

    reloadBackgroundImage = async (
        params: ReloadBackgroundImageParams,
        responseCallback: any,
    ) => {
        try {
            if (params.source !== "appliance" && params.source !== "whiteSdk") {
                throw new RangeError("source must be appliance or whiteSdk");
            }
            if (params.source === "whiteSdk") {
                const result: ReloadBackgroundImageResult = {
                    accepted: false,
                    reloadedCount: 0,
                    reason: "resourceNotFound",
                };
                responseCallback(JSON.stringify(result));
                return;
            }
            const plugin = window.appliancePlugin as any;
            assertBackgroundImageCapability(
                !!(room?.useMultiViews ?? player?.useMultiViews ?? nativeConfig?.useMultiViews),
                !!nativeConfig?.enableAppliancePlugin,
                plugin?.reloadBackgroundImage,
            );
            const results: ReloadBackgroundImageResult[] = [
                await plugin.reloadBackgroundImage(params),
            ];
            const result = aggregateBackgroundImageReloadResults(results);
            responseCallback(JSON.stringify(result));
        } catch (error) {
            const e = error as Error;
            responseCallback(JSON.stringify({ __error: { message: e.message, jsStack: e.stack } }));
        }
    };

    getLifecycle = (callback: any) => callback(JSON.stringify({documentId}));

    leaveRoom = (callback: any) => {
        lifecycle.leave(currentScope()).then(() => callback(JSON.stringify({closed: true})),
            error => callback(failure(error.message)));
    }

    newWhiteSdk = (config: NativeSDKConfigWithPresentation, callback?: (value: string) => void) => {
        // Native JSON snapshots may enumerate the same keys in a different order.
        const configurationJson = JSON.stringify(config, (_key, value) =>
            value && typeof value === "object" && !Array.isArray(value)
                ? Object.keys(value).sort().reduce((sorted, key) => { sorted[key] = value[key]; return sorted; }, {})
                : value);
        // A new Native facade may use the existing SDK configuration, but never the old Room.
        if (sdk && configurationJson === sdkConfigurationJson) { callback?.("{}"); return; }
        if (lifecycle.state !== "idle") throw new Error("Busy");
        const urlInterrupter = config.enableInterrupterAPI ? (url: string) => {
            const modifyUrl: string = sdkCallbackHandler.onUrlInterrupter(url);
            if (modifyUrl.length > 0) {
                return modifyUrl;
            }
            return url;
        } : undefined;

        const slideUrlInterrupter = async (url: string) => {
            if (config.enableSlideInterrupterAPI) {
              const modifyUrl = await sdkCallbackHandler.slideUrlInterrupter(url);
              console.log("slideUrlInterrupter", url, modifyUrl);
              return modifyUrl.length > 0 ? modifyUrl : url;
            }
            return url;
        };

        const { log, __nativeConfigDefaults, __nativeTags, __platform, __netlessUA, initializeOriginsStates, useMultiViews, userCursor, enableInterrupterAPI, routeBackup, enableRtcIntercept, enableRtcAudioEffectIntercept, enableSlideInterrupterAPI, enableImgErrorCallback, enableIFramePlugin, enableSyncedStore, enableAppliancePlugin, presentationAppOptions, backgroundImageLoadOptions, ...restConfig } = config;
        const whiteSdkConfig = mergeLocalLogOptions(restConfig);
        const enablePcmDataCallback = (config as any).enablePcmDataCallback || false;

        enableReport(!!log);
        nativeConfig = config;

        if (__platform) {
            window.__platform = __platform;
        }

        if (__netlessUA) {
            window.__netlessUA = __netlessUA.join(' ');
        }

        if (enableImgErrorCallback) {
            hookCreateElement();
        }
        
        cursorAdapter = !!userCursor ? new CursorTool() : undefined;

        if (__nativeTags) {
            window.__nativeTags = { ...window.__nativeTags, ...__nativeTags };
        }

        const pptParams = restConfig.pptParams || {};
        if (enablePcmDataCallback) {
            window.__pcmProxy = new PCMProxy();
        } else if (enableRtcAudioEffectIntercept) {
            usePlugin(new EffectPlugin(new RtcAudioEffectClient("ppt")));
        } else if (enableRtcIntercept) {
            let rtcAudioMixingClient = new RtcAudioMixingClient();
            pptParams.rtcClient = rtcAudioMixingClient; // 旧版 ppt 使用的 audio mixing 接口。
            usePlugin(new MixingPlugin(rtcAudioMixingClient));
        }
        if (config.loggerOptions && config.loggerOptions.printLevelMask === "debug") {
            usePlugin(new SlideLoggerPlugin());
        }

        const videoJsLogger = (message?: any, ...optionalParams: any[]) => {
            logger("videoJsPlugin", message, ...optionalParams);
        }

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
            ...windowPlugins,
        });
        plugins.setPluginContext("video.js", {enable: false, verbose: true});
        for (const v of window.pluginContext || []) {
            (plugins as any).setPluginContext(v.name, v.params);
        }
        window.plugins = plugins;

        const slideAppOptions = (config.slideAppOptions || {}) as NativeSlideAppOptions &
            NativeSlidePerformanceOptions &
            Pick<AppSlideOptions, "enableScale" | "syncEventQueuePolicy" | "navigationButtonMode">;
        const slidePerformanceOptions = resolveSlidePerformanceOptions(
            navigator.userAgent,
            slideAppOptions,
        );
        const slideKind = "Slide";
        WindowManager.register({
            kind: slideKind,
            appOptions: {
                navigatorDelegate: {
                    openUrl: (url: string) => sdkCallbackHandler.slideOpenUrl(url),
                },
                urlInterrupter: slideUrlInterrupter,
                ...slideAppOptions,
                minFPS: slidePerformanceOptions.minFPS,
                maxFPS: slidePerformanceOptions.maxFPS,
                resolution: slidePerformanceOptions.resolution,
                maxResolutionLevel: slidePerformanceOptions.maxResolutionLevel,
                onResourceMaxRetries: (url: string, error: Error) => {
                    sdkCallbackHandler.onSlideResourceMaxRetries(url, error);
                },
            },
            addHooks: addHooksSlide,
            src: async () => {
                return SlideApp;
            },
        });
        for (const v of window.appRegisterParams || []) {
            WindowManager.register({
                kind: v.kind,
                appOptions: v.appOptions,
                src: v.variable ? window[v.variable] : v.url,
            });
        }

        // 新增的插件需要确定是否依赖此状态
        const useMobXState = !!(enableSyncedStore || enableIFramePlugin || useMultiViews || config.dynamicConfig)
        const invisiblePlugins = [
            ...enableIFramePlugin ? [IframeBridge as any] : [],
            ...enableSyncedStore ? [SyncedStorePlugin as any] : [],
            ...enableAppliancePlugin ? [ApplianceMultiPlugin as any] : [],
        ];

        const wrappedComponents = [
            ...enableIFramePlugin ? [IframeWrapper] : [],
        ]

        try {
            validateBackgroundImageLoadOptions(backgroundImageLoadOptions);
            sdk = new WhiteWebSdk({
                ...whiteSdkConfig,
                invisiblePlugins: invisiblePlugins,
                wrappedComponents: wrappedComponents,
                plugins: plugins,
                urlInterrupter: urlInterrupter,
                onWhiteSetupFailed: e => {
                    sdkCallbackHandler.onSetupFail(e);
                },
                pptParams,
                useMobXState,
            });
            window.sdk = sdk;
            sdkConfigurationJson = configurationJson;
            bindLocalLogStateChange(sdk);
        } catch (e) {
            sdkCallbackHandler.onSetupFail(e);
            callback?.(failure(e.message || "SdkSetupFailed"));
            return;
        }
        callback?.("{}");
    };

    joinRoom = async (nativeParams: NativeJoinRoomParams & ExtraNativeJoinRoomParams, responseCallback: any) => {
        if (!sdk) {
            responseCallback(JSON.stringify({__error: {message: "sdk init failed"}}));
            return;
        }
        let task: Task;
        try {
            if (!nativeParams.uuid || !nativeParams.roomToken || !nativeParams.uid) throw new Error("InvalidJoinParameters");
            task = lifecycle.begin("room", currentScope(), responseCallback, (nativeParams as any).timeout || 45000);
        } catch (error) { responseCallback(failure(error.message)); return; }
        const joiningSdk = sdk;
        const setup = nativeConfig!;
        const joiningCursor = cursorAdapter;
        const disposers = task.disposers;
        let acquiredRoom: Room | undefined;
        try {
            const nativeLayers = splitNativeConfiguration(nativeParams);
            const {timeout: defaultTimeout, cameraBound: defaultCameraBound, windowParams: defaultWindowParams, nativeWebSocket: defaultSocket, appliancePluginOptions: defaultPlugin, ...nativeJoinDefaults} = nativeLayers.defaults;
            const {timeout = 45000, cameraBound, windowParams, disableCameraTransform, nativeWebSocket, appliancePluginOptions, ...joinRoomParams} = nativeLayers.explicit;
            const setupLayers = splitNativeConfiguration(setup);
            const {useMultiViews, enableSyncedStore} = setup;
            const invisiblePlugins = [...useMultiViews ? [WindowManager as any] : []];
            window.nativeWebSocket = nativeWebSocket;
            const roomCallbackHandler = new RoomCallbackHandler(task);
            const aRoom = await joiningSdk.joinRoom(withDynamicConfigDefaults({
                disableMagixEventDispatchLimit: useMultiViews,
                useMultiViews,
                ...nativeJoinDefaults,
            }, {
                ...(setupLayers.explicit.useMultiViews !== undefined ? { useMultiViews: setupLayers.explicit.useMultiViews } : {}),
                ...(setupLayers.explicit.disableDeviceInputs !== undefined ? { disableDeviceInputs: setupLayers.explicit.disableDeviceInputs } : {}),
                disableCameraTransform,
                ...joinRoomParams,
                invisiblePlugins,
                cursorAdapter: useMultiViews ? undefined : joiningCursor,
                cameraBound: convertBound(cameraBound),
            }, (parameters, remote) => {
                const effectiveMultiViews = !!parameters.useMultiViews;
                const plugins = parameters.invisiblePlugins || [];
                return {
                    ...parameters,
                    invisiblePlugins: effectiveMultiViews && !plugins.includes(WindowManager as any)
                        ? [...plugins, WindowManager as any] : plugins,
                    cursorAdapter: effectiveMultiViews ? undefined : joiningCursor,
                    disableMagixEventDispatchLimit: joinRoomParams.disableMagixEventDispatchLimit !== undefined || remote?.disableMagixEventDispatchLimit !== undefined
                        ? parameters.disableMagixEventDispatchLimit : effectiveMultiViews,
                };
            }), {...roomCallbackHandler, ...new SDKCallbackHandler(true)});
            acquiredRoom = aRoom;
            task.object = aRoom;
            disposers.push(() => {
                if (!aRoom.useMultiViews) aRoom.bindHtmlElement(null);
                if (window.room === aRoom) window.room = undefined;
                if (room === aRoom) room = undefined;
            });
            if (task.cancelled) throw new Error("Cancelled");
            room = aRoom;
            let roomState = aRoom.state;
            if (aRoom.useMultiViews) {
                const effectiveWindowParams = resolveNativeConfiguration(windowParams || {}, aRoom.dynamicConfig?.windowManager);
                const fullscreen = (effectiveWindowParams as any).fullscreen;
                const previousFullscreen = window.fullScreen;
                window.fullScreen = fullscreen;
                let fullscreenStyle: HTMLStyleElement | undefined;
                disposers.push(() => {
                    fullscreenStyle?.remove();
                    if (room === aRoom) window.fullScreen = previousFullscreen;
                });
                if (fullscreen) {
                    fullscreenStyle = document.createElement("style");
                    fullscreenStyle.textContent = `
                        .telebox-titlebar, .telebox-max-titlebar-maximized,.netless-app-slide-footer, .telebox-footer-wrap, .telebox-titlebar-wrap { display: none }
                    `;
                    document.body.appendChild(fullscreenStyle);
                }
                const manager = await mountWindowManager(aRoom, roomCallbackHandler, windowParams, setup, task);
                disposers.push(() => {
                    try { manager.destroy(); }
                    finally { if (window.manager === manager) window.manager = undefined; }
                });
                if (task.cancelled) throw new Error("Cancelled");
                roomState = { ...roomState, ...{ windowBoxState: manager.boxState, cameraState: manager.cameraState, sceneState: manager.sceneState, pageState: manager.pageState, appState: createAppState() } };
                if (fullscreen) manager.setMaximized(true);
                if (setup.enableAppliancePlugin) {
                    if (WindowManager.supportAppliancePlugin === false) throw new Error("Appliance Plugin requires supportAppliancePlugin=true");
                    const applianceWorkerUrls = getApplianceWorkerUrls();
                    const appliancePluginExtras = mergeDefaultAppliancePluginExtras(
                        (appliancePluginOptions as any)?.extras,
                        { backgroundImageLoadOptions: setup.backgroundImageLoadOptions },
                    );
                    const roomLogger = (aRoom as unknown as { logger?: { info(message: string): void; error(message: string): void } }).logger;
                    roomLogger?.info("[Bridge] ApplianceMultiPlugin.getInstance start");
                    const plugin = await ApplianceMultiPlugin.getInstance(manager, {
                        options: {
                            cdn: { fullWorkerUrl: applianceWorkerUrls.fullWorkerUrl, subWorkerUrl: applianceWorkerUrls.subWorkerUrl },
                            ...appliancePluginOptions,
                            extras: appliancePluginExtras,
                        },
                        callbacks: { onBackgroundImageLoadEvent: event => inScope(task.scope, () => postBackgroundImageLoadEvent(event)), onInitLoadingChange: event => inScope(task.scope, () => postApplianceInitLoadingChange(event)) },
                    });
                    disposers.push(async () => {
                        try { await plugin.destroy(); }
                        finally { if (window.appliancePlugin === plugin) window.appliancePlugin = undefined; }
                    });
                    if (task.cancelled) throw new Error("Cancelled");
                    window.appliancePlugin = plugin;
                    roomLogger?.info("[Bridge] ApplianceMultiPlugin.getInstance success");
                }
            } else {
                aRoom.bindHtmlElement(divRef() as HTMLDivElement);
                joiningCursor?.setRoom(aRoom);
                roomState = { ...roomState, ...createPageState(roomState.sceneState) };
            }
            if (enableSyncedStore) {
                const store = await inScope(task.scope, () => initSyncedStore(aRoom));
                disposers.push(() => {
                    if (window.syncedStore === store) destroySyncedStore();
                    else store.destroy();
                });
            }
            if (task.cancelled) throw new Error("Cancelled");
            inScope(task.scope, () => registerBridgeRoom(aRoom));
            // Preserve the existing explicit Native camera-transform workaround.
            if (disableCameraTransform) aRoom.disableCameraTransform = disableCameraTransform;
            lifecycle.activate(task, JSON.stringify({ state: roomState, observerId: aRoom.observerId, isWritable: aRoom.isWritable }));
        } catch (error) {
            await lifecycle.finish(task, error);
        } finally {
            task.settle();
        }
    }

    replayRoom = async (nativeParams: ExtraNativeReplayParams, responseCallback: any) => {
        if (!sdk) { responseCallback(failure("SdkNotReady")); return; }
        let task: Task;
        try {
            if (!nativeParams.room || !nativeParams.roomToken) throw new Error("InvalidReplayParameters");
            task = lifecycle.begin("player", currentScope(), responseCallback);
        } catch (error) { responseCallback(failure(error.message)); return; }
        const {step = 500, cameraBound, mediaURL, windowParams, ...replayParams} = nativeParams;
        const setup = nativeConfig!;
        const {useMultiViews, enableSyncedStore} = setup;
        let replayCallbackHandler: ReplayerCallbackHandler;
        let mounting: Promise<void> | undefined;
        const phaseChangeHook = (displayer: Room, phase: PlayerPhase) => {
            lifecycle.phase(task, phase);
            if (task.cancelled || !useMultiViews || mounting || window.manager ||
                (phase !== PlayerPhase.Pause && phase !== PlayerPhase.Playing)) return;
            mounting = new Promise<void>(resolve => setTimeout(resolve, 0)).then(async () => {
                if (task.cancelled) return;
                const manager = await mountWindowManager(displayer, replayCallbackHandler, windowParams, setup, task);
                task.disposers.push(() => {
                    try { manager.destroy(); }
                    finally { if (window.manager === manager) window.manager = undefined; }
                });
            });
            // A mount starts after replayRoom resolves. Closing must also wait for this chain.
            task.initializations.push(mounting);
            mounting.catch(() => { lifecycle.leave(task.scope).catch(() => {}); });
        };
        replayCallbackHandler = new ReplayerCallbackHandlerImp(step, !!mediaURL, !!setup.enableIFramePlugin, phaseChangeHook, task);
        try {
            const mPlayer = await sdk.replayRoom({
                ...replayParams, cursorAdapter: useMultiViews ? undefined : cursorAdapter,
                cameraBound: convertBound(cameraBound),
                invisiblePlugins: useMultiViews ? [WindowManager as any] : [], useMultiViews,
            }, {...replayCallbackHandler, ...new SDKCallbackHandler(true)});
            task.object = mPlayer;
            task.disposers.push(() => {
                if (!useMultiViews) mPlayer.bindHtmlElement(null);
                if (window.player === mPlayer) { window.player = undefined; window.combinePlayer = undefined; }
                if (player === mPlayer) player = undefined;
            });
            if (task.cancelled) throw new Error("Cancelled");
            player = mPlayer;
            if (!useMultiViews) { mPlayer.bindHtmlElement(divRef() as HTMLDivElement); cursorAdapter?.setPlayer(mPlayer); }
            if (enableSyncedStore) {
                const store = await inScope(task.scope, () => initSyncedStore(mPlayer));
                task.disposers.push(() => { if (window.syncedStore === store) destroySyncedStore(); else store.destroy(); });
                if (task.cancelled) throw new Error("Cancelled");
            }
            let combinePlayer: ReturnType<CombinePlayerFactory["create"]> | undefined;
            if (mediaURL) {
                const videoDom = document.createElement("video");
                videoDom.setAttribute("x5-video-player-type", "h5-page");
                videoDom.setAttribute("playsInline", "");
                videoDom.setAttribute("style", "display:none;");
                videoDom.setAttribute("class", "video-js");
                document.body.appendChild(videoDom);
                task.disposers.push(() => { videoDom.pause(); videoDom.removeAttribute("src"); videoDom.load(); videoDom.remove(); });
                combinePlayer = new CombinePlayerFactory(mPlayer, {url: mediaURL, videoDOM: videoDom}).create();
            }
            inScope(task.scope, () => registerPlayerBridge(mPlayer, combinePlayer, lastSchedule, replayCallbackHandler));
            replayCallbackHandler.onPhaseChanged(mPlayer.phase);
            if (mounting) await mounting;
            if (task.cancelled) throw new Error("Cancelled");
            const {progressTime: scheduleTime, timeDuration, framesCount, beginTimestamp} = mPlayer;
            lifecycle.activate(task, JSON.stringify({timeInfo: {scheduleTime, timeDuration, framesCount, beginTimestamp}}));
        } catch (error) { await lifecycle.finish(task, error); }
        finally { task.settle(); }
    }

    isPlayable = (nativeReplayParams: NativeReplayParams, responseCallback: any) => {
        if (!sdk) {
            responseCallback(false);
            return;
        }

        const { step = 500, cameraBound, ...replayParams } = nativeReplayParams;
        sdk!.isPlayable({
            ...replayParams
        }).then((isPlayable) => {
            responseCallback(isPlayable);
        })
    }

    asyncInsertFontFaces = (fontFaces: any[], responseCallback: any) => {
        for (const f of fontFaces) {
            const fontWeight = f["font-weight"];
            const fontStyle = f["font-style"];
            const unicodeRange = f["unicode-range"];
            const description = JSON.parse(JSON.stringify({weight: fontWeight, style: fontStyle, unicodeRange}));
            const font = new FontFace(f["font-family"], f.src, description);
            // FIXME: responseCallback 只能调用一次，第二次再调用，就没有效果了
            font.load().then(fontFaces => {
                logger("asyncInsertFontFaces load font success", f);
                document.fonts.add(font);
                responseCallback({success: true, fontFace: f});
            }).catch(e => {
                logger("asyncInsertFontFaces load font failed", f);
                responseCallback({success: false, fontFace: f, error: e});
            })
        }
    }

    updateNativeFontFaceCSS = (fontFaces: any[]) => {
        let sheet = document.getElementById(nativeFontFaceCSS);
        if (!sheet) {
            sheet = document.createElement("style");
            sheet.id = nativeFontFaceCSS;
            document.body.appendChild(sheet);
        }
        const fontCss = fontFaces.map(v => {
            const css = Object.keys(v).reduce((p, c) => {
                const value: string = v[c];
                // 部分字段有空格，需要使用""包裹，但有"会导致 src 字段等出现问题，不能无脑包裹
                if (value.includes(" ")) {
                    return `${p}\n${c}: "${v[c]}";`;
                } else {
                    return `${p}\n${c}: ${v[c]};`;
                }
            }, "");
            return `@font-face {
                ${css}
            }`;
        })
        sheet.innerHTML = fontCss.join("\n");
    }

    updateNativeTextareaFont = (fonts: string[]) => {
        let sheet = document.getElementById(textareaCSSId);
        if (!sheet) {
            sheet = document.createElement("style");
            sheet.id = textareaCSSId;
            document.body.appendChild(sheet);
        }
        
        let fontNames = fonts.map(f => `"${f}"`).join(",");

        sheet!.innerHTML = `.netless-whiteboard textarea {
            font-family: ${fontNames}; 
        }`;
    }

    nativeLog = (logs: string[], responseCallback: any) => {
        responseCallback();
    }

    getLocalLogState = (responseCallback: any) => {
        const currentSdk = (window.sdk || sdk) as any;
        const getState = currentSdk?.getLocalLogState;

        if (typeof getState !== "function") {
            responseCallback(JSON.stringify({
                enabled: false,
                enabledUpload: false,
                isUploading: false,
                unavailableReason: "unsupported",
            }));
            return;
        }

        Promise.resolve(getState.call(currentSdk)).then(state => {
            responseCallback(JSON.stringify(toNativeLocalLogState(state)));
        }).catch((error: Error) => {
            responseCallback(JSON.stringify({ __error: toNativeError(error) }));
        });
    }

    collectLocalLogs = (responseCallback: any) => {
        const currentSdk = (window.sdk || sdk) as any;

        if (typeof currentSdk?.collectLocalLogs !== "function") {
            responseCallback(JSON.stringify({ __error: { message: "local log is unsupported" } }));
            return;
        }

        currentSdk.collectLocalLogs().then((result: any) => {
            responseCallback(JSON.stringify(toNativeLocalLogExportResult(result)));
        }).catch((error: Error) => {
            responseCallback(JSON.stringify({ __error: toNativeError(error) }));
        });
    }

    flushLocalLogs = (responseCallback: any) => {
        const currentSdk = (window.sdk || sdk) as any;

        if (typeof currentSdk?.flushLocalLogs !== "function") {
            responseCallback(JSON.stringify({ __error: { message: "local log is unsupported" } }));
            return;
        }

        currentSdk.flushLocalLogs().then(() => {
            responseCallback(JSON.stringify({ success: true }));
        }).catch((error: Error) => {
            responseCallback(JSON.stringify({ __error: toNativeError(error) }));
        });
    }

    uploadLocalLogs = (params: { roomUuid?: string; userUuid?: string; trigger?: string } | any, responseCallback?: any) => {
        if (typeof params === "function") {
            responseCallback = params;
            params = {};
        }

        const callback = responseCallback || (() => undefined);
        const { roomUuid, userUuid, trigger = "manual" } = params || {};
        const currentRoom = (window.room || room) as any;
        const currentSdk = (window.sdk || sdk) as any;

        let upload: Promise<any> | undefined;

        if (typeof currentRoom?.uploadLocalLogs === "function") {
            upload = currentRoom.uploadLocalLogs();
        } else if (typeof currentSdk?.uploadLocalLogs === "function") {
            upload = currentSdk.uploadLocalLogs({ roomUuid, userUuid, trigger });
        }

        if (!upload) {
            callback(JSON.stringify({ status: "skipped", reason: "unsupported" }));
            return;
        }

        upload.then((result: any) => {
            callback(JSON.stringify(toNativeLocalLogResult(result)));
        }).catch((error: Error) => {
            callback(JSON.stringify({
                status: "failure",
                stage: "callback",
                error: toNativeError(error),
            }));
        });
    }

    setParameters = (params: any) => {
        if (Boolean(params.effectMixingForMediaPlayer)) {
            window.__mediaPlayerAudioEffectClient = new RtcAudioEffectClient("mediaPlayer");
        }
    }

    registerApp = (para: AppRegisterParams, responseCallback: any) => {
        logger("registerApp", getRegisterAppLogParams(para));

        if (para.javascriptString) {
            let variable = para.variable!;
            let src = Function(`
                    ${para.javascriptString};
                    if (typeof ${variable} == "undefined") {
                        return undefined; 
                    } else {
                        return ${variable};
                    } 
                    `)();
            if (!src) {
                responseCallback(JSON.stringify({ __error: { message: "variable does not exist" } }));
                return;
            } else {
                WindowManager.register({
                    kind: para.kind,
                    src: src,
                    appOptions: para.appOptions
                }).then(() => responseCallback());
            }
        } else if (para.url) {
            WindowManager.register({
                kind: para.kind,
                src: para.url,
                appOptions: para.appOptions
            }).then(() => responseCallback());
        }
    }

    prepareWhiteConnection = (params: PrepareParams, responseCallback: any) => {
        const {appId, region, expire} = params;
        const expireMS = expire || 12 * 3600 * 1000;
        prepare(appId, region as any, expireMS).then(() => {
            responseCallback();
        }).catch((e: Error) => {
            responseCallback(JSON.stringify({__error: {message: e.message, jsStack: e.stack}}));
        });
    }
}
