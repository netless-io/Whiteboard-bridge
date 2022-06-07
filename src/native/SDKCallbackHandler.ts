import { MediaType } from "white-web-sdk";
import dsBridge from "dsbridge";

export class SDKCallbackHandler {
    onPostMessage = (message: string) => {
        dsBridge.call("sdk.postMessage", message);
    }

    onThrowError = (message: any)=> {
        dsBridge.call("sdk.throwError", message);
    }

    onLogger = (args: any) => {
        dsBridge.call("sdk.logger", args);
    }

    onUrlInterrupter = (url: string): string => {
        return dsBridge.call("sdk.urlInterrupter", url);
    }

    onSetupFail = (e: Error) => {
        dsBridge.call("sdk.setupFail", {message: e.message, jsStack: e.stack});
    }

    onPPTLoadProgress = (uuid: string, progress: number) => {
        // 不推荐用户使用这种预加载，native 端使用 zip 包的形式
    }

    onPPTMediaPlay = (shapeId: string, type: MediaType) => {
        console.log('onPPTMediaPlay');
        dsBridge.call("sdk.onPPTMediaPlay", {shapeId, type});
    }
    
    onPPTMediaPause = (shapeId: string, type: MediaType) => {
        dsBridge.call("sdk.onPPTMediaPause", {shapeId, type});
    }
}