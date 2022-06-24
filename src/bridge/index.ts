
import dsbridge from "dsbridge";
import {Bridge} from "@netless/webview-bridge";

let rnBridge: Bridge;
if ((window as any).ReactNativeWebView) {
	rnBridge = new Bridge();
	window.bridge = rnBridge;
}

export function call(
    handlerName: string,
    args?: any,
    responseCallback?: (retValue: any) => void
): any {
	if (rnBridge) {
		rnBridge.call(handlerName, args, responseCallback);
		return;
	}
    return dsbridge.call(handlerName, args, responseCallback);
}

export function register(
    handlerName: string,
    handler: object | (() => any),
    async?: boolean
) {
	if (rnBridge) {
		rnBridge.register(handlerName, handler);
		return;
	}
    return dsbridge.register(handlerName, handler, async);
}

export function registerAsyn(handlerName: string, handler: object | (() => void)): void {
	if (rnBridge) {
		rnBridge.registerAsyn(handlerName, handler);
		return;
	}
    return dsbridge.registerAsyn(handlerName, handler);
}