import dsBridge from "dsbridge";
import { ObserverMode, Player, PlayerCallbacks, PlayerPhase, PlayerState, Room } from "white-web-sdk";
import { registerDisplayerBridge } from "./DisplayerBridge";
import { CombinePlayer, PublicCombinedStatus } from "@netless/combine-player";
import { ReplayerCallbackHandler } from "./ReplayerCallbackHandler";

export const playerNameSpace = "player";
export const playerStateNameSpace = "player.state";

export function registerPlayerBridge(aPlayer: Player,
    aCombinePlayer: CombinePlayer | undefined,
    lastSchedule: { time: number },
    callbackHandler: ReplayerCallbackHandler): void {

    window.player = aPlayer;
    window.combinePlayer = aCombinePlayer;
    registerDisplayerBridge(aPlayer);

    dsBridge.registerAsyn(playerNameSpace, new PlayerAsyncBridge(aPlayer, aCombinePlayer));
    dsBridge.register(playerStateNameSpace, new PlayerStateBridge(aPlayer, aCombinePlayer));

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
    roomUUID: () => string;
    phase: () => PlayerPhase;
    playerState: () => any;
    isPlayable: () => boolean;
    playbackSpeed: () => number;
    timeInfo: () => { scheduleTime: number, timeDuration: number, framesCount: number, beginTimestamp: number };

    constructor(player: Player, combinePlayer: CombinePlayer | undefined) {
        this.roomUUID = () => {
            return player.roomUUID;
        }

        this.phase = () => {
            return player.phase;
        }

        this.playerState = () => {
            // 如果没有加载第一帧，会直接报错
            try {
                let state = player.state;
                if (window.manager) {
                    state = { ...state, ...{ windowBoxState: window.manager.boxState }, cameraState: window.manager.cameraState, sceneState: window.manager.sceneState };
                }
                return state;
            } catch (error) {
                return {};
            }
        }

        this.isPlayable = () => {
            return player.isPlayable;
        }

        this.playbackSpeed = () => {
            if (combinePlayer) {
                return combinePlayer.playbackRate;
            }
            return player.playbackSpeed;
        }

        this.timeInfo = () => {
            const { progressTime, timeDuration, framesCount, beginTimestamp } = player;
            const info = { scheduleTime: progressTime, timeDuration, framesCount, beginTimestamp };
            return info;
        }
    }
}

export class PlayerAsyncBridge {
    play: () => void;
    pause: () => void;
    stop: () => void;
    seekToScheduleTime: (beginTime: number) => void;
    setObserverMode: (observerMode: string) => void;
    setPlaybackSpeed: (rate: number) => void;

    constructor(player: Player, combinePlayer: CombinePlayer | undefined) {
        this.play = () => {
            if (combinePlayer) {
                combinePlayer.play();
            } else {
                player.play();
            }
        }

        this.pause = () => {
            if (combinePlayer) {
                combinePlayer.pause();
            } else {
                player.pause();
            }
        }

        this.stop = () => {
            try {
                player.stop();
            } catch (error) {
                console.log("stop:", error.message);
            }
        }

        this.seekToScheduleTime = (beginTime: number) => {
            if (combinePlayer) {
                combinePlayer.seek(beginTime);
            } else {
                player.seekToProgressTime(beginTime);
            }
        }

        this.setObserverMode = (observerMode: string) => {
            player.setObserverMode(observerMode as ObserverMode);
        }

        this.setPlaybackSpeed = (rate: number) => {
            if (combinePlayer) {
                combinePlayer.playbackRate = rate;
            } else {
                player.playbackSpeed = rate;
            }
        }
    }
}