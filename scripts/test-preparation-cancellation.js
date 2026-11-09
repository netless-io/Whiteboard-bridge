// Run the production join handler and Lifecycle with stalled preparation I/O.
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm'), ts = require('typescript');
const root = path.join(__dirname, '../src/bridge');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const source = ts.createSourceFile('SDK.ts', fs.readFileSync(path.join(root, 'SDK.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
let joinSource;
(function visit(node) { if (ts.isPropertyDeclaration(node) && node.name.getText(source) === 'joinRoom') joinSource = node.initializer.getText(source); ts.forEachChild(node, visit); })(source);
const flush = async () => { for (let n = 0; n < 30; n++) await Promise.resolve(); };
function deferred() { let resolve, reject; const task = new Promise((yes, no) => { resolve = yes; reject = no; }); return { task, resolve, reject }; }
function environment(stage) {
    const timers = new Set(), mod = { exports: {} };
    vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'Lifecycle.ts'), 'utf8')), { module: mod, exports: mod.exports,
        setTimeout(fn) { const timer = { fn }; timers.add(timer); return timer; }, clearTimeout(timer) { timers.delete(timer); } });
    const life = mod.exports, owner = new life.Lifecycle(), resources = deferred(), required = deferred();
    const events = [], replies = []; let transports = 0, probes = 0, resolves = 0, disconnects = 0, initialized = 0;
    const scope = generation => ({ documentId: life.documentId, generation });
    const room = { useMultiViews: true, state: {}, phase: 'connected', async disconnect() { disconnects++; this.phase = 'disconnected'; } };
    const preparation = { mark: e => events.push(e), prepare() { probes++; throw Error('optional preparation must never gate join'); },
        resolveForRoom() { resolves++; return stage === 'required' ? required.task : Promise.resolve({ cdn: { fullWorkerUrl: 'blob:full' } }); } };
    const sdk = { prepareRoomResources: () => resources.task, __nativePreparation: preparation, async joinRoom() { transports++; return stage === 'resources' ? resources.task : room; } };
    const handler = { exports: {} };
    vm.runInNewContext(compile('module.exports = ' + joinSource), { module: handler, sdk, lifecycle: owner, currentScope: () => scope(1),
        nativeConfig: { enableAppliancePlugin: true, useMultiViews: true }, cursorAdapter: undefined, room: undefined, window: {},
        splitNativeConfiguration: input => ({ defaults: {}, explicit: input }), resolveNativeConfiguration: input => input, withDynamicConfigDefaults: (a, b) => ({ ...a, ...b }),
        RoomCallbackHandler: class {}, SDKCallbackHandler: class {}, WindowManager: { supportAppliancePlugin: true },
        ApplianceMultiPlugin: { async getInstance(_manager, { options }) { assert.equal(options.cdn.fullWorkerUrl, 'blob:full'); initialized++; return { async destroy() {} }; } },
        mountWindowManager: async () => ({ destroy() {} }), createAppState: () => ({}), registerBridgeRoom() {}, convertBound: x => x,
        inScope: life.inScope, failure: life.failure });
    const joining = handler.exports({ uuid: 'fixture-room', roomToken: 'fixture-token', uid: 'fixture-user' }, value => replies.push(JSON.parse(value)));
    return { owner, scope, timers, resources, required, events, replies, joining, fakeRoom: room, stats: () => ({ transports, probes, resolves, disconnects, initialized }) };
}
(async () => {
    {
        const e = environment('resources');
        const closing = e.owner.leave(e.scope(1)); await flush();
        e.resources.resolve(e.fakeRoom); await e.joining; await closing;
        assert.equal(e.owner.state, 'idle'); assert.equal(e.timers.size, 0);
        assert.equal(e.stats().transports, 1); assert.equal(e.stats().probes, 0);
        assert.equal(e.stats().disconnects, 1);
        assert.equal(e.replies.length, 1); assert.equal(e.replies[0].__error.code, 'Cancelled');
        console.log('PASS cancellation during SDK join disconnects a late Room');
    }
    for (const failLate of [false, true]) {
        const e = environment('required'); e.resources.resolve({}); await flush();
        assert.equal(e.stats().transports, 1); assert.equal(e.stats().resolves, 1); assert.equal(e.stats().probes, 0);
        const closing = e.owner.leave(e.scope(1)); await flush();
        assert.equal(e.stats().disconnects, 1, 'already acquired room disconnects before stalled resource initialization finishes');
        if (failLate) e.required.reject(Error('real resource failed')); else e.required.resolve({});
        await e.joining; await closing;
        assert.equal(e.stats().initialized, 0); assert.equal(e.owner.state, 'idle'); assert.equal(e.replies.length, 1);
        console.log('PASS leave during real initialization disconnects immediately and ignores late ' + (failLate ? 'failure' : 'success'));
    }
    {
        const e = environment('normal'); e.resources.resolve({}); await e.joining;
        assert.equal(e.stats().transports, 1); assert.equal(e.stats().probes, 0); assert.equal(e.stats().initialized, 1);
        assert.equal(e.owner.state, 'active'); assert.equal(e.replies.length, 1); assert.equal(e.replies[0].__error, undefined);
        await e.owner.leave(e.scope(1));
        console.log('PASS optional failed/pending probe cannot block actual connection and normal plugin initialization');
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
