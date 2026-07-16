import "@netless/canvas-polyfill";
import "whatwg-fetch";
import { ResizeObserver  } from "@juggle/resize-observer";

// workaround for iOS below 13.3
if (!window.ResizeObserver) {
    window.ResizeObserver = ResizeObserver;
}

if (!window.globalThis) {
    (window as any).globalThis = window;
}

if (!(window as any).global) {
    (window as any).global = window;
}

if (!(window as any).process) {
    (window as any).process = { env: {} };
} else if (!(window as any).process.env) {
    (window as any).process.env = {};
}
