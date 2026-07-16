const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const workerPath = path.join(rootDir, ".generated", "foundation-worker.js");
const manifestPath = path.join(rootDir, ".generated", "foundation-worker.manifest.json");
const allowedFoundationVersions = new Set(["3.11.1-rc.1", "3.11.1"]);
const patchMarker = "WHITEBOARD_BRIDGE_FOUNDATION_WORKER_ARRAYBUFFER_PATCH";
const expectedZipOutputCount = 2;

function fail(message) {
    console.error("[patch-foundation-worker] " + message);
    process.exit(1);
}

function countMatches(source, pattern) {
    const matches = source.match(pattern);
    return matches ? matches.length : 0;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveFoundationVersion() {
    const packageJsonPath = require.resolve("agora-foundation/package.json", {
        paths: [rootDir],
    });
    return readJson(packageJsonPath).version;
}

function verifyFoundationVersion() {
    const installedVersion = resolveFoundationVersion();
    if (!allowedFoundationVersions.has(installedVersion)) {
        fail(
            "unsupported agora-foundation version " +
                installedVersion +
                ". Expected one of: " +
                Array.from(allowedFoundationVersions).join(", "),
        );
    }

    if (fs.existsSync(manifestPath)) {
        const manifest = readJson(manifestPath);
        const manifestVersion = manifest.foundationVersion;
        if (manifestVersion && manifestVersion !== installedVersion) {
            fail(
                "manifest foundationVersion " +
                    manifestVersion +
                    " does not match installed version " +
                    installedVersion,
            );
        }
    }

    return installedVersion;
}

function patchWorker(source) {
    if (source.indexOf(patchMarker) >= 0) {
        return source;
    }

    const blobTypeCount = countMatches(source, /type:\s*"blob"/g);
    const blobArrayBufferCount = countMatches(source, /return blob\.arrayBuffer\(\);/g);

    if (blobTypeCount !== expectedZipOutputCount || blobArrayBufferCount !== expectedZipOutputCount) {
        fail(
            "unexpected generated worker shape. type:\"blob\" count=" +
                blobTypeCount +
                ", blob.arrayBuffer count=" +
                blobArrayBufferCount +
                ". Refusing to patch.",
        );
    }

    const helper =
        "/* " +
        patchMarker +
        " */\n" +
        "function __whiteboardBridgeReadZipBuffer(output) {\n" +
        "  if (output && typeof output.arrayBuffer === \"function\") {\n" +
        "    return output.arrayBuffer();\n" +
        "  }\n" +
        "  return Promise.resolve(output);\n" +
        "}\n\n";

    return (
        helper +
        source
            .replace(/type:\s*"blob"/g, 'type: "arraybuffer"')
            .replace(/return blob\.arrayBuffer\(\);/g, "return __whiteboardBridgeReadZipBuffer(blob);")
    );
}

function verifyPatchedWorker(source) {
    if (source.indexOf(patchMarker) < 0) {
        fail("patch marker is missing");
    }

    const blobTypeCount = countMatches(source, /type:\s*"blob"/g);
    const arrayBufferTypeCount = countMatches(source, /type:\s*"arraybuffer"/g);
    const rawBlobArrayBufferCount = countMatches(source, /return blob\.arrayBuffer\(\);/g);
    const helperCallCount = countMatches(source, /return __whiteboardBridgeReadZipBuffer\(blob\);/g);

    if (blobTypeCount !== 0) {
        fail("unexpected remaining JSZip blob output count=" + blobTypeCount);
    }
    if (arrayBufferTypeCount !== expectedZipOutputCount) {
        fail("unexpected JSZip arraybuffer output count=" + arrayBufferTypeCount);
    }
    if (rawBlobArrayBufferCount !== 0) {
        fail("unexpected remaining raw blob.arrayBuffer count=" + rawBlobArrayBufferCount);
    }
    if (helperCallCount !== expectedZipOutputCount) {
        fail("unexpected zip buffer helper call count=" + helperCallCount);
    }
}

function patchManifest() {
    if (!fs.existsSync(manifestPath)) {
        return;
    }

    const manifest = readJson(manifestPath);
    manifest.whiteboardBridgePatch = {
        foundationWorkerZipOutput: "arraybuffer",
        reason: "iOS WKWebView worker cannot reliably read JSZip blob output",
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

function main() {
    if (!fs.existsSync(workerPath)) {
        fail("missing generated worker: " + workerPath);
    }

    const foundationVersion = verifyFoundationVersion();
    const source = fs.readFileSync(workerPath, "utf8");
    const patched = patchWorker(source);

    verifyPatchedWorker(patched);
    fs.writeFileSync(workerPath, patched);
    patchManifest();

    console.log(
        "[patch-foundation-worker] patched " +
            path.relative(rootDir, workerPath) +
            " for agora-foundation@" +
            foundationVersion,
    );
}

main();
