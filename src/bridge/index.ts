
import dsbridge from "dsbridge";


let bridge: any;
if (process.env.PLATFORM === "rn") {
	bridge = require("../react-native").default;
	console.log(bridge);
}
window.bridge = bridge;

interface bridge {
	call(
		handlerName: string,
		args?: any,
		responseCallback?: (retValue: any) => void
	): any;
	call<T, R>(
		handlerName: string,
		args?: T,
		responseCallback?: (retValue: R) => void
	): R;

	register(
		handlerName: string,
		handler: object | (() => any),
		async?: boolean
	): void;
	register<F>(handlerName: string, handler: F, async?: boolean): void;

	registerAsyn(handlerName: string, handler: object | (() => void)): void;
	registerAsyn<F>(handlerName: string, handler: F): void;

	hasNativeMethod(handlerName: string, type?: "all" | "asyn" | "syn"): boolean;
	disableJavascriptDialogBlock(disable?: boolean): void;
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
		bridge.register(handlerName, handler, async);
		return;
	}
    return dsbridge.register(handlerName, handler, async);
}

export function registerAsyn(handlerName: string, handler: object | (() => void)): void {
	if (bridge) {
		bridge.register(handlerName, handler, true);
		return;
	}
    return dsbridge.registerAsyn(handlerName, handler);
}