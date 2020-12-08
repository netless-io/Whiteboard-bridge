import dsBridge from "dsbridge";
import { useEffect, useRef } from 'react';
import {Displayer, Room, Player} from "white-web-sdk";

function throwMesssage(message: any) {
    console.log(JSON.stringify(message));
    dsBridge.call("sdk.throwError", message);
}

export function isRoom(displayer: Displayer): displayer is Room {
    return (displayer as Player).roomUUID === undefined;
}

export function globalErrorEvent(e: ErrorEvent) {
    throwMesssage({message: e.message, error: e.error});
}

export function postCustomMessage(e: any) {
    const data: any = e.data;
    // 目前在 Android 端，默认所有的发送事件是 JSON 格式的。目前的确有这个保证，以后新增通道需要注意。
    if (data.name === "pptImageLoadError") {
        dsBridge.call("sdk.postMessage", JSON.stringify(data));
    }

    if (data.name === "iframe") {
        dsBridge.call("sdk.postMessage", JSON.stringify(data));
    }

    if (data.shapeId && data.mediaType && data.action) {
        dsBridge.call("sdk.postMessage", JSON.stringify(data));
    }
}

export function usePrevious<T>(value: T) {
    const ref = useRef<T>();
    useEffect(() => {
      ref.current = value;
    });
    return ref.current;
}