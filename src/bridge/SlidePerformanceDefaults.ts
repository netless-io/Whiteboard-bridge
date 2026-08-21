export type SlidePerformanceOptions = {
    minFPS: number;
    maxFPS: number;
    resolution: number;
    maxResolutionLevel: number;
};

export type NativeSlidePerformanceOptions = {
    minFPS?: number | null;
    maxFPS?: number | null;
    resolution?: number | null;
    maxResolutionLevel?: number | null;
};

const defaultSlidePerformanceOptions: SlidePerformanceOptions = {
    minFPS: 25,
    maxFPS: 40,
    resolution: 1,
    maxResolutionLevel: 2,
};

const lowFrameRateSlidePerformanceOptions: SlidePerformanceOptions = {
    minFPS: 5,
    maxFPS: 15,
    resolution: 1,
    maxResolutionLevel: 2,
};

function parseMajorVersion(userAgent: string, pattern: RegExp): number | undefined {
    const match = userAgent.match(pattern);
    if (!match) {
        return undefined;
    }
    const majorVersion = Number(match[1]);
    return Number.isInteger(majorVersion) ? majorVersion : undefined;
}

function isAndroidWebView(userAgent: string): boolean {
    return /\bAndroid\b/i.test(userAgent) &&
        (/;\s*wv\)/i.test(userAgent) ||
            /\bVersion\/4\.0\b/i.test(userAgent) && /\bChrome\/\d+/i.test(userAgent));
}

export function resolveSlidePerformanceDefaults(userAgent: string): SlidePerformanceOptions {
    // ArkWeb UAs may contain Chromium tokens, but Harmony currently uses the common defaults.
    if (/\bArkWeb\//i.test(userAgent)) {
        return { ...defaultSlidePerformanceOptions };
    }

    const iosMajorVersion = parseMajorVersion(
        userAgent,
        /\b(?:iPhone|iPad|iPod).*?\bOS\s+(\d+)(?:[_.]\d+)*/i,
    );
    if (iosMajorVersion !== undefined) {
        if (iosMajorVersion <= 12) {
            return { ...lowFrameRateSlidePerformanceOptions, maxResolutionLevel: 1 };
        }
        if (iosMajorVersion <= 15) {
            return { ...lowFrameRateSlidePerformanceOptions };
        }
        return { ...defaultSlidePerformanceOptions };
    }

    if (isAndroidWebView(userAgent)) {
        const chromeMajorVersion = parseMajorVersion(userAgent, /\bChrome\/(\d+)(?:\.\d+)*/i);
        if (chromeMajorVersion !== undefined && chromeMajorVersion <= 69) {
            return { ...lowFrameRateSlidePerformanceOptions, maxResolutionLevel: 1 };
        }
        if (chromeMajorVersion !== undefined && chromeMajorVersion <= 89) {
            return { ...lowFrameRateSlidePerformanceOptions };
        }
    }

    return { ...defaultSlidePerformanceOptions };
}

export function resolveSlidePerformanceOptions(
    userAgent: string,
    nativeOptions: NativeSlidePerformanceOptions = {},
): SlidePerformanceOptions {
    const bridgeDefaults = resolveSlidePerformanceDefaults(userAgent);
    return {
        minFPS: nativeOptions.minFPS ?? bridgeDefaults.minFPS,
        maxFPS: nativeOptions.maxFPS ?? bridgeDefaults.maxFPS,
        resolution: nativeOptions.resolution ?? bridgeDefaults.resolution,
        maxResolutionLevel: nativeOptions.maxResolutionLevel ?? bridgeDefaults.maxResolutionLevel,
    };
}
