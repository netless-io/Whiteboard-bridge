export function postIframeMessage(payload: {eventName: string, params?: any[]}, logger?: (funName: string, ...param: any[]) => void) {
    const message = {name: "parentWindow", payload: payload};
    const iframes = document.getElementsByTagName("iframe");
    if (iframes.length > 0 && iframes[0].contentWindow) {
        const iframe = iframes[0];
        logger?.("postmessage", message);
        iframe.contentWindow!.postMessage(message, "*");
    } else if (iframes.length == 0) {
        logger?.("postmessage", "no frames exist");
    } else {
        logger?.("postmessage", "no conentWindow");
    }
}