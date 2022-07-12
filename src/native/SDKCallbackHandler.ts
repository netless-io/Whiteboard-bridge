import { MediaType } from "white-web-sdk";
import { call, syncCall } from "../bridge"

export class SDKCallbackHandler {
    onPostMessage = (message: string) => {
        call("sdk.postMessage", message);
    }

    onThrowError = (message: any)=> {
        call("sdk.throwError", message);
    }

    onLogger = (args: any) => {
        call("sdk.logger", args);
    }

    onUrlInterrupter = (url: string): string => {
        return syncCall("sdk.urlInterrupter", url) as string;
    }

    onSetupFail = (e: Error) => {
        call("sdk.setupFail", {message: e.message, jsStack: e.stack});
    }

    onPPTLoadProgress = (uuid: string, progress: number) => {
        // 不推荐用户使用这种预加载，native 端使用 zip 包的形式
    }

    onPPTMediaPlay = (shapeId: string, type: MediaType) => {
        console.log('onPPTMediaPlay');
        call("sdk.onPPTMediaPlay", {shapeId, type});
    }
    
    onPPTMediaPause = (shapeId: string, type: MediaType) => {
        call("sdk.onPPTMediaPause", {shapeId, type});
    }
}