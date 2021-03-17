import "@netless/canvas-polyfill";
import React, { useEffect, useRef } from 'react';
import dsBridge from "dsbridge";
import {IframeBridge, IframeWrapper} from "@netless/iframe-bridge";
import {WhiteWebSdk, RoomPhase, Room, Player, createPlugins, setAsyncModuleLoadMode, AsyncModuleLoadMode, MediaType, PlayerPhase} from "white-web-sdk";
import {NativeSDKConfig, NativeJoinRoomParams, NativeReplayParams} from "./utils/ParamTypes";
import {registerPlayer, registerRoom, Rtc} from "./bridge";
import {videoPlugin} from "@netless/white-video-plugin";
import {audioPlugin} from "@netless/white-audio-plugin";
import multipleDomain from "./utils/MultipleDomain";
import {convertBound} from "./utils/BoundConvert";
import {globalErrorEvent, postCustomMessage} from "./utils/Funs";
import {CursorTool} from "@netless/cursor-tool";
import CombinePlayerFactory from "@netless/combine-player";
import "./App.css";
import { hookCreateElement } from './utils/ImgError';
import { postIframeMessage } from './utils/iFrame';

let showLog = false;
const lastSchedule = {
    time: 0,
};
let nativeConfig: NativeSDKConfig | undefined = undefined;
let sdk: WhiteWebSdk | undefined = undefined;
let cursorAdapter: CursorTool | undefined = undefined;

let appIdentifier = "";
let testRoomUUID = "";
let testRoomToken = "";
let rtcClient = new Rtc();

const textareaCSSId = "whiteboard-native-css"
const nativeFontFaceCSS = "whiteboard-native-font-face";

export default function App() {
    // state hook
    let room: Room | undefined = undefined;
    let player: Player | undefined = undefined;

    // private fun
    function logger(funName: string, ...params: any[]) {
        if (showLog) {
            console.log(JSON.stringify({funName, params: {...params}}));
            dsBridge.call("sdk.logger", {funName, params: {...params}});
        }
    }

    function removeBind() {
        if (room) {
            room.bindHtmlElement(null);
            // FIXME:最好执行 disconnect，但是由于如果主动执行 disconnect，会触发状态变化回调，导致一定问题，所以此处不能主动执行。
        }
        if (player) {
            player.bindHtmlElement(null);
        }
    }

    function testRoom() {
        showLog = true;
        nativeConfig = {log: true, userCursor: true, __platform: "ios", appIdentifier};
        newWhiteSdk(nativeConfig);
        joinRoom({uuid: testRoomUUID, roomToken: testRoomToken, userPayload: {
            avatar: "https://white-pan.oss-cn-shanghai.aliyuncs.com/40/image/mask.jpg"
        }}, () => {});
    }

    function testReplay() {
        showLog = true;
        nativeConfig = {log: true, userCursor: true, __platform: "ios", appIdentifier};
        newWhiteSdk(nativeConfig);
        replayRoom({room: testRoomUUID, roomToken: testRoomToken}, () => {});
    }

    window.testRoom = testRoom;
    window.testReplay = testReplay;

    function limitScheduleCallback(fn: any, timestamp: number, step: number) {
        if (timestamp >= lastSchedule.time) {
            fn();
            lastSchedule.time = Math.ceil(timestamp / step) * step;
        } else if (player && timestamp + step > player.timeDuration) {
            fn();
            lastSchedule.time = timestamp;
        }
    }

    // sdk bridge API
    function newWhiteSdk(config: NativeSDKConfig) {
        const urlInterrupter = config.enableInterrupterAPI ? (url: string) => {
            const modifyUrl: string = dsBridge.call("sdk.urlInterrupter", url);
            if (modifyUrl.length > 0) {
                return modifyUrl;
            }
            return url;
        } : undefined;

        const {log, __nativeTags, __platform, initializeOriginsStates, userCursor, enableInterrupterAPI, routeBackup, enableRtcIntercept, enableImgErrorCallback, enableIFramePlugin, ...restConfig} = config;

        showLog = !!log;
        nativeConfig = config;

        logger("newWhiteSdk", config);

        if (__platform) {
            window.__platform = __platform;
        }

        if (enableImgErrorCallback) {
            hookCreateElement();
        }
        
        cursorAdapter = !!userCursor ? new CursorTool() : undefined;

        if (__nativeTags) {
            window.__nativeTags = {...window.__nativeTags, ...__nativeTags};
        }

        if (routeBackup) {
            multipleDomain();
        }

        const pptParams = restConfig.pptParams || {};
        if (enableRtcIntercept) {
            (pptParams as any).rtcClient = rtcClient;
        }

        const plugins = createPlugins({"video": videoPlugin, "audio": audioPlugin});
        try {
            sdk = new WhiteWebSdk({
                ...restConfig,
                invisiblePlugins: enableIFramePlugin ? [IframeBridge as any] : undefined,
                wrappedComponents: enableIFramePlugin ? [IframeWrapper] : undefined,
                plugins: plugins,
                urlInterrupter: urlInterrupter,
                onWhiteSetupFailed: e => {
                    logger("onWhiteSetupFailed",  e);
                    dsBridge.call("sdk.setupFail", {message: e.message, jsStack: e.stack});
                },
                pptParams,
            });
            window.sdk = sdk;
        } catch (e) {
            logger("onWhiteSetupFailed", e);
            dsBridge.call("sdk.setupFail", {message: e.message, jsStack: e.stack});
        }
    }

    function joinRoom(nativeParams: NativeJoinRoomParams, responseCallback: any) {
        if (!sdk) {
            responseCallback(JSON.stringify({__error: {message: "sdk init failed"}}));
            return;
        }
        removeBind();
        logger("joinRoom", nativeParams);
        const {timeout = 45000, cameraBound, ...joinRoomParms} = nativeParams;
        sdk!.joinRoom({
            ...joinRoomParms,
            cursorAdapter,
            disableAutoResize: true,
            cameraBound: convertBound(cameraBound),
        }, {
            onPhaseChanged: (phase) => roomPhaseChange(phase, timeout),
            onRoomStateChanged,
            onDisconnectWithError,
            onKickedWithReason,
            onCatchErrorWhenAppendFrame,
            onCatchErrorWhenRender,
            onCanRedoStepsUpdate,
            onCanUndoStepsUpdate,
            onPPTLoadProgress,
            onPPTMediaPlay,
            onPPTMediaPause,
        }).then(mRoom => {
            removeBind();
            room = mRoom;
            mRoom.bindHtmlElement(divRef.current);
            registerRoom(mRoom, logger);
            if (!!cursorAdapter) {
                cursorAdapter.setRoom(room);
            }
            return responseCallback(JSON.stringify({state: mRoom.state, observerId: mRoom.observerId, isWritable: mRoom.isWritable}));
        }).catch((e: Error) => {
            return responseCallback(JSON.stringify({__error: {message: e.message, jsStack: e.stack}}));
        });
    }

    function replayRoom(nativeReplayParams: NativeReplayParams, responseCallback: any) {

        if (!sdk) {
            responseCallback(JSON.stringify({__error: {message: "sdk init failed"}}));
            return;
        }

        const {step = 500, cameraBound, mediaURL, ...replayParams} = nativeReplayParams;
        removeBind();
        logger("replayRoom", nativeReplayParams);

        sdk!.replayRoom({
            ...replayParams,
            cursorAdapter: cursorAdapter,
            disableAutoResize: true,
            cameraBound: convertBound(cameraBound),
        }, {
            onPhaseChanged: onPlayerPhaseChanged(!!mediaURL),
            onLoadFirstFrame,
            onPlayerStateChanged,
            onStoppedWithError,
            onProgressTimeChanged: (scheduleTime) => onProgressTimeChanged(scheduleTime, step),
            onCatchErrorWhenAppendFrame,
            onCatchErrorWhenRender,
            onPPTLoadProgress,
            onPPTMediaPlay,
            onPPTMediaPause,
        }).then(mPlayer => {
            removeBind();
            player = mPlayer;
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
                registerPlayer(mPlayer, combinePlayer, lastSchedule, logger);
            } else {
                registerPlayer(mPlayer, undefined, lastSchedule, logger);
            }
            mPlayer.bindHtmlElement(divRef.current);
            if (!!cursorAdapter) {
                cursorAdapter?.setPlayer(player);
            }
            const {scheduleTime, timeDuration, framesCount, beginTimestamp} = mPlayer;
            return responseCallback(JSON.stringify({timeInfo: {scheduleTime, timeDuration, framesCount, beginTimestamp}}));
        }).catch((e: Error) => {
            return responseCallback(JSON.stringify({__error: {message: e.message, jsStack: e.stack}}));
        });
    }

    function isPlayable(nativeReplayParams: NativeReplayParams, responseCallback: any) {
        if (!sdk) {
            responseCallback(false);
            return;
        }

        const {step = 500, cameraBound, ...replayParams} = nativeReplayParams;
        sdk!.isPlayable({
            ...replayParams
        }).then((isPlayable) => {
            responseCallback(isPlayable);
        })
    }

    // sdk api
    const asyncInsertFontFaces = (fontFaces: any[], responseCallback: any) => {
        logger("aysncInsertFontFaces", fontFaces);
        for (const f of fontFaces) {
            const fontWeight = f["font-weight"];
            const fontStyle = f["font-style"];
            const unicodeRange = f["unicode-range"];
            const description = JSON.parse(JSON.stringify({weight: fontWeight, style: fontStyle, unicodeRange}));
            const font = new FontFace(f["font-family"], f.src, description);
            font.load().then(fontFaces => {
                logger("aysncInsertFontFaces load font success", JSON.stringify(f));
                document.fonts.add(font);
                responseCallback({success: true, fontFace: f});
            }).catch(e => {
                logger("aysncInsertFontFaces load font failed", JSON.stringify(f));
                responseCallback({success: false, fontFace: f, error: e});
            })
        }
    }

    const updateNativeFontFaceCSS = (fontFaces: any[]) => {
        logger("insertFontFaces", fontFaces);
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

    const updateNativeTextareaFont = (fonts: string[]) => {
        logger("updateTextFont", fonts);
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

    // RoomCallbacks
    function roomPhaseChange(phase, timeout) {
        dsBridge.call("room.firePhaseChanged", phase);
        setTimeout(() => {
            if (room && room.phase === RoomPhase.Reconnecting) {
                room.disconnect().then(() => {
                    dsBridge.call("room.fireDisconnectWithError", `Reconnect time exceeds ${timeout} milsceonds, sdk call disconnect automatically`);
                });
            }
        }, timeout);
    }

    function onCanUndoStepsUpdate(canUndoSteps: number) {
        dsBridge.call("room.fireCanUndoStepsUpdate", canUndoSteps);
    }

    function onCanRedoStepsUpdate(canRedoSteps: number) {
        dsBridge.call("room.fireCanRedoStepsUpdate", canRedoSteps);
    }
    
    function onRoomStateChanged(modifyState) {
        dsBridge.call("room.fireRoomStateChanged", JSON.stringify(modifyState));
    }

    function onDisconnectWithError(error) {
        dsBridge.call("room.fireDisconnectWithError", error.message);
    }

    function onKickedWithReason(reason: string) {
        dsBridge.call("room.fireKickedWithReason", reason);
    }

    // PlayerCallbacks
    function onPlayerPhaseChanged(hasMediaURL: boolean): (phase: PlayerPhase) => void {
        return (phase: PlayerPhase): void => {
            const handle = (phase: PlayerPhase) => {
                lastSchedule.time = 0;
                logger("onPhaseChanged:", phase);
                dsBridge.call("player.onPhaseChanged", phase);
                if (nativeConfig?.enableIFramePlugin) {
                    postIframeMessage({eventName: "onPhaseChanged", params: [phase]}, logger);
                }
            };

            // combine-player 没有 WaitingFirstFrame 和 Stopped 两个状态，这里根据原始 player 进行触发。
            // 其他状态，均由 combine-player 将内部混合的状态，进行映射触发
            if (hasMediaURL) {
                if (phase === PlayerPhase.WaitingFirstFrame || phase === PlayerPhase.Stopped) {
                    handle(phase);
                }
            } else {
                handle(phase);
            }
        };
    }

    function onLoadFirstFrame() {
        logger("onLoadFirstFrame");
        // playerState 在此时才可读。这个时候需要把完整的 playerState 传递给 native，保证：
        // 1. native 端同步 API 状态的完整性
        // 2. Android 目前 playState diff 的正确性。
        dsBridge.call("player.onPlayerStateChanged", JSON.stringify(player!.state));
        dsBridge.call("player.onLoadFirstFrame");
        if (nativeConfig?.enableIFramePlugin) {
            postIframeMessage({eventName: "onLoadFirstFrame", params: []}, logger);
        }
    }

    function onPlayerStateChanged(modifyState) {
        dsBridge.call("player.onPlayerStateChanged", JSON.stringify(modifyState));
        if (nativeConfig?.enableIFramePlugin) {
            postIframeMessage({eventName: "onPlayerStateChanged", params: [modifyState]}, logger);
        }
    }

    function onStoppedWithError(error) {
        dsBridge.call("player.onStoppedWithError", JSON.stringify({"error": error.message, jsStack: error.stack}));
        if (nativeConfig?.enableIFramePlugin) {
            postIframeMessage({eventName: "onStoppedWithError", params: [error]}, logger);
        }
    }

    function onProgressTimeChanged(scheduleTime, step) {
        limitScheduleCallback(() => {dsBridge.call("player.onScheduleTimeChanged", scheduleTime); }, scheduleTime, step);
        if (nativeConfig?.enableIFramePlugin) {
            postIframeMessage({eventName: "onProgressTimeChanged", params: [scheduleTime]}, logger);
        }
    }

    // DisplayerCallbacks
    function onCatchErrorWhenAppendFrame(userId: number, error: Error) {
        logger("onCatchErrorWhenAppendFrame", [userId, error.message]);
        // TODO: 在初始化 room 过程中，就回调该方法的话，对于 room 的判断会存在问题
        if (room) {
            dsBridge.call("room.fireCatchErrorWhenAppendFrame", {userId: userId, error: error.message});
        } else {
            // dsBridge.call("player.fireCatchErrorWhenAppendFrame", {userId: userId, error: error.message});
        }
    }

    function onCatchErrorWhenRender(err: Error) {
        if (room) {
            // FIXME: native 端未添加
            // dsBridge.call("room.onCatchErrorWhenRender", {error: err.message});
        } else {
            dsBridge.call("player.onCatchErrorWhenRender", {error: err.message});
        }
    }

    function onPPTLoadProgress(uuid: string, progress: number) {
        // 不推荐用户使用这种预加载，native 端使用 zip 包的形式
    }

    function onPPTMediaPlay(shapeId: string, type: MediaType) {
        logger("onPPTMediaPlay", shapeId, type);
        dsBridge.call("sdk.onPPTMediaPlay", {shapeId, type});
    }
    
    function onPPTMediaPause(shapeId: string, type: MediaType) {
        logger("onPPTMediaPause", shapeId, type);
        dsBridge.call("sdk.onPPTMediaPause", {shapeId, type});
    }

    // effect hook
    useEffect(() => {
        return () => {
            window.removeEventListener("error", globalErrorEvent);
            window.removeEventListener("message", postCustomMessage);
        }
    }, []);

    setAsyncModuleLoadMode(AsyncModuleLoadMode.StoreAsBase64);
    window.addEventListener("error", globalErrorEvent);
    window.addEventListener("message", postCustomMessage);
    dsBridge.registerAsyn("sdk", {
        newWhiteSdk,
        joinRoom,
        replayRoom,
        isPlayable,
        asyncInsertFontFaces,
        updateNativeFontFaceCSS,
        updateNativeTextareaFont,
    });

    const divRef = useRef(null);

    const fullStyle: React.CSSProperties = {position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 1};
    return (
        <div id="whiteboard-container" ref={divRef} style={fullStyle}></div>
    )
}