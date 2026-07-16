import { hookCreateElement } from '../utils/ImgError';
import {CursorTool} from "@netless/cursor-tool";
import { registerAsyn } from '.';
import { NativeSDKConfig, NativeJoinRoomParams, NativeReplayParams, AppRegisterParams, NativeSlideAppOptions } from "@netless/whiteboard-bridge-types";
import {WhiteWebSdk, Room, Player, createPlugins, PlayerPhase, setAsyncModuleLoadMode, AsyncModuleLoadMode} from "white-web-sdk";
import {videoPlugin} from "@netless/white-video-plugin";
import {audioPlugin} from "@netless/white-audio-plugin";
import {videoPlugin2} from "@netless/white-video-plugin2";
import {audioPlugin2} from "@netless/white-audio-plugin2";
import {videoJsPlugin} from "@netless/video-js-plugin";
import SlideApp, { addHooks as addHooksSlide, usePlugin}  from "@netless/app-slide";
import { EffectPlugin, MixingPlugin } from '@netless/slide-rtc-plugin';
import { MountParams, WindowManager } from "@netless/window-manager";
import { SyncedStorePlugin } from "@netless/synced-store";
import {IframeBridge, IframeWrapper} from "@netless/iframe-bridge";
import {logger, enableReport} from "../utils/Logger";
import {convertBound} from "../utils/BoundConvert";
import { addManagerListener, createAppState } from "./Manager";
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
    presentationAppOptions?: NativePresentationAppOptions;
};

type NativeWindowParams = Omit<MountParams, "room" | "container"> & {
    /** Use per-window boxesStatus state management. Applies to joinRoom and replayRoom. */
    useBoxesStatus?: boolean;
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
    const localLog = nativeLocalLog?.enabled === false ?
        { enabled: false } :
        {
            enabled: true,
            ...nativeLocalLog,
            createWorker: createFoundationLogWorker,
        };

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

async function mountWindowManager(room: Room, handler: RoomCallbackHandler | ReplayerCallbackHandler, windowParams?: NativeWindowParams) {
    const { builtinAppOptions, ...restWindowParams } = windowParams || {};
    const presentation = builtinAppOptions?.presentation ?? nativeConfig?.presentationAppOptions;
    const manager = await WindowManager.mount({
        // 高比宽
        containerSizeRatio: 9/16,
        chessboard: true,
        cursor: !!cursorAdapter,
        supportAppliancePlugin: nativeConfig?.enableAppliancePlugin,
        ...restWindowParams,
        builtinAppOptions: toBuiltinAppOptions(
            presentation ? { presentation } : undefined
        ),
        container: divRef(),
        room,
    } as MountParams);
    addManagerListener(manager, logger, handler);
    return manager;
}

class SDKBridge {
    newWhiteSdk = (config: NativeSDKConfigWithPresentation) => {
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

        const { log, __nativeTags, __platform, __netlessUA, initializeOriginsStates, useMultiViews, userCursor, enableInterrupterAPI, routeBackup, enableRtcIntercept, enableRtcAudioEffectIntercept, enableSlideInterrupterAPI, enableImgErrorCallback, enableIFramePlugin, enableSyncedStore, enableAppliancePlugin, presentationAppOptions, ...restConfig } = config;
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

        const slideAppOptions = (config.slideAppOptions || {}) as NativeSlideAppOptions & {
            enableScale?: boolean;
        };
        const slideKind = "Slide";
        WindowManager.register({
            kind: slideKind,
            appOptions: {
                navigatorDelegate: {
                    openUrl: (url: string) => sdkCallbackHandler.slideOpenUrl(url),
                },
                urlInterrupter: slideUrlInterrupter,
                ...slideAppOptions,
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
        const useMobXState =  enableSyncedStore || enableIFramePlugin || useMultiViews
        const invisiblePlugins = [
            ...enableIFramePlugin ? [IframeBridge as any] : [],
            ...enableSyncedStore ? [SyncedStorePlugin as any] : [],
            ...enableAppliancePlugin ? [ApplianceMultiPlugin as any] : [],
        ];

        const wrappedComponents = [
            ...enableIFramePlugin ? [IframeWrapper] : [],
        ]

        try {
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
            bindLocalLogStateChange(sdk);
        } catch (e) {
            sdkCallbackHandler.onSetupFail(e);
        }
    };

    joinRoom = (nativeParams: NativeJoinRoomParams & ExtraNativeJoinRoomParams, responseCallback: any) => {
        if (!sdk) {
            responseCallback(JSON.stringify({__error: {message: "sdk init failed"}}));
            return;
        }
        removeBind();
        const {timeout = 45000, cameraBound, windowParams, disableCameraTransform, nativeWebSocket, appliancePluginOptions, ...joinRoomParams} = nativeParams;

        const {useMultiViews, enableSyncedStore} = nativeConfig!;
        const invisiblePlugins = [
            ...useMultiViews ? [WindowManager as any] : [],
        ]
        
        window.nativeWebSocket = nativeWebSocket;

        const roomCallbackHandler = new RoomCallbackHandler();

        sdk!.joinRoom({
            useMultiViews,
            disableCameraTransform,
            ...joinRoomParams,
            invisiblePlugins: invisiblePlugins,
            cursorAdapter: useMultiViews ? undefined : cursorAdapter,
            cameraBound: convertBound(cameraBound),
            disableMagixEventDispatchLimit: useMultiViews,
        }, {...roomCallbackHandler, ...sdkCallbackHandler}).then(async aRoom => {
            removeBind();
            room = aRoom;
            let roomState = room.state;

            /** native 端，把 sdk 初始化时的 useMultiViews 记录下来，再初始化 sdk 的时候，同步传递进来，避免用户写两遍 */
            if (useMultiViews) {
                try {
                    const fullscreen = windowParams && (windowParams as any).fullscreen;
                    window.fullScreen = fullscreen;
                    if (fullscreen) {
                        // css should be inject before mount
                        document.body.appendChild(document.createElement("style")).textContent = `
                            .telebox-titlebar, .telebox-max-titlebar-maximized,.netless-app-slide-footer, .telebox-footer-wrap, .telebox-titlebar-wrap { display: none }
                        `;
                    }
                    
                    const manager = await mountWindowManager(room, roomCallbackHandler, windowParams );    
                    roomState = { ...roomState, ...{ windowBoxState: manager.boxState }, cameraState: manager.cameraState, sceneState: manager.sceneState, ...{ pageState: manager.pageState, appState: createAppState()} };

                    if (fullscreen) {
                        manager.setMaximized(true);
                    }

                    if (nativeConfig?.enableAppliancePlugin) {
                        const applianceWorkerUrls = getApplianceWorkerUrls();
                        const plugin = await ApplianceMultiPlugin.getInstance(manager,
                            {
                                options: {
                                    cdn: {
                                        fullWorkerUrl: applianceWorkerUrls.fullWorkerUrl,
                                        subWorkerUrl: applianceWorkerUrls.subWorkerUrl,
                                    },
                                    ...appliancePluginOptions,
                                }
                            }
                        );
                        window.appliancePlugin = plugin;
                    }
                } catch (error) {
                    return responseCallback(JSON.stringify({__error: {message: error.message, jsStack: error.stack}}));
                }
            } else {
                room.bindHtmlElement(divRef() as HTMLDivElement);
                if (!!cursorAdapter) {
                    cursorAdapter.setRoom(room);
                }
                roomState = { ...roomState, ...createPageState(roomState.sceneState) };
            }

            if (enableSyncedStore) {
                await initSyncedStore(room)
            }
            registerBridgeRoom(room);
            // joinRoom 的 disableCameraTransform 参数不生效的 workaround。等 web-sdk 修复后，删除这里的代码。
            if (disableCameraTransform) {
                room.disableCameraTransform = disableCameraTransform;
            }
            return responseCallback(JSON.stringify({ state: roomState, observerId: room.observerId, isWritable: room.isWritable}));
        }).catch((e: Error) => {
            return responseCallback(JSON.stringify({__error: {message: e.message, jsStack: e.stack}}));
        });
    }

    replayRoom = (nativeParams: ExtraNativeReplayParams, responseCallback: any) => {
        // nativeReplayParams = nativeParams;
        if (!sdk) {
            responseCallback(JSON.stringify({__error: {message: "sdk init failed"}}));
            return;
        }

        const {step = 500, cameraBound, mediaURL, windowParams, ...replayParams} = nativeParams;
        removeBind();
        const {useMultiViews, enableSyncedStore} = nativeConfig!;

        let replayCallbackHanlder: ReplayerCallbackHandler;

        const phaseChangeHook = (player: Room, phase: PlayerPhase) => {
            if ((phase === PlayerPhase.Pause || phase === PlayerPhase.Playing) && !!nativeConfig?.useMultiViews && player.getInvisiblePlugin(WindowManager.kind) === null && !window.manager) {
                const room: Room = player! as unknown as Room;
                const { windowParams } = nativeParams!;
                // sdk 内部，先触发回调，才更新 invisiblePlugins，所以要带一个延迟，放到回调后执行
                setTimeout(() => {
                    mountWindowManager(room, replayCallbackHanlder, windowParams).catch(e => {
                        console.error("mount error", e);
                    })
                }, 0);
            }
        }
        replayCallbackHanlder = new ReplayerCallbackHandlerImp(step, !!mediaURL, !!(nativeConfig?.enableIFramePlugin), phaseChangeHook);

        const invisiblePlugins = [
            ...useMultiViews ? [WindowManager as any] : [],
        ]

        sdk!.replayRoom({
            ...replayParams,
            cursorAdapter: useMultiViews ? undefined : cursorAdapter,
            cameraBound: convertBound(cameraBound),
            invisiblePlugins: invisiblePlugins,
            useMultiViews
        }, {...replayCallbackHanlder, ...sdkCallbackHandler}).then(async mPlayer => {
            removeBind();
            player = mPlayer;
            // 多窗口需要调用 player 的 getInvisiblePlugin 方法，获取数据，而这些数据需要在 player 成功初始化，首次进入 play || pause 状态，才能获取到，所以回放时，多窗口需要异步
            if (!useMultiViews) {
                mPlayer.bindHtmlElement(divRef() as HTMLDivElement);
                if (!!cursorAdapter) {
                    cursorAdapter?.setPlayer(player);
                }
            }
            if (enableSyncedStore) {
                await initSyncedStore(player)
            }
            if (mediaURL) {
                // FIXME: 多次初始化，会造成一些问题
                const videoDom = document.createElement("video");
                videoDom.setAttribute("x5-video-player-type", "h5-page");
                videoDom.setAttribute("playsInline", "");
                videoDom.setAttribute("style", "display:none;");
                videoDom.setAttribute("class", "video-js");
                document.body.appendChild(videoDom);

                const combinePlayerFactory = new CombinePlayerFactory(player, {
                    url: mediaURL,
                    videoDOM: videoDom,
                });
                const combinePlayer = combinePlayerFactory.create();
                registerPlayerBridge(mPlayer, combinePlayer, lastSchedule, replayCallbackHanlder);
            } else {
                registerPlayerBridge(mPlayer, undefined, lastSchedule, replayCallbackHanlder);
            }
       
            const {progressTime: scheduleTime, timeDuration, framesCount, beginTimestamp} = mPlayer;
            return responseCallback(JSON.stringify({timeInfo: {scheduleTime, timeDuration, framesCount, beginTimestamp}}));
        }).catch((e: Error) => {
            return responseCallback(JSON.stringify({__error: {message: e.message, jsStack: e.stack}}));
        });
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
