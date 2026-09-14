type VersionWorkerBlacklist = Record<string, number>;

type WorkerRenderModeBlacklist = {
    androidWebView?: VersionWorkerBlacklist;
    iosWebView?: VersionWorkerBlacklist;
    harmonyArkWeb?: VersionWorkerBlacklist;
    web?: Record<string, VersionWorkerBlacklist | undefined>;
};

type AppliancePluginExtras = Record<string, any> & {
    allowImageBitmapFallback?: boolean;
    workerRenderModeBlacklist?: WorkerRenderModeBlacklist;
};

export function mergeDefaultAppliancePluginExtras(
    nativeExtras?: AppliancePluginExtras,
): AppliancePluginExtras {
    return {
        allowImageBitmapFallback: false,
        ...nativeExtras,
    };
}
