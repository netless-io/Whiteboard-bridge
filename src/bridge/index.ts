
import dsbridge from "dsbridge";
import {RNBridge, Bridge} from "@netless/webview-bridge";

let bridge: Bridge;
if ((window as any).ReactNativeWebView) {
	bridge = RNBridge;
	window.bridge = bridge;
}

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
		bridge.register(handlerName, handler);
		return;
	}
    return dsbridge.register(handlerName, handler, async);
}

export function registerAsyn(handlerName: string, handler: object | (() => void)): void {
	if (bridge) {
		bridge.registerAsyn(handlerName, handler);
		return;
	}
    return dsbridge.registerAsyn(handlerName, handler);
}