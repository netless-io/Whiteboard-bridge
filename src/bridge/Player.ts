import dsBridge from "dsbridge";
import { ObserverMode, Player, PlayerCallbacks, PlayerPhase } from "white-web-sdk";
import { updateGlobalDisplayer } from "./Displayer";
import { CombinePlayer, PublicCombinedStatus } from "@netless/combine-player";
import { logger } from "../utils/Logger";
import { ReplayerCallbackHandler } from "./ReplayerCallbackHandler";

let player: Player;
let combinePlayer: CombinePlayer | undefined;

export function updateGlobalPlayer(aPlayer: Player,
    aCombinePlayer: CombinePlayer | undefined,
    lastSchedule: { time: number }, 
    callbackHandler: ReplayerCallbackHandler): void {

    player = aPlayer;
    combinePlayer = aCombinePlayer;
    window.player = aPlayer;
    window.combinePlayer = aCombinePlayer;
    updateGlobalDisplayer(player);

    if (combinePlayer) {
        combinePlayer.setOnStatusChange((status, message) => {
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

export class PlayerState {
    roomUUID() {
        return player.roomUUID;
    }

    phase() {
        logger("phase", player.phase);
        return player.phase;
    }

    playerState() {
        // 如果没有加载第一帧，会直接报错
        try {
            logger("playerState", player.state);
            let state = player.state;
            if (window.manager) {
                state = {...state, ...{ windowBoxState: window.manager.boxState }, cameraState: window.manager.cameraState, sceneState: window.manager.sceneState};
            }
            return state;
        } catch (error) {
            return {};
        }
    }

    isPlayable() {
        return player.isPlayable;
    }

    playbackSpeed() {
        if (combinePlayer) {
            return combinePlayer.playbackRate;
        }
        logger("playbackSpeed", player.playbackSpeed);
        return player.playbackSpeed;
    }

    timeInfo() {
        const {progressTime, timeDuration, framesCount, beginTimestamp} = player;
        const info = {scheduleTime: progressTime, timeDuration, framesCount, beginTimestamp};
        logger("timeInfo", info);
        return info;
    }
}

export class AsyncBridgePlayer {
    play() {
        logger("play");
        if (combinePlayer) {
            combinePlayer.play();
        } else {
            player.play();
        }
    }

    pause() {
        logger("pause");
        if (combinePlayer) {
            combinePlayer.pause();
        } else {
            player.pause();
        }
    }

    stop() {
        try {
            logger("stop");
            player.stop();
        } catch (error) {
            console.log("stop:", error.message);
        }
    }

    seekToScheduleTime(beginTime: number) {
        logger("seekToScheduleTime", beginTime);
        if (combinePlayer) {
            combinePlayer.seek(beginTime);
        } else {
            player.seekToProgressTime(beginTime);
        }
    }

    setObserverMode(observerMode: string) {
        logger("setObserverMode", observerMode);
        player.setObserverMode(observerMode as ObserverMode);
    }

    setPlaybackSpeed(rate: number) {
        logger("playbackSpeed", rate);
        if (combinePlayer) {
            combinePlayer.playbackRate = rate;
        } else {
            player.playbackSpeed = rate;
        }
    }
}