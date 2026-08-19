const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const supportedPluginVersions = new Set(["1.1.42-beta.0"]);
const entry = "BackgroundImageMaxRetries";

function fail(message) {
    console.error("[patch-appliance-plugin-types] " + message);
    process.exit(1);
}

function resolveInstalledVersion() {
    const packageJsonPath = require.resolve("@netless/appliance-plugin/package.json", {
        paths: [rootDir],
    });
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).version;
}

function ensureSupportedVersion() {
    const installedVersion = resolveInstalledVersion();
    if (!supportedPluginVersions.has(installedVersion)) {
        fail(
            "unsupported @netless/appliance-plugin version " +
                installedVersion +
                ". Expected one of: " +
                Array.from(supportedPluginVersions).join(", "),
        );
    }
    return installedVersion;
}

function applyFile(pluginRoot, relativePath, replacements) {
    const filePath = path.join(pluginRoot, relativePath);
    if (!fs.existsSync(filePath)) {
        fail("missing file " + relativePath);
    }

    const source = fs.readFileSync(filePath, "utf8");
    if (source.indexOf(entry) >= 0) {
        console.log("[patch-appliance-plugin-types] " + relativePath + " already patched, skip");
        return;
    }

    let patched = source;
    for (const { from, to } of replacements) {
        if (patched.indexOf(from) < 0) {
            fail(relativePath + " missing expected snippet: " + from.slice(0, 80));
        }
        patched = patched.split(from).join(to);
    }

    fs.writeFileSync(filePath, patched);
    console.log("[patch-appliance-plugin-types] patched " + relativePath);
}

function main() {
    const installedVersion = ensureSupportedVersion();
    const pluginRoot = path.dirname(
        require.resolve("@netless/appliance-plugin/package.json", { paths: [rootDir] }),
    );

    applyFile(pluginRoot, "dist/component/backgroundImageLoadCoordinator.d.ts", [
        {
            from: "export interface BackgroundImageLoadOptions {\n    maxRetries?: number;",
            to:
                "/** 背景图片加载重试次数：`-1`（无限重试，对外统一约定，bridge 内部归一为 `Infinity`）或 `0`~`10` 的整数。 */\n" +
                "export type " + entry + " = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;\n" +
                "export interface BackgroundImageLoadOptions {\n    maxRetries?: " + entry + ";",
        },
    ]);

    applyFile(pluginRoot, "dist/plugin/types.d.ts", [
        {
            from:
                "import type { BackgroundImageLoadEvent, BackgroundImageLoadOptions, BackgroundImageSource, ReloadBackgroundImageParams, ReloadBackgroundImageResult } from \"../component/backgroundImageLoadCoordinator\";",
            to:
                "import type { BackgroundImageLoadEvent, BackgroundImageLoadOptions, " + entry + ", BackgroundImageSource, ReloadBackgroundImageParams, ReloadBackgroundImageResult } from \"../component/backgroundImageLoadCoordinator\";",
        },
        {
            from:
                "export type { BackgroundImageLoadEvent, BackgroundImageLoadOptions, BackgroundImageSource, ReloadBackgroundImageParams, ReloadBackgroundImageResult, };",
            to:
                "export type { BackgroundImageLoadEvent, BackgroundImageLoadOptions, " + entry + ", BackgroundImageSource, ReloadBackgroundImageParams, ReloadBackgroundImageResult, };",
        },
    ]);

    console.log("[patch-appliance-plugin-types] @netless/appliance-plugin@" + installedVersion + " type tightening ensured");
}

main();
