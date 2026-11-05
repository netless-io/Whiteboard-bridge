const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm'), ts = require('typescript');
const mod = { exports: {} };
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/bridge/PreloadCompletion.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
Function('module', 'exports', code)(mod, mod.exports);
const { collectPreloadResults, preloadSuccess, configurationKey } = mod.exports;
(async () => {
    assert.deepEqual(await collectPreloadResults([]), { state: 'success', message: '' });
    let finish, emitted = 0;
    const pending = new Promise(resolve => { finish = resolve; });
    const observed = collectPreloadResults([Promise.resolve(preloadSuccess()), pending, Promise.resolve({ state: 'warn', message: 'Slide failed' })]);
    observed.then(() => emitted++); await Promise.resolve(); assert.equal(emitted, 0);
    finish({ state: 'warn', message: 'render deferred' });
    assert.deepEqual(await observed, { state: 'warn', message: 'render deferred；Slide failed' });
    await Promise.resolve(); assert.equal(emitted, 1);
    await collectPreloadResults([Promise.resolve(preloadSuccess())]);
    assert.equal((await observed).state, 'warn', 'normal retry cannot mutate an already observed constructor result');
    assert.equal(configurationKey({ b: 1, a: { y: true, x: false } }), configurationKey({ a: { x: false, y: true }, b: 1 }));
    assert.notEqual(configurationKey({ preloadBuiltinApps: [] }), configurationKey({}));
    console.log('PASS preload completion waits enabled tasks, combines warnings once, preserves original result and configuration identity');
    const source = ts.createSourceFile('SDK.ts', fs.readFileSync(path.join(__dirname, '../src/bridge/SDK.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
    let observe, register;
    (function visit(node) {
        if (ts.isPropertyDeclaration(node) && node.name.getText(source) === 'observePreload') observe = node.initializer.getText(source);
        if (ts.isCallExpression(node) && node.expression.getText(source) === 'WindowManager.register' && node.arguments[0].getText(source).includes('kind: slideKind')) register = node.getText(source);
        ts.forEachChild(node, visit);
    })(source);
    const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
    let settle;
    const config = { preloadBuiltinApps: [] }, replies = [];
    const context = vm.createContext({ configurationKey, sdkConfigurationJson: configurationKey(config), sdk: { __nativePreloadResult: new Promise(resolve => settle = resolve) }, failure: message => JSON.stringify({ __error: { message } }) });
    const observeHandler = vm.runInContext(compile('globalThis.handler = ' + observe), context);
    observeHandler({ preloadBuiltinApps: ['Slide'] }, value => replies.push(JSON.parse(value)));
    assert.equal(replies[0].__error.message, 'StaleSdk');
    observeHandler(config, value => replies.push(JSON.parse(value)));
    context.sdk = { __nativePreloadResult: Promise.resolve(preloadSuccess()) };
    settle(preloadSuccess()); await Promise.resolve();
    assert.equal(replies[1].__error.message, 'StaleSdk', 'replacement cannot receive previous SDK completion');
    observeHandler(config, value => replies.push(JSON.parse(value))); await Promise.resolve();
    assert.deepEqual(replies[2], preloadSuccess());
    console.log('PASS actual observePreload rejects wrong config and late SDK results');
    for (const slideAppOptions of [{}, { enableSharedMediaVolume: false }, { enableSharedMediaVolume: true }]) {
        let registered;
        vm.runInNewContext(compile(register), { WindowManager: { register: value => registered = value }, slideKind: 'Slide', slideAppOptions,
            slidePerformanceOptions: {}, slideUrlInterrupter: undefined, addHooksSlide: undefined, sdkCallbackHandler: {}, SlideApp: {} });
        assert.equal(registered.appOptions.enableSharedMediaVolume, slideAppOptions.enableSharedMediaVolume === true);
        assert.equal(typeof registered.appOptions.enableSharedMediaVolume, 'boolean');
    }
    console.log('PASS actual Slide registration defaults shared media volume to false and preserves true/false');

})().catch(error => { console.error(error); process.exitCode = 1; });
