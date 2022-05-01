import dsBridge from 'dsbridge';
import { sdkCallbackHandler } from '../bridge/SDKBridge';

let showLog: boolean = false;

export function setShowLog(show: boolean) { showLog = show; }

export function logger(funName: string, ...params: any[]) {
    if (showLog) {
        report(funName, ...params);
    }
}

export function report(funName: string, ...params: any[]) {
    console.log(funName, ...params);

    if (window.room) {
        // sdk 的 logger，会直接使用 toString 方法，进行转换。Object 的 toString 直接是 "[object Object]"，无法记录内容
        params = params.map(v => {
            if (typeof v === "object") {
                return JSON.stringify(v);
            }
            return v;
        });
        (window.room as any).logger.info(funName, ...params);
    }
    let message;
    if (params.length === 0) {
        message = undefined;
    } else if (params.length === 1) {
        // array element
        message = params[0];
    } else if (params.every(v => typeof v === "string" || typeof v === "number" || typeof v === "boolean")) {
        // string
        message = params.join(" ");
    } else {
        // array
        message = params;
    }

    sdkCallbackHandler.onLogger({ funName, params: message });
}