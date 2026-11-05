const fs = require("fs");
const path = require("path");

function npmEntry(name) {
    const packageDirectory = path.resolve(__dirname, "../node_modules", name);
    if (fs.realpathSync(packageDirectory) !== packageDirectory) {
        throw new Error("Bridge dependencies must be installed from npm, without package symlinks: " + name);
    }
    return require.resolve(name);
}

function checkModelPreloadSdk() {
    const entry = npmEntry("white-web-sdk");
    const source = fs.readFileSync(entry, "utf8");
    if (!source.includes("enableModelPreload") || !source.includes("prepareRoomResources") || !source.includes("waitForModelPreload")) {
        throw new Error("White SDK build lacks model preload completion observation. Install/rebuild the SDK with enableModelPreload and waitForModelPreload before bundling Bridge: " + entry);
    }
    return entry;
}
function checkAppliancePreparation() {
    const entry = npmEntry("@netless/appliance-plugin");
    if (!fs.readFileSync(entry, "utf8").includes("getPreparedApplianceRendering")) {
        throw new Error("Appliance Plugin build lacks settled preparation reuse. Install/rebuild the fixed plugin before bundling Bridge: " + entry);
    }
    return entry;
}
if (require.main === module) {
    try {
        const manifest = require("../package.json");
        for (const [name, spec] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) {
            if (!/^[\d~^*<>=][\da-zA-Z+|. *~^<>=-]*$/.test(spec)) throw new Error("Non-registry dependency is not allowed: " + name);
        }
        console.log("Model preload SDK entry verified: " + checkModelPreloadSdk());
        console.log("Appliance preparation entry verified: " + checkAppliancePreparation());
    }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { checkModelPreloadSdk, checkAppliancePreparation };
