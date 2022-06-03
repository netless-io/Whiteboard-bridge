import dsBridge from "dsbridge";
import { ObserverMode, Player, PlayerCallbacks, PlayerPhase, PlayerSeekingResult, PlayerState, Room } from "white-web-sdk";
import { registerDisplayerBridge } from "./DisplayerBridge";
import { CombinePlayer, PublicCombinedStatus } from "@netless/combine-player";
import { ReplayerCallbackHandler } from "./ReplayerCallbackHandler";
import { addBridgeLogHook } from "../utils/Funs";
import { logger } from "../utils/Logger";

const playerNameSpace = "player";
const playerStateNameSpace = "player.state";

export function registerPlayerBridge(aPlayer: Player,
    aCombinePlayer: CombinePlayer | undefined,
    lastSchedule: { time: number },
    callbackHandler: ReplayerCallbackHandler): void {

    window.player = aPlayer;
    window.combinePlayer = aCombinePlayer;
    registerDisplayerBridge(aPlayer);

    dsBridge.registerAsyn(playerNameSpace, new PlayerAsyncBridge(aPlayer, aCombinePlayer));
    dsBridge.register(playerStateNameSpace, new PlayerStateBridge(aPlayer, aCombinePlayer));
    addBridgeLogHook([playerNameSpace, playerStateNameSpace], logger);

    if (aCombinePlayer) {
        aCombinePlayer.setOnStatusChange((status, message) => {
            lastSchedule.time = 0;

            switch (status) {
                case PublicCombinedStatus.Pause: {
                    callbackHandler.onPhaseChanged(PlayerPhase.Pause);
                    break;
                }
                case PublicCombinedStatus.PauseBuffering:
                case PublicCombinedStatus.PauseSeeking:
                case PublicCombinedStatus.PlayingBuffering:
                case PublicCombinedStatus.PlayingSeeking: {
                    callbackHandler.onPhaseChanged(PlayerPhase.Buffering);
                    break;
                }
                case PublicCombinedStatus.Ended: {
                    callbackHandler.onPhaseChanged(PlayerPhase.Ended);
                    break;
                }
                case PublicCombinedStatus.Playing: {
                    callbackHandler.onPhaseChanged(PlayerPhase.Playing);
                    break;
                }
                case PublicCombinedStatus.Disabled: {
                    callbackHandler.onStoppedWithError(new Error(message));
                    break;
                }
                default: {
                    break;
                }
            }
        });
    }
}

export class PlayerStateBridge {
    constructor(readonly player: Player, readonly combinePlayer: CombinePlayer | undefined) { }
    roomUUID = () => {
        return this.player.roomUUID;
    }

    phase = () => {
        return this.player.phase;
    }

    playerState = () => {
        // 如果没有加载第一帧，会直接报错
        try {
            let state = this.player.state;
            if (window.manager) {
                state = { ...state, ...{ windowBoxState: window.manager.boxState }, cameraState: window.manager.cameraState, sceneState: window.manager.sceneState };
            }
            return state;
        } catch (error) {
            return {};
        }
    }

    isPlayable = () => {
        return this.player.isPlayable;
    }

    playbackSpeed = () => {
        if (this.combinePlayer) {
            return this.combinePlayer.playbackRate;
        }
        return this.player.playbackSpeed;
    }

    timeInfo = () => {
        const { progressTime, timeDuration, framesCount, beginTimestamp } = this.player;
        const info = { scheduleTime: progressTime, timeDuration, framesCount, beginTimestamp };
        return info;
    }
}

export class PlayerAsyncBridge {
    constructor(readonly player: Player, readonly combinePlayer: CombinePlayer | undefined) { }
    play = () => {
        if (this.combinePlayer) {
            this.combinePlayer.play();
        } else {
            this.player.play();
        }
    }

    pause = () => {
        if (this.combinePlayer) {
            this.combinePlayer.pause();
        } else {
            this.player.pause();
        }
    }

    stop = () => {
        try {
            this.player.stop();
        } catch (error) {
            console.log("stop:", error.message);
        }
    }

    seekToScheduleTime = (beginTime: number, responseCallback?: any) => {
        if (this.combinePlayer) {
            this.combinePlayer.seek(beginTime);
            if (responseCallback) {
                setTimeout(() => {
                    responseCallback(PlayerSeekingResult.Success);
                }, 0);
            }
        } else {
            this.player.seekToProgressTime(beginTime).then(result=> {
                if (responseCallback) {
                    responseCallback(result);
                }
            });
        }
    }

    setObserverMode = (observerMode: string) => {
        this.player.setObserverMode(observerMode as ObserverMode);
    }

    setPlaybackSpeed = (rate: number) => {
        if (this.combinePlayer) {
            this.combinePlayer.playbackRate = rate;
        } else {
            this.player.playbackSpeed = rate;
        }
    }
}