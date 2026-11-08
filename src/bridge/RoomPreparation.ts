import { getApplianceWorkerUrls } from "./ApplianceWorkerUrls";
import { splitNativeConfiguration } from "./DynamicConfigParameters";
import { PreloadResult, preloadSuccess } from "./PreloadCompletion";

type Options = Record<string, any>;

/** Native-only class warmup selection. Empty arrays explicitly disable it. */
export function resolveBuiltinAppPreloadKinds(value: unknown): string[] {
    if (value === undefined || value === null) return [];
    const allowed = ["Slide", "Presentation", "MediaPlayer", "DocsViewer"];
    if (!Array.isArray(value) || value.some(kind => typeof kind !== "string" || !allowed.includes(kind))) {
        throw new TypeError("preloadBuiltinApps must be an array of Slide, Presentation, MediaPlayer or DocsViewer");
    }
    return Array.from(new Set(value));
}
const plain = (item: any) => item && Object.getPrototypeOf(item) === Object.prototype;
function copy(value: any): any {
    if (Array.isArray(value)) return value.map(copy);
    if (plain(value)) {
        const result: Options = {};
        for (const key of Object.keys(value)) {
            if (!["__proto__", "constructor", "prototype", "__nativeConfigDefaults"].includes(key)) result[key] = copy(value[key]);
        }
        return result;
    }
    return value;
}
function merge(base: Options, override?: Options): Options {
    const result = copy(base);
    for (const key of Object.keys(override || {})) {
        if (["__proto__", "constructor", "prototype", "__nativeConfigDefaults"].includes(key)) continue;
        const value = override![key];
        if (value === undefined) continue;
        result[key] = key !== "cdn" && plain(value) && plain(result[key]) ? merge(result[key], value) : copy(value);
    }
    return result;
}
/** Room explicit > SDK explicit > remote > factory defaults, without mutating any input. */
export function resolveAppliancePreparationOptions(setup: Options, room: Options, remoteExtras?: Options): Options {
    const sdk = splitNativeConfiguration(setup);
    const join = splitNativeConfiguration(room);
    const defaults = merge({ extras: { allowImageBitmapFallback: false, backgroundImageLoadOptions: setup.backgroundImageLoadOptions } },
        merge(sdk.defaults.appliancePluginOptions || {}, join.defaults.appliancePluginOptions || {}));
    return merge(merge(merge(defaults, { extras: remoteExtras || {} }), sdk.explicit.appliancePluginOptions), join.explicit.appliancePluginOptions);
}

/** Required work stays at the original post-Room/WindowManager point when preload is off. */
export async function resolveApplianceOptionsForRoom(setup: Options, room: Options, dynamic: any): Promise<Options> {
    const options = resolveAppliancePreparationOptions(setup, room, dynamic?.appliancePlugin?.extras);
    return { ...options, cdn: await getApplianceWorkerUrls(options) };
}

/** Created only for explicit appliance preload. One first-options snapshot per document. */
export class RoomPreparation {
    private options!: Promise<Options | undefined>;
    private completion?: Promise<PreloadResult>;
    readonly status: { state: string; workerUrls?: Options; renderModel?: string; events: Array<{ stage: string; at: number }> } = { state: "idle", events: [] };
    constructor(private readonly probe: (options: Options) => Promise<unknown>) {}

    private mark(stage: string): void {
        this.status.events.push({ stage, at: Date.now() });
    }

    start(setup: Options, dynamic?: Promise<any>): Promise<PreloadResult> {
        if (this.completion) return this.completion;
        this.status.state = "loading";
        this.mark("start");
        let rendering: Promise<any> | undefined;
        this.options = (async () => {
            // Observe the SDK's automatic request; never call private preparation APIs.
            // On cancellation/failure defer the first options lock to the actual Room,
            // which may receive a different configuration from the normal fallback.
            const result = setup.dynamicConfig ? await dynamic : undefined;
            if (setup.dynamicConfig && result?.state.source !== "remote") return undefined;
            const options = resolveAppliancePreparationOptions(setup, {}, result?.parameters?.appliancePlugin?.extras);
            const effective = { ...options, cdn: await getApplianceWorkerUrls(options) };
            // Invoke prepare before publishing options; getInstance can then reuse its
            // running probe without racing a late prepare after initialization starts.
            rendering = Promise.resolve(this.probe(effective));
            rendering.catch(() => undefined);
            this.status.workerUrls = effective.cdn;
            this.mark("probeStarted");
            return effective;
        })();
        this.completion = this.options.then(async options => {
            if (!options) throw new Error("DynamicConfigPreparationDeferred");
            const result = await rendering;
            this.status.state = "ready";
            if (result) this.status.renderModel = `${result.renderMode}/${result.contextType}`;
            this.mark("ready");
            return preloadSuccess();
        }).catch(() => {
            this.status.state = "deferred";
            this.mark("deferred");
            return { state: "warn" as const, message: "教具预准备未完成，将在正常初始化时处理" };
        });
        return this.completion;
    }

    async resolveForRoom(setup: Options, room: Options, dynamic: any): Promise<Options> {
        // Wait only until resource loading has started the shared probe. getInstance
        // owns the probe wait/fallback. Optional App/model tasks never gate this step.
        const prepared = await this.options.catch(() => undefined);
        return prepared || resolveApplianceOptionsForRoom(setup, room, dynamic);
    }
}
