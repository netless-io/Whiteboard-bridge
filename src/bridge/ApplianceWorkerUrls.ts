export type ApplianceWorkerUrls = {
    fullWorkerUrl?: string;
    subWorkerUrl?: string;
};

type Extras = Record<string, any>;
type SourceLoader = () => Promise<{ default: string }>;

function resolveWorkerOption(name: string, local: Extras, remote: Extras): any {
    const descriptor = Object.getOwnPropertyDescriptor(local, "__netlessDynamicConfigLayers");
    const layers = descriptor && !descriptor.enumerable && descriptor.value;
    if (layers?.version === 1 && layers.defaults && layers.explicit) {
        if (layers.explicit[name] !== undefined) return layers.explicit[name];
        return remote[name] !== undefined ? remote[name] : layers.defaults[name];
    }
    return local[name] !== undefined ? local[name] : remote[name];
}

/** Sources and Blob URLs are shared for the document, including probe and Room reuse. */
export class ApplianceWorkerUrlProvider {
    private full?: Promise<string>;
    private sub?: Promise<string>;

    constructor(
        private readonly loadFull: SourceLoader,
        private readonly loadSub: SourceLoader,
        private readonly createUrl = (source: string) =>
            URL.createObjectURL(new Blob([source], { type: "text/javascript" })),
    ) {}

    private load(kind: "full" | "sub"): Promise<string> {
        if (!this[kind]) {
            const loader = kind === "full" ? this.loadFull : this.loadSub;
            this[kind] = Promise.resolve().then(loader).then(module => {
                if (typeof module.default !== "string" || !module.default.length) {
                    throw new Error(`Invalid appliance ${kind} Worker source`);
                }
                return this.createUrl(module.default);
            }).catch(error => {
                this[kind] = undefined;
                throw error;
            });
        }
        return this[kind]!;
    }

    async get(
        options: { extras?: Extras; cdn?: ApplianceWorkerUrls },
        remoteExtras?: Extras,
    ): Promise<ApplianceWorkerUrls> {
        // Preserve the existing explicit cdn override, including an empty object.
        if (options.cdn !== undefined) return options.cdn;
        const extras = options.extras || {};
        const remote = remoteExtras && typeof remoteExtras === "object" && !Array.isArray(remoteExtras)
            ? remoteExtras : {};
        if (resolveWorkerOption("useWorker", extras, remote) === "mainThread") return {};
        const configuredSimple = resolveWorkerOption("useSimple", extras, remote);
        // Match the plugin's truthiness checks, including Native NSNumber 0/1.
        const useSimple = configuredSimple === undefined ? true : Boolean(configuredSimple);
        const [fullWorkerUrl, subWorkerUrl] = await Promise.all([
            this.load("full"),
            useSimple ? Promise.resolve(undefined) : this.load("sub"),
        ]);
        return { fullWorkerUrl, ...(subWorkerUrl ? { subWorkerUrl } : {}) };
    }
}

const provider = new ApplianceWorkerUrlProvider(
    () => import(/* webpackChunkName: "appliance-worker-full-source" */ "@netless/appliance-plugin/dist/fullWorker.js?raw"),
    () => import(/* webpackChunkName: "appliance-worker-sub-source" */ "@netless/appliance-plugin/dist/subWorker.js?raw"),
);

export function getApplianceWorkerUrls(
    options: { extras?: Extras; cdn?: ApplianceWorkerUrls },
    remoteExtras?: Extras,
): Promise<ApplianceWorkerUrls> {
    return provider.get(options, remoteExtras);
}
