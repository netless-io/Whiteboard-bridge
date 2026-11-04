const fs = require("fs");
const path = require("path");

function checkModelPreloadSdk(entry = require.resolve("white-web-sdk")) {
    const source = fs.readFileSync(entry, "utf8");
    if (!source.includes("enableModelPreload") || !source.includes("prepareRoomResources")) {
        throw new Error("White SDK build lacks enableModelPreload. Install/rebuild the SDK with the default-off model preload control before bundling Bridge: " + entry);
    }
    return entry;
}
if (require.main === module) {
    try { console.log("Model preload SDK entry verified: " + checkModelPreloadSdk(process.argv[2] && path.resolve(process.argv[2]))); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { checkModelPreloadSdk };
