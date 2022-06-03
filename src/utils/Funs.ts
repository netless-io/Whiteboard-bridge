import { useEffect, useRef } from 'react';
import {Displayer, Room, Player, SceneState} from "white-web-sdk";
import { sdkCallbackHandler } from "../bridge/SDKBridge";

export function registerBridge(names: string[], logger: (funName: string, ...params: any[]) => void) {

    const async = window._dsaf;
    
    for (const value of Object.getOwnPropertyNames(async)) {
        if (value === "_obs") {
            const _obj = async[value];
            for (const name of Object.getOwnPropertyNames(_obj)) {
                if (names.includes(name)) {
                    const namespace = _obj[name];
                    for (const funName of Object.getOwnPropertyNames(namespace)) {
                        const fun = namespace[funName];
                        namespace[funName] = (...args: any[]) => {
                            logger(funName, ...args.slice(0, -1));
                            return fun(...args);
                        };
                    }
                }
            }
        }
    }

    const syn = window._dsf;
    for (const value of Object.getOwnPropertyNames(syn)) {
        if (value === "_obs") {
            const _obj = syn[value];
            for (const name of Object.getOwnPropertyNames(_obj)) {
                if (names.includes(name)) {
                    const namespace = _obj[name];
                    for (const funName of Object.getOwnPropertyNames(namespace)) {
                        const fun = namespace[funName];
                        namespace[funName] = (...args: any[]) => {
                            logger(funName, ...args);
                            return fun(...args);
                        };
                    }
                }
            }
        }
    }
}

export function isRoom(displayer: Displayer): displayer is Room {
    return (displayer as Player).roomUUID === undefined;
}

export function globalErrorEvent(e: ErrorEvent) {
    sdkCallbackHandler.onThrowError({message: e.message, error: e.error})
}

export function createPageState(sceneState: SceneState) {
    if (sceneState) {
        return { pageState: { index: sceneState.index, length: sceneState.scenes.length } };
    } else {
        return {};
    }
}

export function postCustomMessage(e: {data: any}) {
    const data = e.data;
    // 目前在 Android 端，默认所有的发送事件是 JSON 格式的，这里的字符串都需要能序列换成 JSONObject
    if (data.name === "pptImageLoadError") {
        sdkCallbackHandler.onPostMessage(JSON.stringify(data))
    }

    if (data.name === "iframe") {
        sdkCallbackHandler.onPostMessage(JSON.stringify(data))
    }

    if (data.shapeId && data.mediaType && data.action) {
        sdkCallbackHandler.onPostMessage(JSON.stringify(data))
    }

    // 自定义的口子，目前只有监听 image 的用了
    if (!!data.customMessage) {
        sdkCallbackHandler.onPostMessage(JSON.stringify(data))
    }
}

export function usePrevious<T>(value: T) {
    const ref = useRef<T>();
    useEffect(() => {
      ref.current = value;
    });
    return ref.current;
}