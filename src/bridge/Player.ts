import dsBridge from "dsbridge";
import {Player, ObserverMode} from "white-web-sdk";
import { registerDisplayer } from "../bridge/Displayer";

export function registerPlayer(player: Player, logger: (funName: string, ...param: any[]) => void) {
    window.player = player;
    registerDisplayer(player, logger);
    const stop = () => {
        try {
            logger("stop");
            player.stop();
        } catch (error) {
            console.log("stop:", error.message);
        }
    }

    dsBridge.registerAsyn("player", {
        play: () => {
            logger("play");
            player.play();
        },
        pause: () => {
            logger("pause");
            player.pause();
        },
        stop: () => {
            logger("stop");
            player.stop();
        },
        seekToScheduleTime: (beginTime: number) => {
            logger("seekToScheduleTime", beginTime);
            player.seekToScheduleTime(beginTime);
        },
        setObserverMode: (observerMode: string) => {
            logger("setObserverMode", observerMode);
            player.setObserverMode(observerMode as ObserverMode);
        },
        setPlaybackSpeed: (rate: number) => {
            logger("playbackSpeed", rate);
            player.playbackSpeed = rate;
        },
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
        playbackSpeed: () => {
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