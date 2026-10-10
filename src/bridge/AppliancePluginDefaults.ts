import { withDynamicConfigDefaults } from "./DynamicConfigParameters";

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
    sdkExtras?: AppliancePluginExtras,
): AppliancePluginExtras {
    const explicit = withDynamicConfigDefaults(sdkExtras || {}, nativeExtras || {});
    return withDynamicConfigDefaults({ allowImageBitmapFallback: false }, explicit);
}
