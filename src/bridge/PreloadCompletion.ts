export type PreloadResult = { state: "success" | "warn"; message: string };
export const preloadSuccess = (): PreloadResult => ({ state: "success", message: "" });

/** Observe each constructor task once. Never used by the join dependency chain. */
export async function collectPreloadResults(tasks: Promise<PreloadResult>[]): Promise<PreloadResult> {
    const results = await Promise.all(tasks);
    const warnings = results.filter(result => result.state === "warn").map(result => result.message);
    return warnings.length ? { state: "warn", message: warnings.join("；") } : preloadSuccess();
}

export function configurationKey(config: unknown): string {
    return JSON.stringify(config, (_key, value) =>
        value && typeof value === "object" && !Array.isArray(value)
            ? Object.keys(value).sort().reduce((out, name) => { out[name] = value[name]; return out; }, {}) : value);
}
