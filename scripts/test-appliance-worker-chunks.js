// Exercise the real Babel + production splitChunks rules, without a network or device.
const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const webpack = require("webpack");
const acorn = require("acorn");

const root = path.resolve(__dirname, "..");
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-worker-chunks-"));
const dist = path.join(fixture, "build");
const workerDir = path.join(fixture, "node_modules/@netless/appliance-plugin/dist");
const sources = { full: 'self.postMessage("FULL_WORKER_SENTINEL");', sub: 'self.postMessage("SUB_WORKER_SENTINEL");' };

function runFilePage(html, baseURI, failFirstFull = false) {
    const requests = [], blobs = [], scripts = [];
    let failNext = failFirstFull;
    const context = vm.createContext({ console, Promise: undefined, setTimeout, clearTimeout, Blob,
        URL: { createObjectURL(blob) { blobs.push(blob); return `blob:local/${blobs.length}`; } },
    });
    context.window = context; context.self = context;
    const head = {
        appendChild(script) {
            scripts.push(script); script.parentNode = head;
            const url = new URL(script.src, baseURI);
            assert.ok(url.protocol === "file:" || url.protocol === "resource:", `Unexpected network request ${url}`);
            requests.push(url.href);
            queueMicrotask(() => {
                if (failNext && url.href.includes("full-source")) {
                    failNext = false;
                    script.onerror?.({ type: "error", target: script });
                    return;
                }
                try {
                    vm.runInContext(fs.readFileSync(path.join(dist, path.basename(url.pathname)), "utf8"), context);
                    script.onload?.({ type: "load", target: script });
                } catch (error) { script.onerror?.({ type: "error", target: script }); }
            });
        },
        removeChild(script) { scripts.splice(scripts.indexOf(script), 1); script.parentNode = null; },
    };
    context.document = {
        baseURI, head,
        getElementsByTagName: () => scripts,
        createElement: () => ({ setAttribute(name, value) { this[name] = value; }, getAttribute(name) { return this[name]; } }),
    };
    for (const [, file] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
        vm.runInContext(fs.readFileSync(path.join(dist, file), "utf8"), context);
    }
    return { requests, blobs, get: options => context.getWorkerUrls(options) };
}

async function main() {
    fs.mkdirSync(workerDir, { recursive: true });
    for (const [kind, text] of Object.entries(sources)) fs.writeFileSync(path.join(workerDir, `${kind}Worker.js`), text);
    const pluginEntry = path.join(workerDir, "appliance-plugin.js");
    fs.writeFileSync(pluginEntry, "window.pluginFixtureLoaded = true;");
    fs.writeFileSync(path.join(fixture, "entry.ts"),
        `import "core-js/stable";
         import "core-js/features/promise/all-settled";
         import "regenerator-runtime/runtime";
         import ${JSON.stringify(pluginEntry)};
         import { getApplianceWorkerUrls } from ${JSON.stringify(path.join(root, "src/bridge/ApplianceWorkerUrls"))};
         window.getWorkerUrls = getApplianceWorkerUrls;`);
    const bridgeConfig = require("../webpack.config")({}, { mode: "production" });
    bridgeConfig.mode = "production";
    bridgeConfig.entry = path.join(fixture, "entry.ts");
    bridgeConfig.output = { ...bridgeConfig.output, path: dist };
    bridgeConfig.cache = false;
    bridgeConfig.resolve.modules = [path.join(root, "node_modules"), "node_modules"];
    // Parsing the wrapper alone cannot detect modern syntax inside a raw string.
    for (const kind of ["full", "sub"]) {
        const actual = bridgeConfig.resolve.alias[`@netless/appliance-plugin/dist/${kind}Worker.js`];
        acorn.parse(fs.readFileSync(actual, "utf8"), { ecmaVersion: 5 });
    }
    bridgeConfig.resolve.alias["@netless/appliance-plugin/dist/fullWorker.js"] = path.join(workerDir, "fullWorker.js");
    bridgeConfig.resolve.alias["@netless/appliance-plugin/dist/subWorker.js"] = path.join(workerDir, "subWorker.js");
    const stats = await new Promise((resolve, reject) => webpack(bridgeConfig, (error, result) => {
        if (error) reject(error);
        else if (result.hasErrors()) reject(Error(result.toString({ all: false, errors: true })));
        else resolve(result);
    }));
    const data = stats.toJson({ all: false, chunks: true, assets: true });
    const initialFiles = data.chunks.filter(chunk => chunk.initial).flatMap(chunk => chunk.files).filter(file => file.endsWith(".js"));
    const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
    for (const kind of ["full", "sub"]) {
        const name = `appliance-worker-${kind}-source`;
        const chunk = data.chunks.find(chunk => chunk.names.includes(name));
        assert.ok(chunk, `Missing ${name}; Babel or splitChunks may have made it eager`);
        assert.equal(chunk.initial, false);
        assert.ok(!html.includes(name), "Worker source chunk must not be preloaded by HTML");
    }
    for (const asset of data.assets.filter(asset => asset.name.endsWith(".js"))) {
        const text = fs.readFileSync(path.join(dist, asset.name), "utf8");
        if (initialFiles.includes(asset.name)) {
            assert.ok(!text.includes("WORKER_SENTINEL"), `${asset.name} includes eager Worker source`);
        }
        acorn.parse(text, { ecmaVersion: 5 });
    }
    for (const baseURI of ["file:///app/Whiteboard.bundle/index.html", "resource://rawfile/whiteboard/index.html"]) {
        const page = runFilePage(html, baseURI);
        assert.equal(page.requests.length, 0);
        await page.get({ extras: { useWorker: "mainThread" } });
        assert.equal(page.requests.length, 0);
        const full = await page.get({});
        assert.equal(page.requests.length, 1);
        assert.ok(page.requests[0].includes("full-source"));
        assert.equal(await page.blobs[0].text(), sources.full);
        assert.equal(page.blobs[0].type, "text/javascript");
        assert.equal((await page.get({})).fullWorkerUrl, full.fullWorkerUrl);
        assert.equal(page.requests.length, 1);
        await page.get({ extras: { useSimple: 0 } });
        assert.equal(page.requests.length, 2);
        assert.ok(page.requests[1].includes("sub-source"));
        assert.equal(await page.blobs[1].text(), sources.sub);
    }
    const retry = runFilePage(html, "file:///app/Whiteboard.bundle/index.html", true);
    await assert.rejects(retry.get({}), /Loading chunk/);
    assert.equal(retry.blobs.length, 0);
    await retry.get({});
    assert.equal(retry.requests.length, 2);
    assert.equal(retry.blobs.length, 1);
    console.log("PASS production chunks stay async and separate; emitted JS and installed Worker sources remain ES5");
    console.log("PASS file/rawfile script loading is local, lazy, cached and retryable; Blob source bytes match");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    fs.rmSync(fixture, { recursive: true, force: true });
});
