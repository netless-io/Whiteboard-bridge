import dsBridge from "dsbridge";

export class Rtc {

    private mixCallback?: (state: number, errorCode: number) => void;

    public constructor() {
        dsBridge.register("rtc", {
            callback: (state: number, errorCode: number) => {
                if (this.mixCallback) {
                    this.mixCallback(state, errorCode);
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

    public startAudioMixing = (filePath: string, loopback: boolean, replace: boolean, cycle: number, callback?: (state: number, errorCode: number) => void) => {
        this.mixCallback = callback;
        return dsBridge.call("rtc.startAudioMixing", {filePath, loopback, replace, cycle});
    }

    /**
    * callback?: (state: number, errorCode: number) => void
    */
    public stopAudioMixing() {
        return dsBridge.call("rtc.stopAudioMixing");
    }

    public pauseAudioMixing() {
        return dsBridge.call("rtc.pauseAudioMixing");
    }

    public resumeAudioMixing() {
        return dsBridge.call("rtc.resumeAudioMixing");
    }

    public setAudioMixingPosition(pos) {
        return dsBridge.call("rtc.setAudioMixingPosition", pos);
    }
}