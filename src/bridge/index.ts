
import dsbridge from "dsbridge";
import {RNBridge} from "@netless/webview-bridge";

let bridge: any;
if ((window as any).ReactNativeWebView) {
	bridge = RNBridge;
}
window.bridge = bridge;

export function call(
    handlerName: string,
    args?: any,
    responseCallback?: (retValue: any) => void
): any {
	if (bridge) {
		bridge.call(handlerName, args, responseCallback);
		return;
	}
    return dsbridge.call(handlerName, args, responseCallback);
}

export function register(
    handlerName: string,
    handler: object | (() => any),
    async?: boolean
) {
	if (bridge) {
		bridge.register(handlerName, handler, async);
		return;
	}
    return dsbridge.register(handlerName, handler, async);
}

export function registerAsyn(handlerName: string, handler: object | (() => void)): void {
	if (bridge) {
		bridge.registerAsyn(handlerName, handler, true);
		return;
	}
    return dsbridge.registerAsyn(handlerName, handler);
}