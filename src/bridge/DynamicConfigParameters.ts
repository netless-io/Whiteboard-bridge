/** Keep factory defaults readable by old dependencies while new consumers retain their source. */
const parameterLayersKey = "__netlessDynamicConfigLayers";
const forbidden = ["__proto__", "prototype", "constructor"];
function isPlainObject(value: unknown): value is Record<string, any> {
    return value !== null && typeof value === "object" && !Array.isArray(value) &&
        (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function mergeDefaults(defaults: Record<string, any>, explicit: Record<string, any>): Record<string, any> {
    const result = { ...defaults };
    Object.keys(explicit).forEach(key => {
        if (forbidden.indexOf(key) !== -1 || explicit[key] === undefined) return;
        result[key] = key !== "hotKeys" && key !== "floatBar" && isPlainObject(result[key]) && isPlainObject(explicit[key])
            ? mergeDefaults(result[key], explicit[key]) : explicit[key];
    });
    return result;
}
export function withDynamicConfigDefaults<T extends object>(
    defaults: object,
    explicit: T,
    prepareJoinRoom?: (parameters: T, remote?: Readonly<Record<string, any>>) => T,
): T {
    const result = mergeDefaults(defaults, explicit) as T;
    Object.defineProperty(result, parameterLayersKey, {
        value: { version: 1, defaults: { ...defaults }, explicit: { ...explicit }, ...(prepareJoinRoom ? { prepareJoinRoom } : {}) },
    });
    return result;
}

/** Native defaults are tagged before JSON transport; untagged values are host explicit. */
export function splitNativeConfiguration<T extends object>(parameters: T): {
    defaults: Partial<T>; explicit: T;
} {
    const defaults: Record<string, any> = {};
    const explicit: Record<string, any> = {};
    const tagged = (parameters as any).__nativeConfigDefaults;
    const keys: string[] = Array.isArray(tagged) ? tagged.filter(key => typeof key === "string") : [];
    Object.keys(parameters).forEach(key => {
        if (key === "__nativeConfigDefaults" || forbidden.includes(key)) return;
        (keys.includes(key) ? defaults : explicit)[key] = (parameters as any)[key];
    });
    return { defaults: defaults as Partial<T>, explicit: explicit as T };
}

export function resolveNativeConfiguration<T extends object>(parameters: T, remote?: object): T {
    const layers = splitNativeConfiguration(parameters);
    return mergeDefaults(mergeDefaults(layers.defaults, remote || {}), layers.explicit) as T;
}
