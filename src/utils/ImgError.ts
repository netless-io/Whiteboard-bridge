import { postCustomMessage } from './Funs';

export function hookCreateElement() {
    const f = document.createElement;
    if (f.toString().includes(`addEventListener("error"`)) {
        // 防止多次拦截，页面是纯净的，不会有其他拦截
        return;
    }
    console.log("interrupt document.createElement success");
    document.createElement = function(tagName: string, options?: ElementCreationOptions): HTMLElement {
        const element = f.call(this, tagName, options); 
        if (element.nodeName === "IMG") {
            element.addEventListener("error", imageError, {once: true});
            element.addEventListener("unload", () => {
                // TODO: test me
                element.removeEventListener("error", imageError);
            });
        }
        return element;
    }
}

function imageError(this: HTMLElement, error: ErrorEvent) {
    const img: HTMLImageElement = this as HTMLImageElement;
    const payload = {error, message: error.message, src: img.currentSrc, customMessage: true, name: "imageLoadError"};
    postCustomMessage({data: payload});
}