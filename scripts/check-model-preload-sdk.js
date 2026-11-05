const fs = require("fs");
const path = require("path");

function checkModelPreloadSdk(entry = require.resolve("white-web-sdk")) {
    const source = fs.readFileSync(entry, "utf8");
    if (!source.includes("enableModelPreload") || !source.includes("prepareRoomResources") || !source.includes("waitForModelPreload")) {
        throw new Error("White SDK build lacks model preload completion observation. Install/rebuild the SDK with enableModelPreload and waitForModelPreload before bundling Bridge: " + entry);
    }
    return entry;
}
function checkAppliancePreparation(entry = require.resolve("@netless/appliance-plugin")) {
    if (!fs.readFileSync(entry, "utf8").includes("getPreparedApplianceRendering")) {
        throw new Error("Appliance Plugin build lacks settled preparation reuse. Install/rebuild the fixed plugin before bundling Bridge: " + entry);
    }
    return entry;
}
if (require.main === module) {
    try { console.log("Model preload SDK entry verified: " + checkModelPreloadSdk(process.argv[2] && path.resolve(process.argv[2]))); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { checkModelPreloadSdk, checkAppliancePreparation };
