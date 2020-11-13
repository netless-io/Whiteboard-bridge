import dsBridge from "dsbridge";
import { ObserverMode, Player, PlayerPhase } from "white-web-sdk";
import { registerDisplayer } from "./Displayer";
import { CombinePlayer, PublicCombinedStatus } from "@netless/combine-player";

export function registerPlayer(player: Player, combinePlayer: CombinePlayer | undefined, lastSchedule: { time: number }, logger: (funName: string, ...param: any[]) => void): void {
    window.player = player;
    window.combinePlayer = combinePlayer;
    registerDisplayer(player, logger);
    if (combinePlayer) {
        combinePlayer.setOnStatusChange((status, message) => {
            lastSchedule.time = 0;
            logger("onPhaseChanged:", status);

            switch (status) {
                case PublicCombinedStatus.Pause: {
                    dsBridge.call("player.onPhaseChanged", PlayerPhase.Pause);
                    break;
                }
                case PublicCombinedStatus.PauseBuffering:
                case PublicCombinedStatus.PauseSeeking:
                case PublicCombinedStatus.PlayingBuffering:
                case PublicCombinedStatus.PlayingSeeking: {
                    dsBridge.call("player.onPhaseChanged", PlayerPhase.Buffering);
                    break;
                }
                case PublicCombinedStatus.Ended: {
                    dsBridge.call("player.onPhaseChanged", PlayerPhase.Ended);
                    break;
                }
                case PublicCombinedStatus.Playing: {
                    dsBridge.call("player.onPhaseChanged", PlayerPhase.Playing);
                    break;
                }
                case PublicCombinedStatus.Disabled: {
                    dsBridge.call("player.onStoppedWithError", JSON.stringify({"error": message}));
                }
            }
        });
    }

    dsBridge.registerAsyn("player", {
        play: () => {
            logger("play");
            if (combinePlayer) {
                combinePlayer.play();
            } else {
                player.play();
            }
        },
        pause: () => {
            logger("pause");
            if (combinePlayer) {
                combinePlayer.pause();
            } else {
                player.pause();
            }
        },
        stop: () => {
            try {
                logger("stop");
                player.stop();
            } catch (error) {
                console.log("stop:", error.message);
            }
        },
        seekToScheduleTime: (beginTime: number) => {
            logger("seekToScheduleTime", beginTime);
            if (combinePlayer) {
                combinePlayer.seek(beginTime);
            } else {
                player.seekToScheduleTime(beginTime);
            }
        },
        setObserverMode: (observerMode: string) => {
            logger("setObserverMode", observerMode);
            player.setObserverMode(observerMode as ObserverMode);
        },
        setPlaybackSpeed: (rate: number) => {
            logger("playbackSpeed", rate);
            if (combinePlayer) {
                combinePlayer.playbackRate = rate;
            } else {
                player.playbackSpeed = rate;
            }
        }
    });

    dsBridge.register("player.state", {
        roomUUID: () => {
            return player.roomUUID;
        },
        phase: () => {
            logger("phase", player.phase);
            return player.phase;
        },
        playerState: () => {
            // 如果没有加载第一帧，会直接报错
            try {
                logger("playerState", player.state);
                return player.state;
            } catch (error) {
                return {};
            }
        },
        isPlayable: () => {
            return player.isPlayable;
        },
        playbackSpeed: () => {
            if (combinePlayer) {
                return combinePlayer.playbackRate;
            }
            logger("playbackSpeed", player.playbackSpeed);
            return player.playbackSpeed;
        },
        timeInfo: () => {
            const {scheduleTime, timeDuration, framesCount, beginTimestamp} = player;
            const info = {scheduleTime, timeDuration, framesCount, beginTimestamp};
            logger("timeInfo", info);
            return info;
        },
    });
}