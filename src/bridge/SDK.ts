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
import { PCMProxy } from '../PCMProxy';
const fullWorkerBlob = new Blob([fullWorkerString], { type: 'text/javascript' });
const fullWorkerUrl = URL.createObjectURL(fullWorkerBlob);
const subWorkerBlob = new Blob([subWorkerString], { type: 'text/javascript' });
const subWorkerUrl = URL.createObjectURL(subWorkerBlob);


let sdk: WhiteWebSdk | undefined = undefined;
let room: Room | undefined = undefined;
let player: Player | undefined = undefined;

let nativeConfig: NativeSDKConfig | undefined = undefined;
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

export function registerSDKBridge() {
    const sdk = new SDKBridge();
    registerAsyn(sdkNameSpace, sdk);
    (window as any).newWhiteSdk = sdk.newWhiteSdk;
    (window as any).joinRoom = sdk.joinRoom;
    (window as any).replayRoom = sdk.replayRoom;
    addBridgeLogHook([sdkNameSpace], logger);
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

async function mountWindowManager(room: Room, handler: RoomCallbackHandler | ReplayerCallbackHandler, windowParams?: Omit<Omit<MountParams, "room">, "container"> | undefined) {
    const manager = await WindowManager.mount({
        // 高比宽
        containerSizeRatio: 9/16,
        chessboard: true,
        cursor: !!cursorAdapter,
        supportAppliancePlugin: nativeConfig?.enableAppliancePlugin,
        ...windowParams,
        container: divRef(),
        room,
    });
    addManagerListener(manager, logger, handler);
    return manager;
}

class SDKBridge {
    newWhiteSdk = (config: NativeSDKConfig) => {
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

        const { log, __nativeTags, __platform, __netlessUA, initializeOriginsStates, useMultiViews, userCursor, enableInterrupterAPI, routeBackup, enableRtcIntercept, enableRtcAudioEffectIntercept, enableSlideInterrupterAPI, enableImgErrorCallback, enableIFramePlugin, enableSyncedStore, enableAppliancePlugin, ...restConfig } = config;
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
            plugins.setPluginContext(v.name, v.params);
        }
        window.plugins = plugins;

        const slideAppOptions = config.slideAppOptions || {} ;
        const slideKind = "Slide";
        WindowManager.register({
            kind: slideKind,
            appOptions: {
                navigatorDelegate: {
                    openUrl: (url: string) => sdkCallbackHandler.slideOpenUrl(url),
                },
                urlInterrupter: slideUrlInterrupter,
                ...slideAppOptions,
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
                ...restConfig,
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
        } catch (e) {
            sdkCallbackHandler.onSetupFail(e);
        }
    };

    joinRoom = (nativeParams: NativeJoinRoomParams, responseCallback: any) => {
        if (!sdk) {
            responseCallback(JSON.stringify({__error: {message: "sdk init failed"}}));
            return;
        }
        removeBind();
        const {timeout = 45000, cameraBound, windowParams, disableCameraTransform, nativeWebSocket, ...joinRoomParams} = nativeParams;
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
                        const plugin = await ApplianceMultiPlugin.getInstance(manager,
                            {
                                options: {
                                    cdn: {
                                        fullWorkerUrl,
                                        subWorkerUrl,
                                    }
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

    replayRoom = (nativeParams: NativeReplayParams, responseCallback: any) => {
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

    setParameters = (params: any) => {
        if (Boolean(params.effectMixingForMediaPlayer)) {
            window.__mediaPlayerAudioEffectClient = new RtcAudioEffectClient("mediaPlayer");
        }
    }

    registerApp = (para: AppRegisterParams, responseCallback: any) => {
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