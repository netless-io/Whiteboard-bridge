import { asyncCall, register } from "./bridge";
import { EventEmitter } from "events";
import { RTCEffectClient } from "@netless/slide-rtc-plugin";
import { logger } from "./utils/Logger";

class RTCAudioEffectCallbackBridge extends EventEmitter {
    static kAgoraAudioEffectStatePlaying = 810;
    static kAgoraAudioEffectStatePaused = 811;
    static kAgoraAudioEffectStateStopped = 813;
    static kAgoraAudioEffectStateFailed = 814;

    audioEffectCallback = (soundId: number, state: number) => {
        logger("audioEffectCallback", { soundId, state });
        switch (state) {
            case RTCAudioEffectCallbackBridge.kAgoraAudioEffectStatePlaying:
                this.emit("play", soundId);
                return;
            case RTCAudioEffectCallbackBridge.kAgoraAudioEffectStatePaused:
                this.emit("pause", soundId);
                return;
            case RTCAudioEffectCallbackBridge.kAgoraAudioEffectStateStopped:
                this.emit("pause", soundId);
                return;
            case RTCAudioEffectCallbackBridge.kAgoraAudioEffectStateFailed:
                this.emit("error", soundId);
                return;
        }
    }
    setEffectFinished = (soundId: number) => {
        logger("setEffectFinished", { soundId });
        this.emit("effectFinished", soundId);
    }
    effectDurationCallback = (filePath: string, duration: number) => {
        logger("effectDurationCallback", { filePath, duration });
        this.emit("duration", filePath, duration);
    }
}
let rtcAudioEffectCallbackBridge: RTCAudioEffectCallbackBridge | undefined;
export class RtcAudioEffectClient extends EventEmitter implements RTCEffectClient {
    identifier: string;
    public constructor(identifier: string) {
        super();
        this.identifier = identifier;
        this.addListener("error", (...args) => {
            console.log("audio effect client callback error", args);
        })
        if (!rtcAudioEffectCallbackBridge) { // initRtcAudioEffectCallbackBridge.
            rtcAudioEffectCallbackBridge = new RTCAudioEffectCallbackBridge();
            register("rtc", rtcAudioEffectCallbackBridge);
        }
        const shareBridge = rtcAudioEffectCallbackBridge as RTCAudioEffectCallbackBridge;
        shareBridge.on("play", (soundId: number) => {
            this.emit("play", soundId);
        });
        shareBridge.on("pause", (soundId: number) => {
            this.emit("pause", soundId);
        });
        shareBridge.on("error", (soundId: number) => {
            this.emit("error", soundId);
        });
        shareBridge.on("effectFinished", (soundId: number) => {
            this.emit("effectFinished", soundId);
        });
        shareBridge.on("duration", (filePath: string, duration: number) => {
            this.emit("duration", filePath, duration);
        });
    }

    public getEffectsVolume(): Promise<number> {
        logger("getEffectsVolume");
        return asyncCall("rtc.getEffectsVolume") as Promise<number>;
    }

    public setEffectsVolume(volume: number): Promise<number> {
        logger("setEffectsVolume", { volume });
        return asyncCall("rtc.setEffectsVolume", volume) as Promise<number>;
    }

    public setVolumeOfEffect(soundId: number, volume: number): Promise<number> {
        logger("setVolumeOfEffect", { soundId, volume });
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
        logger("playEffect", { soundId, filePath, loopCount, pitch, pan, gain, publish, startPos, identifier: this.identifier });
        return asyncCall("rtc.playEffect", {
            soundId,
            filePath,
            loopCount,
            pitch,
            pan,
            gain,
            publish,
            startPos,
            identifier: this.identifier
        }) as Promise<number>;
    }

    public stopEffect(soundId: number): Promise<number> {
        logger("stopEffect", { soundId });
        return asyncCall("rtc.stopEffect", soundId) as Promise<number>;
    }

    public stopAllEffects(): Promise<number> {
        logger("stopAllEffects");
        return asyncCall("rtc.stopAllEffects") as Promise<number>;
    }

    public preloadEffect(
        soundId: number,
        filePath: string,
        startPos: number
    ): Promise<number> {
        logger("preloadEffect", { soundId, filePath, startPos });
        return asyncCall("rtc.preloadEffect", {
            soundId,
            filePath,
            startPos,
        }) as Promise<number>;
    }

    public unloadEffect(soundId: number): Promise<number> {
        logger("unloadEffect", { soundId });
        return asyncCall("rtc.unloadEffect", soundId) as Promise<number>;
    }

    public pauseEffect(soundId: number): Promise<number> {
        logger("pauseEffect", { soundId });
        return asyncCall("rtc.pauseEffect", soundId) as Promise<number>;
    }

    public pauseAllEffects(): Promise<number> {
        logger("pauseAllEffects");
        return asyncCall("rtc.pauseAllEffects") as Promise<number>;
    }

    public resumeEffect(soundId: number): Promise<number> {
        logger("resumeEffect", { soundId });
        return asyncCall("rtc.resumeEffect", soundId) as Promise<number>;
    }

    public resumeAllEffects(): Promise<number> {
        logger("resumeAllEffects");
        return asyncCall("rtc.resumeAllEffects") as Promise<number>;
    }

    public getEffectDuration(url: string): Promise<number> {
        logger("getEffectDuration", { url });
        return asyncCall("rtc.getEffectDuration", url) as Promise<number>;
    }

    public setEffectPosition(soundId: number, pos: number): Promise<number> {
        logger("setEffectPosition", { soundId, pos });
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
