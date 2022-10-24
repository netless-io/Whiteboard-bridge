import "@netless/canvas-polyfill";
import "whatwg-fetch";
import { ResizeObserver  } from "@juggle/resize-observer";

// workaround for iOS below 13.3
if (!window.ResizeObserver) {
    window.ResizeObserver = ResizeObserver;
}

if (!window.globalThis) {
    (window as any).globalThis = window
}