import { WorkerRenderModeBlacklistLevel } from "@netless/appliance-plugin";

type VersionWorkerBlacklist = Record<string, number>;

type WorkerRenderModeBlacklist = {
    androidWebView?: VersionWorkerBlacklist;
    iosWebView?: VersionWorkerBlacklist;
    harmonyArkWeb?: VersionWorkerBlacklist;
    web?: Record<string, VersionWorkerBlacklist | undefined>;
};

type AppliancePluginExtras = Record<string, any> & {
    workerRenderModeBlacklist?: WorkerRenderModeBlacklist;
};

const defaultWorkerRenderModeBlacklist: WorkerRenderModeBlacklist = {
    androidWebView: {
        "80": WorkerRenderModeBlacklistLevel.ImageBitmap,
    },
    iosWebView: {
        "12": WorkerRenderModeBlacklistLevel.ImageBitmap,
    },
};

export function mergeDefaultAppliancePluginExtras(
    nativeExtras?: AppliancePluginExtras,
): AppliancePluginExtras {
    const nativeBlacklist = nativeExtras?.workerRenderModeBlacklist;
    return {
        ...nativeExtras,
        workerRenderModeBlacklist: {
            ...defaultWorkerRenderModeBlacklist,
            ...nativeBlacklist,
        },
    };
}
