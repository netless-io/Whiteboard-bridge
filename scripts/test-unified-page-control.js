const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

const testEntry = path.resolve(__dirname, "../test/UnifiedPageControl.test.ts");
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), "whiteboard-bridge-unified-page-"));
const outfile = path.join(outdir, "unified-page-control.test.js");

async function main() {
    await esbuild.build({
        entryPoints: [testEntry],
        outfile,
        bundle: true,
        platform: "node",
        format: "cjs",
        target: "node14",
        sourcemap: "inline",
    });
    try {
        require(outfile);
    } finally {
        fs.rmSync(outdir, { recursive: true, force: true });
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
