import { MediaType } from "white-web-sdk";
import { call, syncCall, asyncCall, scopedCall} from "../bridge"

export class SDKCallbackHandler {
    private mediaCall = call;
    constructor(taskScoped = false) {
        if (taskScoped) this.mediaCall = scopedCall();
    }
    onPostMessage = (message: string) => {
        call("sdk.postMessage", message);
    }

    onThrowError = (message: any)=> {
        call("sdk.throwError", message);
    }

    onLogger = (args: any) => {
        call("sdk.logger", args);
    }

    onLocalLogStateChange = (state: any) => {
        call("sdk.localLogStateChange", state);
    }

    onUrlInterrupter = (url: string): string => {
        return syncCall("sdk.urlInterrupter", url) as string;
    }

    slideUrlInterrupter = (url: string) => {
        return asyncCall("sdk.slideUrlInterrupter", url) as Promise<string>;
    }

    slideOpenUrl = (url: string) => {
        return call("sdk.slideOpenUrl", url);
    }
    
    onSetupFail = (e: Error) => {
        call("sdk.setupFail", {message: e.message, jsStack: e.stack});
    }

    onSlideResourceMaxRetries = (url: string, error: Error) => {
        call("sdk.slideResourceMaxRetries", {url, message: error.message, jsStack: error.stack});
    }

    onPPTLoadProgress = (uuid: string, progress: number) => {
        // 不推荐用户使用这种预加载，native 端使用 zip 包的形式
    }

    onPPTMediaPlay = (shapeId: string, type: MediaType) => {
        console.log('onPPTMediaPlay');
        this.mediaCall("sdk.onPPTMediaPlay", {shapeId, type});
    }
    
    onPPTMediaPause = (shapeId: string, type: MediaType) => {
        this.mediaCall("sdk.onPPTMediaPause", {shapeId, type});
    }
}
