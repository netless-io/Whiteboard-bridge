import type {
    DynamicConfigFieldSource,
    DynamicConfigFieldSources,
    DynamicConfigJSON,
    DynamicConfigObject,
    DynamicConfigSnapshot,
} from "./Types";

export interface DynamicConfigContext {
    readonly runtime: string;
    readonly version?: string;
}
const runtimes = [
    "androidWebView",
    "iosWebView",
    "harmonyArkWeb",
    "web.chrome",
    "web.edge",
    "web.firefox",
    "web.safari",
];
const forbidden = ["__proto__", "prototype", "constructor"];
const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
export function isPlainObject(value: unknown): value is Record<string, any> {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    );
}
function assertJSON(value: unknown, depth = 0): void {
    if (depth > 32) throw new Error("dynamic_config_format");
    if (
        value === null ||
        typeof value === "boolean" ||
        typeof value === "string" ||
        (typeof value === "number" && Number.isFinite(value))
    ) return;
    if (Array.isArray(value)) {
        value.forEach((child) => assertJSON(child, depth + 1));
        return;
    }
    if (!isPlainObject(value)) throw new Error("dynamic_config_format");
    Object.keys(value).forEach((key) => {
        if (forbidden.indexOf(key) !== -1) throw new Error("dynamic_config_format");
        assertJSON(value[key], depth + 1);
    });
}
function parts(version: string): number[] {
    if (typeof version !== "string" || !/^\d{1,8}(\.\d{1,8}){0,3}$/.test(version)) throw new Error("dynamic_config_format");
    return version.split(".").map(Number);
}
function within(actual: number[], upper: number[]): boolean {
    for (let i = 0; i < upper.length; i ++) {
        const delta = (actual[i] || 0) - upper[i];
        if (delta !== 0) return delta < 0;
    }
    return true;
}
function compare(a: number[], b: number[]): number {
    for (let i = 0; i < Math.max(a.length, b.length); i ++) {
        const left = a[i] === undefined ? Infinity : a[i];
        const right = b[i] === undefined ? Infinity : b[i];
        if (left !== right) return left < right ? -1 : 1;
    }
    return 0;
}
function validateTable(table: unknown): void {
    if (!isPlainObject(table) || Object.keys(table).length > 100) throw new Error("dynamic_config_format");
    const seen = new Set<string>();
    Object.keys(table).forEach((version) => {
        const normalized = parts(version).join(".");
        if (seen.has(normalized)) throw new Error("dynamic_config_format");
        seen.add(normalized);
    });
}
export function validateParameterJSON(profile: unknown): asserts profile is DynamicConfigObject {
    assertJSON(profile);
    if (
        !isPlainObject(profile) ||
        Object.keys(profile).some((k) => ["joinRoom", "windowManager", "appliancePlugin"].indexOf(k) === -1)
    ) throw new Error("dynamic_config_format");
    if (
        profile.appliancePlugin !== undefined &&
        (!isPlainObject(profile.appliancePlugin) || Object.keys(profile.appliancePlugin).some((k) => k !== "extras"))
    ) throw new Error("dynamic_config_format");
    function walk(node: unknown, path: string[]): void {
        if (!isPlainObject(node)) throw new Error("dynamic_config_format");
        if (own(node, "defaults")) {
            if (
                path.length < 2 ||
                (path[0] === "appliancePlugin" && path.length < 3) ||
                Object.keys(node).some((k) => k !== "defaults" && k !== "webviewVersion")
            ) throw new Error("dynamic_config_format");
            if (node.webviewVersion !== undefined) {
                if (!isPlainObject(node.webviewVersion)) throw new Error("dynamic_config_format");
                Object.keys(node.webviewVersion).forEach((runtime) => {
                    const table = node.webviewVersion[runtime];
                    if (runtime === "web") {
                        if (!isPlainObject(table)) throw new Error("dynamic_config_format");
                        Object.keys(table).forEach((browser) => {
                            if (runtimes.indexOf(`web.${browser}`) === -1) throw new Error("dynamic_config_format");
                            validateTable(table[browser]);
                        });
                    } else {
                        if (runtimes.indexOf(runtime) === -1 || runtime.indexOf(".") !== -1) {
                            throw new Error("dynamic_config_format");
                        }
                        validateTable(table);
                    }
                });
            }
            return;
        }
        Object.keys(node).forEach((key) => walk(node[key], path.concat(key)));
    }
    Object.keys(profile).forEach((key) => walk(profile[key], [key]));
}
export function deepFreezeJSON<T>(value: T): T {
    if (value !== null && typeof value === "object") {
        Object.keys(value).forEach((key) => deepFreezeJSON((value as Record<string, unknown>)[key]));
        Object.freeze(value);
    }
    return value;
}
export function resolveParameterJSON(
    profile: DynamicConfigObject,
    context: DynamicConfigContext,
): DynamicConfigSnapshot {
    return resolveParameterJSONWithSources(profile, context).parameters;
}
export function resolveParameterJSONWithSources(
    profile: DynamicConfigObject,
    context: DynamicConfigContext,
): { readonly parameters: DynamicConfigSnapshot; readonly sources: DynamicConfigFieldSources } {
    validateParameterJSON(profile);
    const sources: Record<string, DynamicConfigFieldSource> = {};
    let actual: number[] | undefined;
    try {
        actual = context.version === undefined ? undefined : parts(context.version);
    } catch {
        /* Unknown devices use defaults. */
    }
    function walk(node: Record<string, any>, path: string[]): DynamicConfigObject {
        const output: Record<string, DynamicConfigJSON> = {};
        Object.keys(node).forEach((key) => {
            const wrapped = node[key];
            const fieldPath = path.concat(key);
            if (!own(wrapped, "defaults")) {
                const children = walk(wrapped, fieldPath);
                if (Object.keys(children).length) output[key] = children;
                return;
            }
            const table =
                runtimes.indexOf(context.runtime) === -1 ?
                    undefined :
                    context.runtime.split(".").reduce((v, k) => v && v[k], wrapped.webviewVersion);
            const upper =
                actual && table ?
                    Object.keys(table)
                          .filter((v) => within(actual!, parts(v)))
                          .sort((a, b) => compare(parts(a), parts(b)))[0] :
                    undefined;
            const value = upper === undefined ? wrapped.defaults : table[upper];
            sources[fieldPath.join(".")] = {
                source: upper === undefined ? "defaults" : "webviewVersion",
                ...(upper === undefined ? {} : { runtime: context.runtime, upper }),
                omitted: value === null,
            };
            if (value !== null) output[key] = JSON.parse(JSON.stringify(value));
        });
        return output;
    }
    return deepFreezeJSON({ parameters: walk(profile, []) as DynamicConfigSnapshot, sources });
}

/** Match the existing appliance-plugin runtime detector; do not use the browser marketing version for iOS/ArkWeb. */
export function detectDynamicConfigContext(userAgent: string): DynamicConfigContext {
    const match = (pattern: RegExp): string | undefined => {
        const result = userAgent.match(pattern);
        if (!result) return undefined;
        try {
            return parts(result[1].replace(/_/g, ".")).join(".");
        } catch {
            return undefined;
        }
    };
    const chrome = match(/\bChrome\/(\d+(?:\.\d+)*)/i);
    if (/\bArkWeb\//i.test(userAgent)) {
        return { runtime: chrome ? "harmonyArkWeb" : "unknown", ...(chrome ? { version: chrome } : {}) };
    }
    if (
        /\bAndroid\b/i.test(userAgent) &&
        (/;\s*wv\)/i.test(userAgent) || (/\bVersion\/4\.0\b/i.test(userAgent) && chrome))
    ) return { runtime: chrome ? "androidWebView" : "unknown", ...(chrome ? { version: chrome } : {}) };
    const ios = match(/\b(?:iPhone|iPad|iPod).*?\bOS\s+(\d+(?:[_.]\d+)*)/i);
    if (ios) return { runtime: "iosWebView", version: ios };
    const edge = match(/\bEdg(?:A)?\/(\d+(?:\.\d+)*)/i);
    if (edge) return { runtime: "web.edge", version: edge };
    if (chrome) return { runtime: "web.chrome", version: chrome };
    const firefox = match(/\bFirefox\/(\d+(?:\.\d+)*)/i);
    if (firefox) return { runtime: "web.firefox", version: firefox };
    const safari = match(/\bVersion\/(\d+(?:\.\d+)*).*\bSafari\//i);
    return safari ? { runtime: "web.safari", version: safari } : { runtime: "unknown" };
}

// Private, non-enumerable provenance shared with Bridge/Fastboard. Never part of OSS JSON.
const parameterLayersKey = "__netlessDynamicConfigLayers";
function cloneParameterValue(value: any): any {
    if (Array.isArray(value)) return value.map(cloneParameterValue);
    if (!isPlainObject(value)) return value;
    const copy: Record<string, any> = {};
    Object.keys(value).forEach((key) => {
        if (forbidden.indexOf(key) === -1) copy[key] = cloneParameterValue(value[key]);
    });
    return copy;
}
/** Local undefined inherits. Arrays/instances are atomic; local hotKeys/floatBar retain their atomic API semantics. */
export function mergeDynamicParameters<T extends object>(
    remote: unknown,
    local: T,
    onOverride?: (path: string) => void,
    prefix = "",
    remoteEvidence?: { readonly value: unknown },
): T {
    const descriptor = Object.getOwnPropertyDescriptor(local, parameterLayersKey);
    const layers = descriptor && !descriptor.enumerable ? descriptor.value : undefined;
    if (layers && layers.version === 1 && isPlainObject(layers.defaults) && isPlainObject(layers.explicit)) {
        const inherited = mergeDynamicParameters(layers.defaults, isPlainObject(remote) ? remote : {});
        return mergeDynamicParameters(inherited, layers.explicit, onOverride, prefix, { value: remote }) as T;
    }
    if (!isPlainObject(remote)) return local;
    const output: Record<string, any> = cloneParameterValue(remote);
    Object.keys(local).forEach((key) => {
        if (forbidden.indexOf(key) !== -1) return;
        const value = (local as Record<string, any>)[key];
        if (value === undefined) return;
        const path = prefix ? `${prefix}.${key}` : key;
        if (key !== "hotKeys" && key !== "floatBar" && isPlainObject(value) && isPlainObject(output[key])) {
            // Follow actual keys: version keys such as "122.0" must not be split as paths.
            const childEvidence = remoteEvidence ?
                    {
                        value:
                          isPlainObject(remoteEvidence.value) &&
                          Object.prototype.hasOwnProperty.call(remoteEvidence.value, key) ?
                              remoteEvidence.value[key] :
                              undefined,
                    } :
                undefined;
            output[key] = mergeDynamicParameters(output[key], value, onOverride, path, childEvidence);
        } else {
            if (
                Object.prototype.hasOwnProperty.call(remote, key) &&
                (!remoteEvidence ||
                    (isPlainObject(remoteEvidence.value) &&
                        Object.prototype.hasOwnProperty.call(remoteEvidence.value, key)))
            ) {
                onOverride?.(path);
            }
            output[key] = value;
        }
    });
    return output as T;
}

/** Connection identity and runtime objects always come from the caller. */
export function mergeDynamicJoinRoomParameters<T extends object>(
    remote: unknown,
    local: T,
    onOverride?: (path: string) => void,
): T {
    const settings = isPlainObject(remote) ? { ...remote } : undefined;
    if (settings) {
        [
            "uuid",
            "roomToken",
            "uid",
            "userPayload",
            "region",
            "invisiblePlugins",
            "wrappedComponents",
            "cursorAdapter",
            "modulesOrigin",
            "callbacks",
        ].forEach((key) => delete settings[key]);
    }
    const merged = settings ? mergeDynamicParameters(settings, local, onOverride, "joinRoom") : local;
    const descriptor = Object.getOwnPropertyDescriptor(local, parameterLayersKey);
    const layers = descriptor && !descriptor.enumerable ? descriptor.value : undefined;
    // Trusted local factories prepare mode-dependent runtime objects after this
    // single config read, before conflict checks and Room acquisition.
    if (
        layers &&
        layers.version === 1 &&
        isPlainObject(layers.defaults) &&
        isPlainObject(layers.explicit) &&
        typeof layers.prepareJoinRoom === "function"
    ) {
        return layers.prepareJoinRoom(merged, settings);
    }
    return merged;
}
