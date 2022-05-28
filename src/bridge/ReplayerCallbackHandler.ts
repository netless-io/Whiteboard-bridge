import dsBridge from "dsbridge";
import { PlayerPhase, Room, PlayerState, MediaType } from "white-web-sdk";
import { postIframeMessage } from '../utils/iFrame';
import { logger } from "../utils/Logger";
import { NativeDisplayerState } from './DisplayerBridge';

export const lastSchedule = {
    time: 0,
};

let enableIFramePlugin: Boolean = false;
let step: number;

function limitScheduleCallback(fn: any, timestamp: number, step: number) {
    const player = window.player;
    if (player === undefined) {
        return;
    }
    if (timestamp >= lastSchedule.time) {
        fn();
        lastSchedule.time = Math.ceil(timestamp / step) * step;
    } else if (player && timestamp + step > player.timeDuration) {
        fn();
        lastSchedule.time = timestamp;
    }
}

type NativePlayerState = PlayerState & NativeDisplayerState;

export class ReplayerCallbackHandler {
    constructor(aStep: number, hasMedia: Boolean, isEnableIFramePlugin: boolean, phaseChangeHook: (player: Room, phase: PlayerPhase) => void) {
        enableIFramePlugin = isEnableIFramePlugin;
        step = aStep; 

        this.onPhaseChanged = (phase: PlayerPhase) => {
            const player = window.player;
            if (player === undefined) {
                return;
            }
            phaseChangeHook(player as unknown as Room, phase);

            const handle = (phase: PlayerPhase) => {
                lastSchedule.time = 0;
                dsBridge.call("player.onPhaseChanged", phase);
                if (enableIFramePlugin) {
                    postIframeMessage({ eventName: "onPhaseChanged", params: [phase] }, logger);
                }
            };
            // combine-player 没有 WaitingFirstFrame 和 Stopped 两个状态，这里根据原始 player 进行触发。
            // 其他状态，均由 combine-player 将内部混合的状态，进行映射触发
            if (hasMedia) {
                if (phase === PlayerPhase.WaitingFirstFrame || phase === PlayerPhase.Stopped) {
                    handle(phase);
                }
            } else {
                handle(phase);
            }
        }
    }

    onPhaseChanged = (phase: PlayerPhase) => { }

    onLoadFirstFrame = () =>  {
        // playerState 在此时才可读。这个时候需要把完整的 playerState 传递给 native，保证：
        // 1. native 端同步 API 状态的完整性
        // 2. Android 目前 playState diff 的正确性。
        dsBridge.call("player.onPlayerStateChanged", JSON.stringify(window.player!.state));
        dsBridge.call("player.onLoadFirstFrame");
        if (enableIFramePlugin) {
            postIframeMessage({eventName: "onLoadFirstFrame", params: []}, logger);
        }
        return;
    }

    onPlayerStateChanged = (modifyState: Partial<NativePlayerState>) => {
        if (window.manager && modifyState.sceneState) {
            return;
        }
        dsBridge.call("player.onPlayerStateChanged", JSON.stringify(modifyState));
        if (enableIFramePlugin) {
            postIframeMessage({eventName: "onPlayerStateChanged", params: [modifyState]}, logger);
        }
    }

    onStoppedWithError = (error) => {
        dsBridge.call("player.onStoppedWithError", JSON.stringify({"error": error.message, jsStack: error.stack}));
        if (enableIFramePlugin) {
            postIframeMessage({eventName: "onStoppedWithError", params: [error]}, logger);
        }
    }

    onProgressTimeChanged = (scheduleTime) => {
        limitScheduleCallback(() => {dsBridge.call("player.onScheduleTimeChanged", scheduleTime); }, scheduleTime, step);
        if (enableIFramePlugin) {
            postIframeMessage({eventName: "onProgressTimeChanged", params: [scheduleTime]}, logger);
        }
    }

    // DisplayerCallbacks
    onCatchErrorWhenAppendFrame = (userId: number, error: Error) => {
        // dsBridge.call("player.fireCatchErrorWhenAppendFrame", {userId: userId, error: error.message});
    }

    onCatchErrorWhenRender = (err: Error) => {
        dsBridge.call("player.onCatchErrorWhenRender", {error: err.message});
    }
}