// Execute the production join handler and Lifecycle while dependency I/O stalls.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const root = path.join(__dirname, '../src/bridge');
const compile = source => ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const sdk = fs.readFileSync(path.join(root, 'SDK.ts'), 'utf8');
const ast = ts.createSourceFile('SDK.ts', sdk, ts.ScriptTarget.Latest, true);
let joinSource;
function visit(node) {
    if (ts.isPropertyDeclaration(node) && node.name.getText(ast) === 'joinRoom') joinSource = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(joinSource);
const flush = async () => { for (let turn = 0; turn < 25; turn++) await Promise.resolve(); };

async function run(stage, failLate) {
    const timers = new Set(), mod = { exports: {} };
    const clock = {
        setTimeout(fn) { const timer = { fn }; timers.add(timer); return timer; },
        clearTimeout(timer) { timers.delete(timer); },
    };
    vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'Lifecycle.ts'), 'utf8')), {
        module: mod, exports: mod.exports, ...clock,
    });
    const life = mod.exports, owner = new life.Lifecycle();
    let resolveResource, resolvePlugin, rejectPlugin;
    const resources = new Promise(resolve => { resolveResource = resolve; });
    const plugin = new Promise((resolve, reject) => { resolvePlugin = resolve; rejectPlugin = reject; });
    const events = [], replies = [];
    let appPrepares = 0, transports = 0;
    const scope = generation => ({ documentId: life.documentId, generation });
    const preparingSdk = {
        prepareRoomResources: () => resources,
        __nativePreparation: {
            mark: event => events.push(event),
            prepare: () => { appPrepares++; return stage === 'plugin' ? plugin : Promise.resolve({}); },
        },
        joinRoom: () => { transports++; throw Error('cancelled join started a transport'); },
    };
    const handler = { exports: {} };
    vm.runInNewContext(compile('module.exports = ' + joinSource), {
        module: handler, sdk: preparingSdk, lifecycle: owner,
        currentScope: () => scope(1), nativeConfig: {}, cursorAdapter: undefined, window: {},
        splitNativeConfiguration: input => ({ defaults: {}, explicit: input }),
        RoomCallbackHandler: class {}, failure: life.failure,
    });
    const joining = handler.exports({ uuid: 'fixture-room', roomToken: 'fixture-token', uid: 'fixture-user' }, value => replies.push(JSON.parse(value)));
    if (stage === 'plugin') { resolveResource({}); await flush(); assert.equal(appPrepares, 1); }
    await owner.leave(scope(1));
    assert.equal(owner.state, 'idle');
    assert.equal(timers.size, 0, 'cancel completes without leaving a 20s or join timer');
    const replacement = owner.begin('room', scope(2), () => {});
    if (stage === 'resources') resolveResource({});
    else if (failLate) rejectPlugin(Error('late worker error'));
    else resolvePlugin({});
    await joining;
    assert.equal(transports, 0);
    assert.equal(appPrepares, stage === 'resources' ? 0 : 1, 'late preparation must not start/retry App or Worker work');
    assert.equal(owner.state, 'joining'); assert.strictEqual(owner.task, replacement);
    assert.equal(replies.length, 1); assert.equal(replies[0].__error.code, 'Cancelled');
    assert.ok(!events.includes('connectStarted'));
    console.log(`PASS cancel during ${stage}${failLate ? ' with late failure' : ''}: immediate close, replacement safe, no late transport`);
}

(async () => {
    await run('resources', false);
    await run('plugin', false);
    await run('plugin', true);
    console.log('3 production join cancellation tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
