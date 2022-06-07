import dsbridge from "dsbridge";

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
    return dsbridge.call(handlerName, args, responseCallback);
}

export function register(
    handlerName: string,
    handler: object | (() => any),
    async?: boolean
) {
    return dsbridge.register(handlerName, handler, async);
}

export function registerAsyn(handlerName: string, handler: object | (() => void)): void {
    return dsbridge.registerAsyn(handlerName, handler);
}