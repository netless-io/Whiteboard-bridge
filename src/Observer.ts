import { ResizeObserver  } from "@juggle/resize-observer";


// workaround for iOS below 13.3
if (!window.ResizeObserver) {
    window.ResizeObserver = ResizeObserver;
}