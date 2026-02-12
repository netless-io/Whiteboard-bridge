import { postCustomMessage } from './Funs';

const imgSrcMap = new WeakMap<HTMLImageElement, string>();
const imgObserverMap = new WeakMap<HTMLImageElement, MutationObserver>();
const imgRemovalObserverMap = new WeakMap<HTMLImageElement, MutationObserver>();

export function hookCreateElement() {
    const f = document.createElement;
    if (f.toString().includes(`addEventListener("error"`)) {
        // 防止多次拦截，页面是纯净的，不会有其他拦截
        console.log("[IMG DEBUG] document.createElement has been hooked, skip");
        return;
    }
    document.createElement = function(tagName: string, options?: ElementCreationOptions): HTMLElement {
        const element = f.call(this, tagName, options); 
        if (element.nodeName === "IMG") {
            console.log("[IMG DEBUG] img element created.", {src: (element as HTMLImageElement).currentSrc});
            const img = element as HTMLImageElement;
            imgSrcMap.set(img, ""); // 记录初始空src
            startImgSrcObserver(img);
            startImgRemovalObserver(img);
            
            element.addEventListener("error", imageError, {once: true});
            element.addEventListener("abort", () => {
                console.log("[IMG DEBUG] img element abort event", {src: img.currentSrc});
            });
            element.addEventListener("load", () => {
                console.log("[IMG DEBUG] img element load event", {src: img.currentSrc});
            });
        }
        return element;
    }
}

function startImgSrcObserver(img: HTMLImageElement) {
    if (imgObserverMap.has(img)) {
        return;
    }
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type !== "attributes" || mutation.attributeName !== "src") {
                continue;
            }
            const prevSrc = imgSrcMap.get(img) || "";
            const currentSrc = img.src;
            if (currentSrc && currentSrc !== prevSrc) {
                imgSrcMap.set(img, currentSrc);
                const payload = {src: currentSrc, customMessage: true, name: "imageLoadStart"};
                postCustomMessage({data: payload});
                console.log("[IMG DEBUG] img src changed, start loading:", {src: currentSrc});
            }
        }
    });
    observer.observe(img, {attributes: true, attributeFilter: ["src"]});
    imgObserverMap.set(img, observer);
}

function stopImgSrcObserver(img: HTMLImageElement) {
    const observer = imgObserverMap.get(img);
    if (observer) {
        observer.disconnect();
        imgObserverMap.delete(img);
    }
}

function startImgRemovalObserver(img: HTMLImageElement) {
    if (imgRemovalObserverMap.has(img)) {
        return;
    }
    const root = document.body || document.documentElement;
    if (!root) {
        return;
    }
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of Array.from(mutation.removedNodes)) {
                if (node === img || (node instanceof Element && node.contains(img))) {
                    stopImgSrcObserver(img);
                    stopImgRemovalObserver(img);
                    return;
                }
            }
        }
    });
    observer.observe(root, {childList: true, subtree: true});
    imgRemovalObserverMap.set(img, observer);
}

function stopImgRemovalObserver(img: HTMLImageElement) {
    const observer = imgRemovalObserverMap.get(img);
    if (observer) {
        console.log("[IMG DEBUG] img removal observer stopped", {src: img.currentSrc});
        observer.disconnect();
        imgRemovalObserverMap.delete(img);
    }
}

function imageError(this: HTMLElement, error: ErrorEvent) {
    const img: HTMLImageElement = this as HTMLImageElement;
    const payload = {error, message: error.message, src: img.currentSrc, customMessage: true, name: "imageLoadError"};
    postCustomMessage({data: payload});

    console.log("[IMG DEBUG] image load error captured:", payload);
}