const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

const testEntry = path.resolve(__dirname, "../test/SlidePerformanceDefaults.test.ts");
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), "whiteboard-bridge-slide-performance-"));
const outfile = path.join(outdir, "slide-performance-defaults.test.js");

async function main() {
    fs.mkdirSync(outdir, { recursive: true });
    await esbuild.build({
        entryPoints: [testEntry],
        outfile,
        bundle: true,
        platform: "node",
        format: "cjs",
        target: "node14",
        sourcemap: "inline",
        plugins: [{
            name: "appliance-plugin-enum-stub",
            setup(build) {
                build.onResolve({ filter: /^@netless\/appliance-plugin$/ }, () => ({
                    path: "appliance-plugin-enum-stub",
                    namespace: "test-stub",
                }));
                build.onLoad({ filter: /.*/, namespace: "test-stub" }, () => ({
                    contents: `
                        exports.WorkerRenderModeBlacklistLevel = {
                            OffscreenTransfer: 1,
                            ImageBitmap: 2,
                        };
                    `,
                    loader: "js",
                }));
            },
        }],
    });
    try {
        require(outfile);
    } finally {
        fs.rmSync(outdir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
