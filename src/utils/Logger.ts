import { sdkCallbackHandler } from '../bridge/SDK';

let reportLog = false;

export function enableReport(enable: boolean) { reportLog = enable; }

export function logger(funName: string, ...params: any[]) {
    console.log(funName, ...params);
    if (reportLog) {
        report(funName, ...params);
    }
}

let delayedLogs: string[][] = [];
function reportDelayedLog() {
    delayedLogs.forEach(log => {
        if (window.room) {
            (window.room as any).logger.info(...log);
        }
    })
    delayedLogs = [];
}

function report(funName: string, ...params: any[]) {
    // sdk 的 logger，会直接使用 toString 方法，进行转换。Object 的 toString 直接是 "[object Object]"，无法记录内容
    let message = params.map(v => {
        if (typeof v === "object") {
            if (v.hasOwnProperty('roomToken')) {
                v.roomToken = '***';
            }
            return JSON.stringify(v);
        }
        return v;
    });
    if (window.room) {
        (window.room as any).logger.info(funName, ...message);
        if (delayedLogs.length > 0) {
            reportDelayedLog();
        }
    } else {
        const logItem = [funName, ...message];
        delayedLogs.push(logItem);
    }

    let nativeMessage;
    if (params.length === 0) {
        nativeMessage = undefined;
    } else if (params.length === 1) {
        // array element
        nativeMessage = params[0];
    } else if (params.every(v => typeof v === "string" || typeof v === "number" || typeof v === "boolean")) {
        // string
        nativeMessage = params.join(" ");
    } else {
        // array
        nativeMessage = params;
    }

    sdkCallbackHandler.onLogger({ funName, params: nativeMessage });
}