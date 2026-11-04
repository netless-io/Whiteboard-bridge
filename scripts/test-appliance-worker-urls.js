const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const compiled = ts.transpileModule(fs.readFileSync(path.join(root, "src/bridge/ApplianceWorkerUrls.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const tests = [];
const test = (name, run) => tests.push({ name, run });
const plain = value => JSON.parse(JSON.stringify(value));
function deferred() {
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    return { promise, resolve, reject };
}
function runtime() {
    const counts = { full: 0, sub: 0 }, blobs = [], modules = {};
    const module = { exports: {} };
    vm.runInNewContext(compiled, {
        module, exports: module.exports, Promise,
        require(id) {
            const kind = id.includes("fullWorker") ? "full" : "sub";
            counts[kind]++;
            return modules[kind] || { default: `${kind} worker source` };
        },
        Blob: class { constructor(parts, options) { this.parts = parts; this.type = options.type; } },
        URL: { createObjectURL(blob) { blobs.push(blob); return `blob:local/${blobs.length}`; } },
    });
    return { ...module.exports, counts, blobs, modules };
}

test("module initialization does not load either source or create a Blob", () => {
    const r = runtime();
    assert.deepEqual(r.counts, { full: 0, sub: 0 });
    assert.equal(r.blobs.length, 0);
});
test("default simple mode loads only Full and uses JavaScript MIME", async () => {
    const r = runtime();
    assert.deepEqual(plain(await r.getApplianceWorkerUrls({})), { fullWorkerUrl: "blob:local/1" });
    assert.deepEqual(r.counts, { full: 1, sub: 0 });
    assert.deepEqual(r.blobs[0].parts[0], "full worker source");
    assert.equal(r.blobs[0].type, "text/javascript");
});
test("concurrent probe/Room callers share source loading and Blob creation", async () => {
    const r = runtime(), pending = deferred();
    let loads = 0, blobs = 0;
    const provider = new r.ApplianceWorkerUrlProvider(() => { loads++; return pending.promise; },
        () => { throw Error("unused Sub"); }, () => `blob:${++blobs}`);
    const first = provider.get({}), second = provider.get({});
    await Promise.resolve();
    assert.equal(loads, 1);
    pending.resolve({ default: "full" });
    assert.deepEqual(plain(await first), plain(await second));
    assert.equal(blobs, 1);
    await provider.get({});
    assert.equal(loads, 1);
    assert.equal(blobs, 1);
});
test("switching simple -> dual -> simple only adds Sub once", async () => {
    const r = runtime();
    const first = await r.getApplianceWorkerUrls({});
    const dual = await r.getApplianceWorkerUrls({ extras: { useSimple: false } });
    assert.equal(dual.fullWorkerUrl, first.fullWorkerUrl);
    assert.ok(dual.subWorkerUrl);
    assert.deepEqual(plain(await r.getApplianceWorkerUrls({})), plain(first));
    await r.getApplianceWorkerUrls({ extras: { useSimple: false } });
    assert.deepEqual(r.counts, { full: 1, sub: 1 });
    assert.equal(r.blobs.length, 2);
});
test("dual mode starts both local imports in parallel", async () => {
    const r = runtime(), full = deferred(), sub = deferred(), calls = [];
    const provider = new r.ApplianceWorkerUrlProvider(() => { calls.push("full"); return full.promise; },
        () => { calls.push("sub"); return sub.promise; }, source => `blob:${source}`);
    const result = provider.get({ extras: { useSimple: false } });
    await Promise.resolve();
    assert.deepEqual(calls, ["full", "sub"]);
    full.resolve({ default: "full" }); sub.resolve({ default: "sub" });
    assert.deepEqual(plain(await result), { fullWorkerUrl: "blob:full", subWorkerUrl: "blob:sub" });
});
test("Native numeric booleans and other serialized values match plugin truthiness", async () => {
    for (const value of [false, 0, null, "", true, 1, "false", undefined]) {
        for (const remote of [false, true]) {
            const r = runtime();
            await r.getApplianceWorkerUrls(remote ? {} : { extras: { useSimple: value } },
                remote ? { useSimple: value } : undefined);
            assert.equal(r.counts.sub, value === undefined || Boolean(value) ? 0 : 1);
        }
    }
});
test("explicit mainThread skips both imports, including after previous Worker use", async () => {
    const r = runtime();
    assert.deepEqual(plain(await r.getApplianceWorkerUrls({ extras: { useWorker: "mainThread", useSimple: false } })), {});
    assert.deepEqual(r.counts, { full: 0, sub: 0 });
    await r.getApplianceWorkerUrls({});
    assert.deepEqual(plain(await r.getApplianceWorkerUrls({ extras: { useWorker: "mainThread" } })), {});
    assert.deepEqual(r.counts, { full: 1, sub: 0 });
});
test("OSS flags apply when local flags are absent; explicit local values win", async () => {
    for (const [local, remote, expected] of [
        [{}, { useSimple: false }, { full: 1, sub: 1 }],
        [{ useSimple: true }, { useSimple: false }, { full: 1, sub: 0 }],
        [{ useSimple: false }, { useSimple: true }, { full: 1, sub: 1 }],
        [{}, { useWorker: "mainThread" }, { full: 0, sub: 0 }],
        [{ useWorker: "auto" }, { useWorker: "mainThread" }, { full: 1, sub: 0 }],
        [{ useWorker: "mainThread" }, { useWorker: "auto", useSimple: false }, { full: 0, sub: 0 }],
    ]) {
        const r = runtime();
        await r.getApplianceWorkerUrls({ extras: local }, remote);
        assert.deepEqual(r.counts, expected);
    }
});
test("factory provenance keeps defaults below OSS and explicit flags above OSS", async () => {
    for (const [explicit, expectedSub] of [[{}, 1], [{ useSimple: true }, 0]]) {
        const r = runtime(), extras = { useSimple: true, ...explicit };
        Object.defineProperty(extras, "__netlessDynamicConfigLayers", {
            value: { version: 1, defaults: { useSimple: true }, explicit },
        });
        await r.getApplianceWorkerUrls({ extras }, { useSimple: false });
        assert.equal(r.counts.sub, expectedSub);
    }
});
test("custom cdn overrides, including empty/partial values, never load bundled sources", async () => {
    for (const cdn of [{}, { fullWorkerUrl: "file:custom" }, { fullWorkerUrl: "blob:host/full", subWorkerUrl: "blob:host/sub" }]) {
        const r = runtime();
        assert.strictEqual(await r.getApplianceWorkerUrls({ cdn, extras: { useSimple: false } }), cdn);
        assert.deepEqual(r.counts, { full: 0, sub: 0 });
        assert.equal(r.blobs.length, 0);
    }
});
test("failed imports reject all waiters and retry successfully", async () => {
    const r = runtime(), pending = deferred();
    let loads = 0;
    const provider = new r.ApplianceWorkerUrlProvider(() => ++loads === 1 ? pending.promise : Promise.resolve({ default: "full" }),
        () => { throw Error("unused"); }, () => "blob:full");
    const rejected = [provider.get({}), provider.get({})].map(p => assert.rejects(p, /missing chunk/));
    pending.reject(Error("missing chunk"));
    await Promise.all(rejected);
    assert.equal(loads, 1);
    assert.equal((await provider.get({})).fullWorkerUrl, "blob:full");
    assert.equal(loads, 2);
});
test("Sub failure retains successful Full and retries only Sub", async () => {
    const r = runtime(); let full = 0, sub = 0;
    const provider = new r.ApplianceWorkerUrlProvider(async () => { full++; return { default: "full" }; },
        async () => { if (++sub === 1) throw Error("Sub missing"); return { default: "sub" }; }, source => `blob:${source}`);
    await assert.rejects(provider.get({ extras: { useSimple: false } }), /Sub missing/);
    assert.deepEqual(plain(await provider.get({ extras: { useSimple: false } })), { fullWorkerUrl: "blob:full", subWorkerUrl: "blob:sub" });
    assert.equal(full, 1); assert.equal(sub, 2);
});
test("invalid sources and Blob failures do not poison retry cache", async () => {
    for (const invalid of [undefined, "", 42]) {
        const r = runtime(); let loads = 0;
        const provider = new r.ApplianceWorkerUrlProvider(async () => ({ default: ++loads === 1 ? invalid : "full" }),
            () => { throw Error("unused"); }, () => "blob:full");
        await assert.rejects(provider.get({}), /Invalid appliance full Worker source/);
        assert.equal((await provider.get({})).fullWorkerUrl, "blob:full");
    }
    const r = runtime(); let attempts = 0;
    const provider = new r.ApplianceWorkerUrlProvider(async () => ({ default: "full" }),
        () => { throw Error("unused"); }, () => { if (++attempts === 1) throw Error("Blob failed"); return "blob:ok"; });
    await assert.rejects(provider.get({}), /Blob failed/);
    assert.equal((await provider.get({})).fullWorkerUrl, "blob:ok");
});

(async () => {
    for (const { name, run } of tests) { await run(); console.log(`PASS ${name}`); }
    console.log(`Appliance Worker URL tests: ${tests.length} passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
