// Execute the actual RoomAsyncBridge class; the WindowManager is controlled.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert').strict;
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/bridge/Room.ts'), 'utf8');
const ast = ts.createSourceFile('Room.ts', source, ts.ScriptTarget.Latest, true);
const declaration = ast.statements.find(n => n.name && n.name.text === 'RoomAsyncBridge').getText(ast);
const code = ts.transpileModule(declaration, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
function environment(manager) {
  const context = { exports: {}, window: { manager }, scopedCall: () => () => {} };
  vm.runInNewContext(code, context);
  return new context.exports.RoomAsyncBridge({});
}
async function response(bridge, api, args = []) {
  let count = 0, value;
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(api + ' did not reply')), 500);
      bridge[api](...args, result => { count++; value = result; resolve(); });
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(count, 1, api + ' must reply exactly once');
    return value;
  } finally { clearTimeout(timer); }
}
let checks = 0;
async function main() {
  const absent = environment(undefined);
  for (const api of ['queryApp', 'queryAllApps', 'closeApp']) {
    const value = await response(absent, api, api === 'queryAllApps' ? [] : ['id']);
    assert.equal(JSON.parse(value).__error.message, 'window manager not existed'); checks++;
  }
  for (const apps of [undefined, {}, { id: { kind: 'Slide' } }]) {
    const value = await response(environment({ apps }), 'queryAllApps');
    assert.equal(typeof value, 'string'); assert.deepEqual(JSON.parse(value), apps || {}); checks++;
  }
  const normal = environment({ apps: { id: { kind: 'Slide' } }, closeApp: async () => {}, nextPage: async () => true, prevPage: async () => false });
  assert.deepEqual(JSON.parse(await response(normal, 'queryApp', ['id'])), { kind: 'Slide' }); checks++;
  assert.equal(await response(normal, 'closeApp', ['id']), undefined); checks++;
  assert.equal(await response(normal, 'nextPage'), true); checks++;
  assert.equal(await response(normal, 'prevPage'), false); checks++;
  const unhandled = []; const listener = error => unhandled.push(error);
  process.on('unhandledRejection', listener);
  try {
    for (const api of ['closeApp', 'nextPage', 'prevPage']) for (const reason of [new Error('synthetic failure'), 'string rejection', null]) {
      const bridge = environment({ [api]: () => Promise.reject(reason) });
      const value = await response(bridge, api, api === 'closeApp' ? ['id'] : []);
      const error = JSON.parse(value).__error;
      assert.equal(error.message, reason instanceof Error ? reason.message : String(reason));
      if (reason instanceof Error) assert.equal(error.jsStack, reason.stack);
      checks++;
    }
    assert.deepEqual(unhandled, []);
  } finally { process.removeListener('unhandledRejection', listener); }
  console.log(checks + ' Room API return contract checks passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
