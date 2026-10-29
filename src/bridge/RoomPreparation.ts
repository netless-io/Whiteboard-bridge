import { getApplianceWorkerUrls } from "./ApplianceWorkerUrls";
import { splitNativeConfiguration } from "./DynamicConfigParameters";

type Options = Record<string, any>;
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

export class RoomPreparation {
    private tasks = new Map<string, Promise<Options>>();
    private ready = new Map<string, { workerUrls?: Options; renderModel?: string }>();
    private activeKey?: string;
    readonly status: { state: string; workerUrls?: Options; renderModel?: string; events: Array<{ stage: string; at: number; key?: string }> } = { state: "idle", events: [] };
    constructor(
        private readonly preloadApps: () => Promise<void>,
        private readonly probe: (options: Options) => Promise<unknown>,
        private readonly probeGeneration: () => number = () => 0,
    ) {}
    mark(stage: string): void {
        this.status.events.push({ stage, at: Date.now() });
        if (this.status.events.length > 128) this.status.events.splice(0, this.status.events.length - 128);
        console.info("[preparation] " + stage);
    }
    prepare(setup: Options, room: Options, dynamic: any): Promise<Options> {
        const options = resolveAppliancePreparationOptions(setup, room, dynamic?.parameters?.appliancePlugin?.extras);
        const key = JSON.stringify([!!setup.enableAppliancePlugin, options, this.probeGeneration()], (_key, value) =>
            value && typeof value === "object" && !Array.isArray(value)
                ? Object.keys(value).sort().reduce((out, name) => { out[name] = value[name]; return out; }, {}) : value);
        this.activeKey = key;
        const existing = this.tasks.get(key);
        if (existing) {
            const result = this.ready.get(key);
            if (result) {
                this.status.state = "ready";
                this.status.workerUrls = result.workerUrls;
                this.status.renderModel = result.renderModel;
            } else this.status.state = "loading";
            this.mark("reuse");
            return existing;
        }
        this.status.state = "loading";
        this.status.workerUrls = undefined;
        this.status.renderModel = undefined;
        this.mark("start");
        const result: { workerUrls?: Options; renderModel?: string } = {};
        const task = Promise.all([
            this.preloadApps(),
            setup.enableAppliancePlugin ? (async () => {
                const cdn = await getApplianceWorkerUrls(options);
                const effective = { ...options, cdn };
                const rendering = await this.probe(effective) as any;
                result.workerUrls = cdn;
                if (rendering) result.renderModel = `${rendering.renderMode}/${rendering.contextType}`;
                return effective;
            })() : Promise.resolve(options),
        ]).then(([, effective]) => {
            this.ready.set(key, result);
            if (this.activeKey === key) Object.assign(this.status, result, { state: "ready" });
            this.mark("dependenciesReady");
            return effective;
        }).catch(error => {
            if (this.tasks.get(key) === task) this.tasks.delete(key);
            if (this.activeKey === key) this.status.state = "failed";
            this.mark("failed");
            throw error;
        });
        this.tasks.set(key, task);
        return task;
    }
}
