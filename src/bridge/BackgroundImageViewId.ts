export type BackgroundImageReloadResult = {
    accepted: boolean;
    reloadedCount: number;
    reason?: "viewNotFound" | "sceneNotFocused" | "resourceNotFound" | "alreadyLoading";
};

export type BackgroundImageSource = "appliance" | "whiteSdk";

export type HasBackgroundImageParams = {
    viewId: string;
    scenePath: string;
    imageUrl: string;
    sources: readonly BackgroundImageSource[];
};

export const BACKGROUND_IMAGE_CAPABILITY_UNAVAILABLE =
    "background image capability requires useMultiViews and enableAppliancePlugin";

export function assertBackgroundImageCapability(
    useMultiViews: boolean,
    enableAppliancePlugin: boolean,
    method: unknown,
): void {
    if (!useMultiViews || !enableAppliancePlugin || typeof method !== "function") {
        throw new Error(BACKGROUND_IMAGE_CAPABILITY_UNAVAILABLE);
    }
}

export function validateHasBackgroundImageParams(
    params: HasBackgroundImageParams,
): void {
    if (!params ||
        typeof params.viewId !== "string" || params.viewId.length === 0 ||
        typeof params.scenePath !== "string" || params.scenePath.length === 0 ||
        typeof params.imageUrl !== "string" || params.imageUrl.length === 0 ||
        !Array.isArray(params.sources) || params.sources.length === 0 ||
        params.sources.some(source => source !== "appliance" && source !== "whiteSdk")) {
        throw new RangeError(
            "viewId, scenePath, imageUrl, and non-empty sources are required; " +
            "sources must contain only appliance or whiteSdk",
        );
    }
}

export function backgroundImageProviderParams(
    params: HasBackgroundImageParams,
): HasBackgroundImageParams {
    return { ...params, sources: ["appliance"] };
}

export function shouldQueryApplianceBackgroundImage(
    sources: readonly BackgroundImageSource[],
): boolean {
    return sources.includes("appliance");
}

export function aggregateBackgroundImageQueryResults(
    results: readonly boolean[],
): boolean {
    return results.some(Boolean);
}

export function aggregateBackgroundImageReloadResults(
    results: readonly BackgroundImageReloadResult[],
): BackgroundImageReloadResult {
    const reloadedCount = results.reduce((sum, item) => sum + item.reloadedCount, 0);
    if (reloadedCount > 0) {
        return { accepted: true, reloadedCount };
    }
    const reasons: ReadonlyArray<BackgroundImageReloadResult["reason"]> = [
        "sceneNotFocused",
        "alreadyLoading",
        "resourceNotFound",
    ];
    return {
        accepted: false,
        reloadedCount: 0,
        reason: reasons.find(reason => results.some(item => item.reason === reason)) || "viewNotFound",
    };
}

export function resolveBackgroundImageEventViewId(
    originalViewId: string,
    useMultiViews: boolean,
): string {
    if (!useMultiViews) {
        return "mainView";
    }
    return originalViewId;
}
