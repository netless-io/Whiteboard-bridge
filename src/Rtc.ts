import { RTCClient, RtcEventEmitter } from "@netless/slide-rtc-plugin";
import { asyncCall, call, register } from "./bridge";
import { EventEmitter } from "events";

export class Rtc
    extends (EventEmitter as new () => RtcEventEmitter)
    implements RTCClient
{
    static kStartAudioMixing = 710;
    static kStopAudioMixing = 713;
    static kAudioError = 714;

    private startCallback?: (state: number, errorCode: number) => void;
    private stopCallback?: (state: number, errorCode: number) => void;

    public constructor() {
        super();
        register("rtc", {
            callback: (state: number, errorCode: number) => {
                switch (state) {
                    case Rtc.kStopAudioMixing:
                        {
                            if (this.stopCallback) {
                                this.stopCallback(state, errorCode);
                            }
                        }
                        break;
                    case Rtc.kStartAudioMixing:
                        {
                            if (this.startCallback) {
                                this.startCallback(state, errorCode);
                            }
                        }
                        break;
                    default:
                        {
                            if (this.startCallback) {
                                this.startCallback(state, errorCode);
                            } else if (this.stopCallback) {
                                this.stopCallback(state, errorCode);
                            }
                        }
                        break;
                }
            },
            setEffectFinished: (soundId: number) => {
                this.emit("effectFinished", soundId);
            },
        });
    }

    /**
     * (filePath: string, loopback: boolean, replace: boolean, cycle: number, callback?: (state: number, errorCode: number) => void) => number;
     * callback: native 收到回调事件，需要用户注册监听，在接到回调后调用该方法
     * state:
     *  710: 成功调用 startAudioMixing 或 resumeAudioMixing
     *  711: 成功调用 pauseAudioMixing
     *  713: 成功调用 stopAudioMixing
     *  714: 播放失败，error code 会有具体原因
     */

    public startAudioMixing = (
        filePath: string,
        loopback: boolean,
        replace: boolean,
        cycle: number,
        callback?: (state: number, errorCode: number) => void
    ): number => {
        this.startCallback = callback;
        call("rtc.startAudioMixing", { filePath, loopback, replace, cycle });
        return 0;
    };

    /**
     * callback?: (state: number, errorCode: number) => void
     */
    public stopAudioMixing = (
        callback?: (state: number, errorCode: number) => void
    ): number => {
        this.stopCallback = callback;
        call("rtc.stopAudioMixing");
        return 0;
    };

    public pauseAudioMixing(): number {
        call("rtc.pauseAudioMixing");
        return 0;
    }

    public resumeAudioMixing(): number {
        call("rtc.resumeAudioMixing");
        return 0;
    }

    public setAudioMixingPosition(pos): number {
        call("rtc.setAudioMixingPosition", pos);
        return 0;
    }

    public getEffectsVolume(): Promise<number> {
        return asyncCall("rtc.getEffectsVolume") as Promise<number>;
    }

    public setEffectsVolume(volume: number): Promise<number> {
        return asyncCall("rtc.setEffectsVolume", volume) as Promise<number>;
    }

    public setVolumeOfEffect(soundId: number, volume: number): Promise<number> {
        return asyncCall("rtc.setVolumeOfEffect", {
            soundId,
            volume,
        }) as Promise<number>;
    }

    public playEffect(
        soundId: number,
        filePath: string,
        loopCount: number,
        pitch: number,
        pan: number,
        gain: number,
        publish: boolean,
        startPos: number
    ): Promise<number> {
        return asyncCall("rtc.playEffect", {
            soundId,
            filePath,
            loopCount,
            pitch,
            pan,
            gain,
            publish,
            startPos,
        }) as Promise<number>;
    }

    public stopEffect(soundId: number): Promise<number> {
        return asyncCall("rtc.stopEffect", soundId) as Promise<number>;
    }

    public stopAllEffects(): Promise<number> {
        return asyncCall("rtc.stopAllEffects") as Promise<number>;
    }

    public preloadEffect(
        soundId: number,
        filePath: string,
        startPos: number
    ): Promise<number> {
        return asyncCall("rtc.preloadEffect", {
            soundId,
            filePath,
            startPos,
        }) as Promise<number>;
    }

    public unloadEffect(soundId: number): Promise<number> {
        return asyncCall("rtc.unloadEffect", soundId) as Promise<number>;
    }

    public pauseEffect(soundId: number): Promise<number> {
        return asyncCall("rtc.pauseEffect", soundId) as Promise<number>;
    }

    public pauseAllEffects(): Promise<number> {
        return asyncCall("rtc.pauseAllEffects") as Promise<number>;
    }

    public resumeEffect(soundId: number): Promise<number> {
        return asyncCall("rtc.resumeEffect", soundId) as Promise<number>;
    }

    public resumeAllEffects(): Promise<number> {
        return asyncCall("rtc.resumeAllEffects") as Promise<number>;
    }

    public getEffectDuration(soundId: number): Promise<number> {
        return asyncCall("rtc.getEffectDuration", soundId) as Promise<number>;
    }

    public setEffectPosition(soundId: number, pos: number): Promise<number> {
        return asyncCall("rtc.setEffectPosition", {
            soundId,
            pos,
        }) as Promise<number>;
    }

    public getEffectCurrentPosition(soundId: number): Promise<number> {
        return asyncCall(
            "rtc.getEffectCurrentPosition",
            soundId
        ) as Promise<number>;
    }
}
