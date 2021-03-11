import { postCustomMessage } from './Funs';

export function hookCreateElement() {
    const f = document.createElement;
    if (f.toString().includes(`addEventListener("error"`)) {
        // 防止多次拦截，页面是纯净的，不会有其他拦截
        return;
    }
    console.log("interrept document.createElement success");
    document.createElement = function(tagName: string, options?: ElementCreationOptions): HTMLElement {
        const element = f.call(this, tagName, options); 
        if (element.nodeName === "IMG") {
            // TODO: 在适当的时机，移除监听事件
            element.addEventListener("error", imageError, {once: true});
        }
        return element;
    }
}

function imageError(this: HTMLElement, error: ErrorEvent) {
    const img: HTMLImageElement = this as HTMLImageElement;
    const payload = {error, message: error.message, src: img.currentSrc, customMessage: true, name: "imageLoadError"};
    postCustomMessage({data: payload});
}