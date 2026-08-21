import assert from "assert";
import { WorkerRenderModeBlacklistLevel } from "@netless/appliance-plugin";

import { mergeDefaultAppliancePluginExtras } from "../src/bridge/AppliancePluginDefaults";
import {
    resolveSlidePerformanceDefaults,
    resolveSlidePerformanceOptions,
} from "../src/bridge/SlidePerformanceDefaults";

const defaultOptions = {
    minFPS: 25,
    maxFPS: 40,
    resolution: 1,
    maxResolutionLevel: 2,
};
const lowFrameRateOptions = {
    minFPS: 5,
    maxFPS: 15,
    resolution: 1,
    maxResolutionLevel: 2,
};

function iosUserAgent(version: string): string {
    return `Mozilla/5.0 (iPhone; CPU iPhone OS ${version} like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148`;
}

function androidWebViewUserAgent(chromeVersion: string): string {
    return `Mozilla/5.0 (Linux; Android 10; Device Build/QP1A; wv) AppleWebKit/537.36 Version/4.0 Chrome/${chromeVersion} Mobile Safari/537.36`;
}

assert.deepEqual(resolveSlidePerformanceDefaults(iosUserAgent("12_5_8")), {
    ...lowFrameRateOptions,
    maxResolutionLevel: 1,
});
assert.deepEqual(resolveSlidePerformanceDefaults(iosUserAgent("13_0")), lowFrameRateOptions);
assert.deepEqual(resolveSlidePerformanceDefaults(iosUserAgent("15_7")), lowFrameRateOptions);
assert.deepEqual(resolveSlidePerformanceDefaults(iosUserAgent("16_0")), defaultOptions);

assert.deepEqual(resolveSlidePerformanceDefaults(androidWebViewUserAgent("69.0.3497.100")), {
    ...lowFrameRateOptions,
    maxResolutionLevel: 1,
});
assert.deepEqual(resolveSlidePerformanceDefaults(androidWebViewUserAgent("70.0.3538.80")), lowFrameRateOptions);
assert.deepEqual(resolveSlidePerformanceDefaults(androidWebViewUserAgent("89.0.4389.105")), lowFrameRateOptions);
assert.deepEqual(resolveSlidePerformanceDefaults(androidWebViewUserAgent("90.0.4430.210")), defaultOptions);

assert.deepEqual(resolveSlidePerformanceDefaults(
    "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/69.0.3497.100 Mobile Safari/537.36",
), defaultOptions);
assert.deepEqual(resolveSlidePerformanceDefaults(
    "Mozilla/5.0 (Linux; OpenHarmony 5.0) AppleWebKit/537.36 ArkWeb/4.1.6 Chrome/69.0.3497.100 Mobile Safari/537.36",
), defaultOptions);
assert.deepEqual(resolveSlidePerformanceDefaults("unknown-runtime"), defaultOptions);

assert.deepEqual(resolveSlidePerformanceOptions(iosUserAgent("12_5_8"), {
    minFPS: 10,
    maxFPS: null,
    resolution: 2,
}), {
    minFPS: 10,
    maxFPS: 15,
    resolution: 2,
    maxResolutionLevel: 1,
});

assert.deepEqual(mergeDefaultAppliancePluginExtras(), {
    workerRenderModeBlacklist: {
        androidWebView: { "80": WorkerRenderModeBlacklistLevel.ImageBitmap },
        iosWebView: { "12": WorkerRenderModeBlacklistLevel.ImageBitmap },
    },
});
assert.deepEqual(mergeDefaultAppliancePluginExtras({
    useSimple: false,
    workerRenderModeBlacklist: {
        androidWebView: {
            "90": WorkerRenderModeBlacklistLevel.ImageBitmap,
        },
        harmonyArkWeb: { "99": WorkerRenderModeBlacklistLevel.OffscreenTransfer },
    },
}), {
    useSimple: false,
    workerRenderModeBlacklist: {
        androidWebView: {
            "90": WorkerRenderModeBlacklistLevel.ImageBitmap,
        },
        iosWebView: { "12": WorkerRenderModeBlacklistLevel.ImageBitmap },
        harmonyArkWeb: { "99": WorkerRenderModeBlacklistLevel.OffscreenTransfer },
    },
});

console.log("slide performance defaults tests passed");
