import dsBridge from "dsbridge";
import {Player, ObserverMode} from "white-web-sdk";
import { DisplayerBridge } from "./Displayer";
export class PlayerBridge extends DisplayerBridge {

    public bindHtmlElement(element: HTMLDivElement | null): void {
        this.player.bindHtmlElement(element);
    }

    public stop = () => {
        try {
            this.logger("stop");
            this.player.stop();
        } catch (error) {
            console.log("stop:", error.message);
        }
    }

    public constructor(public readonly player: Player, protected readonly logger: (funName: string, ...param: any[]) => void) {
        super(player, logger);
        dsBridge.registerAsyn("player", {
            play: () => {
                this.logger("play");
                this.player.play();
            },
            pause: () => {
                this.logger("pause");
                this.player.pause();
            },
            stop: () => {
                this.logger("stop");
                this.player.stop();
            },
            seekToScheduleTime: (beginTime: number) => {
                this.logger("seekToScheduleTime", beginTime);
                this.player.seekToScheduleTime(beginTime);
            },
            setObserverMode: (observerMode: string) => {
                this.logger("setObserverMode", observerMode);
                this.player.setObserverMode(observerMode as ObserverMode);
            },
        });

        dsBridge.register("player.state", {
            roomUUID: () => {
                return this.player.roomUUID;
            },
            phase: () => {
                this.logger("phase", this.player.phase);
                return this.player.phase;
            },
            playerState: () => {
                // 如果没有加载第一帧，会直接报错
                try {
                    this.logger("playerState", this.player.state);
                    return this.player.state;
                } catch (error) {
                    return {};
                }
            },
            timeInfo: () => {
                const {scheduleTime, timeDuration, framesCount, beginTimestamp} = this.player;
                const info = {scheduleTime, timeDuration, framesCount, beginTimestamp};
                this.logger("timeInfo", info);
                return info;
            },
        });
    }
}