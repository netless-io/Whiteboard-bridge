import "@netless/canvas-polyfill";
import React, { useEffect, useRef } from 'react';
import dsBridge from "dsbridge";
import {WhiteWebSdk, PlayerPhase, RoomPhase, Displayer, Room, Player, createPlugins, setAsyncModuleLoadMode, AsyncModuleLoadMode, MediaType} from "white-web-sdk";
import {NativeSDKConfig, NativeJoinRoomParams, NativeReplayParams} from "./utils/ParamTypes";
import {registerPlayer, registerRoom} from "./utils/Register";
import {videoPlugin} from "@netless/white-video-plugin";
import {audioPlugin} from "@netless/white-audio-plugin";
import multipleDomain from "./utils/MultipleDomain";
import {convertBound} from "./utils/BoundConvert";
import {globalErrorEvent, postCustomMessage} from "./utils/Funs";
import {UserCursor} from "@netless/cursor-adapter";
import "./App.css";

let showLog = false;
let lastScheduleTime = 0;
let nativeConfig: NativeSDKConfig | undefined = undefined;
let sdk: WhiteWebSdk | undefined = undefined;
let cursorAdapter: UserCursor | undefined = undefined;

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
        nativeConfig = {log: true, userCursor: true, __platform: "ios", appIdentifier: ""};
        newWhiteSdk(nativeConfig);
        joinRoom({uuid: "", roomToken: ""}, () => {});
    }

    function testReplay() {
        showLog = true;
        nativeConfig = {log: true, userCursor: true, __platform: "ios", appIdentifier: "792/uaYcRG0I7ctP9A"};
        newWhiteSdk(nativeConfig);
        replayRoom({room: "", roomToken: ""}, () => {});
    }

    window.testRoom = testRoom;
    window.testReplay = testReplay;

    function limitScheduleCallback(fn: any, timestamp: number, step: number) {
        if (timestamp >= lastScheduleTime) {
            fn();
            lastScheduleTime = Math.ceil(timestamp / step) * step;
        } else if (player && timestamp + step > player.timeDuration) {
            fn();
            lastScheduleTime = timestamp;
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

        const {log, __nativeTags, __platform, initializeOriginsStates, userCursor, enableInterrupterAPI, routeBackup, ...restConfig} = config;

        showLog = !!log;
        nativeConfig = config;

        logger("newWhiteSdk", config);

        if (__platform) {
            window.__platform = __platform;
        }
        
        cursorAdapter = !!userCursor ? new UserCursor() : undefined;

        if (__nativeTags) {
            window.__nativeTags = {...window.__nativeTags, ...__nativeTags};
        }

        if (routeBackup) {
            multipleDomain();
        }

        const plugins = createPlugins({"video": videoPlugin, "audio": audioPlugin});
        sdk = new WhiteWebSdk({
            ...restConfig,
            plugins: plugins,
            urlInterrupter: urlInterrupter,
        });
    }

    function joinRoom(nativeParams: NativeJoinRoomParams, responseCallback: any) {
        removeBind();
        logger("joinRoom", nativeParams);
        const {timeout = 45000, cameraBound, ...joinRoomParms} = nativeParams;
        sdk!.joinRoom({
            ...joinRoomParms,
            cursorAdapter,
            cameraBound: convertBound(cameraBound),
        }, {
            onPhaseChanged: (phase) => roomPhaseChange(phase, timeout),
            onRoomStateChanged,
            onDisconnectWithError,
            onKickedWithReason,
            onCatchErrorWhenAppendFrame,
            onCatchErrorWhenRender,
            onPPTLoadProgress,
            onPPTMediaPlay,
            onPPTMediaPause,
        }).then(mRoom => {
            removeBind();
            room = mRoom;
            mRoom.bindHtmlElement(divRef.current);
            registerRoom(mRoom, logger);
            if (mRoom.state.roomMembers && cursorAdapter) {
                cursorAdapter.setColorAndAppliance(mRoom.state.roomMembers);
            }
            return responseCallback(JSON.stringify({state: mRoom.state, observerId: mRoom.observerId, isWritable: mRoom.isWritable}));
        }).catch((e: Error) => {
            return responseCallback(JSON.stringify({__error: {message: e.message, jsStack: e.stack}}));
        });
    }

    function replayRoom(nativeReplayParams: NativeReplayParams, responseCallback: any) {

        const {step = 500, cameraBound, ...replayParams} = nativeReplayParams;
        removeBind();
        logger("replayRoom", nativeReplayParams);
        sdk!.replayRoom({
            ...replayParams,
            cursorAdapter: cursorAdapter,
            cameraBound: convertBound(cameraBound),
        }, {
            onPhaseChanged: onPlayerPhaseChanged,
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
            registerPlayer(mPlayer, logger)
            mPlayer.bindHtmlElement(divRef.current);
            const {scheduleTime, timeDuration, framesCount, beginTimestamp} = mPlayer;
            return responseCallback(JSON.stringify({timeInfo: {scheduleTime, timeDuration, framesCount, beginTimestamp}}));
        }).catch((e: Error) => {
            return responseCallback(JSON.stringify({__error: {message: e.message, jsStack: e.stack}}));
        });
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
    
    function onRoomStateChanged(modifyState) {
        if (modifyState.roomMembers && cursorAdapter) {
            cursorAdapter.setColorAndAppliance(modifyState.roomMembers);
        }
        dsBridge.call("room.fireRoomStateChanged", JSON.stringify(modifyState));
    }

    function onDisconnectWithError(error) {
        dsBridge.call("room.fireDisconnectWithError", error.message);
    }

    function onKickedWithReason(reason: string) {
        dsBridge.call("room.fireKickedWithReason", reason);
    }

    // PlayerCallbacks
    function onPlayerPhaseChanged(phase) {
        if (phase !== PlayerPhase.WaitingFirstFrame && cursorAdapter && player) {
            try {
                cursorAdapter.setColorAndAppliance(player.state.roomMembers);
            } catch (error) {
                console.warn(error);
            }
        }
        lastScheduleTime = 0;
        logger("onPhaseChanged:", phase);
        dsBridge.call("player.onPhaseChanged", phase);
    }

    function onLoadFirstFrame() {
        logger("onLoadFirstFrame");
        // playerState 在此时才可读。这个时候需要把完整的 playerState 传递给 native，保证：
        // 1. native 端同步 API 状态的完整性
        // 2. Android 目前 playState diff 的正确性。
        dsBridge.call("player.onPlayerStateChanged", JSON.stringify(player!.state));
        dsBridge.call("player.onLoadFirstFrame");
    }

    function onPlayerStateChanged(modifyState) {
        if (modifyState.roomMembers && cursorAdapter) {
            cursorAdapter.setColorAndAppliance(modifyState.roomMembers);
        }
        dsBridge.call("player.onPlayerStateChanged", JSON.stringify(modifyState));
    }

    function onStoppedWithError(error) {
        dsBridge.call("player.onStoppedWithError", JSON.stringify({"error": error.message, jsStack: error.stack}));
    }

    function onProgressTimeChanged(scheduleTime, step) {
        limitScheduleCallback(() => {dsBridge.call("player.onScheduleTimeChanged", scheduleTime); }, scheduleTime, step);
    }

    // DisplayerCallbacks
    function onCatchErrorWhenAppendFrame(userId: number, error: Error) {
        if (room) {
            dsBridge.call("room.fireCatchErrorWhenAppendFrame", {userId: userId, error: error.message});
        } else {
            dsBridge.call("player.fireCatchErrorWhenAppendFrame", {userId: userId, error: error.message});
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

    // TODO: 增加 ppt 回调
    function onPPTLoadProgress(uuid: string, progress: number) {

    }

    function onPPTMediaPlay(shapeId: string, type: MediaType) {

    }
    
    function onPPTMediaPause(shapeId: string, type: MediaType) {

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
    });

    const divRef = useRef(null);

    const fullStyle: React.CSSProperties = {position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 1};
    return (
        <div ref={divRef} style={fullStyle}></div>
    )
}