import { call, register } from "./bridge";

export class Rtc {

    static kStartAudioMixing = 710;
    static kStopAudioMixing = 713;
    static kAudioError = 714;

    private startCallback?: (state: number, errorCode: number) => void;
    private stopCallback?: (state: number, errorCode: number) => void;

    public constructor() {
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
            }
        })
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

    public startAudioMixing = (filePath: string, loopback: boolean, replace: boolean, cycle: number, callback: (state: number, errorCode: number) => void) => {
        this.startCallback = callback;
        return call("rtc.startAudioMixing", {filePath, loopback, replace, cycle});
    }

    /**
    * callback?: (state: number, errorCode: number) => void
    */
    public stopAudioMixing = (callback: (state: number, errorCode: number) => void) => {
        this.stopCallback = callback;
        return call("rtc.stopAudioMixing");
    }

    public pauseAudioMixing() {
        return call("rtc.pauseAudioMixing");
    }

    public resumeAudioMixing() {
        return call("rtc.resumeAudioMixing");
    }

    public setAudioMixingPosition(pos) {
        return call("rtc.setAudioMixingPosition", pos);
    }
}