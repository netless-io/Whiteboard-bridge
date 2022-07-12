
import type {JsonValue, CallFunction, SyncCallFunction} from "@netless/webview-bridge";
import {RNBridge, bridge } from "@netless/webview-bridge";

let rnBridge: RNBridge;
if ((window as any).ReactNativeWebView) {
	rnBridge = new RNBridge();
	window.bridge = rnBridge;
}



export const call: CallFunction = (nativeMethod: string, parameter?: JsonValue) => {
	if (rnBridge) {
		rnBridge.call(nativeMethod, parameter);
	} else {
		bridge.call(nativeMethod, parameter);
	}
}

export const syncCall: SyncCallFunction = (nativeMethod: string, parameter?: JsonValue) => {
	if (rnBridge) {
		// react-native 暂时没做同步调用
		return parameter;
	} else {
		return bridge.syncCall(nativeMethod, parameter);
	}
}

export const register = (handlerName: string, handler: any) => {
	if (rnBridge) {
		rnBridge.register(handlerName, handler);
	} else {
		bridge.register(handlerName, handler);
	}
}

export const registerAsyn = (handlerName: string, handler: any) => {
	if (rnBridge) {
		rnBridge.registerAsyn(handlerName, handler);
	} else {
		bridge.registerAsync(handlerName, handler);
	}
}