import dsBridge from "dsbridge";
import {Player, ObserverMode} from "white-web-sdk";
import { registerDisplayer } from "../bridge/Displayer";
import {CombinePlayer} from "@netless/combine-player";
import { CombinePlayerStatus } from '@netless/combine-player/dist/StatusContant';

export function registerPlayer(player: Player, combinePlayer: CombinePlayer | undefined, logger: (funName: string, ...param: any[]) => void) {
    window.player = player;
    window.combinePlayer = combinePlayer;
    //FIXME:CombinePlayer 目前没有获取播放速率的接口
    let playbackRate = 1;
    registerDisplayer(player, logger);
    if (combinePlayer) {
        combinePlayer.setOnStatusChange((status, message) => {
            switch (status) {
                case CombinePlayerStatus.Pause:
                case CombinePlayerStatus.PauseBuffering:
                case CombinePlayerStatus.Disabled:
                case CombinePlayerStatus.Ended:
                case CombinePlayerStatus.Playing:
                case CombinePlayerStatus.PlayingBuffering:
                case CombinePlayerStatus.PlayingSeeking:
            }
        })
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
                playbackRate = rate;
                combinePlayer.playbackSpeed(rate);
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
                return playbackRate;
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