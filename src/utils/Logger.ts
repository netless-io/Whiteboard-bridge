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
export function reportDelayedLog() {
    delayedLogs.forEach(log => {
        if (window.room) {
            (window.room as any).logger.info(...log);
        }
    })
    delayedLogs = [];
}

function report(funName: string, ...params: any[]) {
    // sdk 的 logger，会直接使用 toString 方法，进行转换。Object 的 toString 直接是 "[object Object]"，无法记录内容
    params = params.map(v => {
        if (typeof v === "object") {
            if (v.hasOwnProperty('roomToken')) {
                v.roomToken = '***';
            }
            return JSON.stringify(v);
        }
        return v;
    });
    if (window.room) {
        (window.room as any).logger.info(funName, ...params);
        if (delayedLogs.length > 0) {
            reportDelayedLog();
        }
    } else {
        const logItem = [funName, ...params];
        delayedLogs.push(logItem);
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