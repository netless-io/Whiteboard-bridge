import { currentScope, documentId, failure, inScope, lifecycle, Scope, sameScope } from "./Lifecycle";

import type {JsonValue, CallFunction, SyncCallFunction, AsyncCallFunction} from "@netless/webview-bridge";
import {RNBridge, bridge } from "@netless/webview-bridge";

let rnBridge: RNBridge;
if ((window as any).ReactNativeWebView) {
	rnBridge = new RNBridge();
	window.bridge = rnBridge;
} else {
	window.bridge = bridge;
}



export const call: CallFunction = (nativeMethod: string, parameter?: JsonValue) => {
    parameter = eventValue(nativeMethod, parameter) as JsonValue;
	if (rnBridge) {
		rnBridge.call(nativeMethod, parameter);
	} else {
		bridge.call(nativeMethod, parameter);
	}
}

export const asyncCall: AsyncCallFunction = (nativeMethod: string, parameter?: JsonValue) => {
    parameter = eventValue(nativeMethod, parameter) as JsonValue;
	if (rnBridge) {
		// TODO react-native 暂时没做异步调用
		return Promise.resolve(parameter);
	} else {
		return bridge.asyncCall(nativeMethod, parameter);
	}
}

export const syncCall: SyncCallFunction = (nativeMethod: string, parameter?: JsonValue) => {
    parameter = eventValue(nativeMethod, parameter) as JsonValue;
	if (rnBridge) {
		// react-native 暂时没做同步调用
		return parameter;
	} else {
        // Preserve the synchronous return and the same {data: ...} wire shape as async events.
        const args = JSON.stringify({data: parameter === undefined ? null : parameter});
        const result = window._dsbridge ? window._dsbridge.call(nativeMethod, args) : window.prompt("_dsbridge=" + nativeMethod, args);
        return JSON.parse(result || "{}").data;
	}
}

export const register = (handlerName: string, handler: any) => {
    handler = scopedHandler(handlerName, handler);
	if (rnBridge) {
		rnBridge.register(handlerName, handler);
	} else {
		bridge.register(handlerName, handler);
	}
}

export const registerAsyn = (handlerName: string, handler: any) => {
    handler = scopedHandler(handlerName, handler);
	if (rnBridge) {
		rnBridge.registerAsyn(handlerName, handler);
	} else {
		bridge.registerAsync(handlerName, handler);
	}
}
function eventValue(method: string, value: any): any {
    if (!/^(sdk|room|player|store)\./.test(method)) return value;
    return { scope: currentScope() || { documentId, generation: 0 }, value };
}
/** Capture event provenance when installing a callback, including its later async invocations. */
export function scopedCall(scope = currentScope()): CallFunction {
    return (method, value) => inScope(scope, () => call(method, value));
}
export function scopedHandler(namespace: string, handler: any): any {
    const source = namespace === "sdk" ? undefined : currentScope();
    const result: any = {};
    for (const key of Object.keys(handler)) {
        if (key === "call" || typeof handler[key] !== "function") continue;
        result[key] = (...input: any[]) => {
            const marker = input[0]?.__whiteScope;
            if (marker) input.shift();
            const scope: Scope | undefined = marker || source;
            const callback = typeof input[input.length - 1] === "function" ? input.pop() : undefined;
            const reply = callback && ((value: any) => callback({ scope: scope || { documentId, generation: 0 }, value }));
            const isCreate = namespace === "sdk" && (key === "joinRoom" || key === "replayRoom");
            const isLeave = namespace === "sdk" && key === "leaveRoom";
            const roomSdkMethod = namespace === "sdk" && (key === "hasBackgroundImage" || key === "reloadBackgroundImage");
            const isClose = key === "disconnect" || key === "stop";
            if ((source && (!sameScope(source, scope) || !lifecycle.accepts(scope, isClose))) ||
                (scope && scope.documentId !== documentId) || (roomSdkMethod && !lifecycle.accepts(scope))) {
                if (reply) reply(failure("StaleScope"));
                return failure("StaleScope");
            }
            try {
                const value = inScope(scope, () => handler[key](...input, ...(reply ? [reply] : [])));
                return reply ? value : {scope: scope || {documentId, generation: 0}, value};
            } catch (error) {
                if (reply) reply(failure(error.message));
                else if (isCreate || isLeave) throw error;
                return failure(error.message);
            }
        };
    }
    return result;
}
lifecycle.onState = (scope, state) => inScope(scope, () => call("sdk.lifecycleState", { state }));

(window as any).__whiteRunScoped = (scope: Scope, fn: () => any) => lifecycle.accepts(scope) ? inScope(scope, fn) : failure("StaleScope");
