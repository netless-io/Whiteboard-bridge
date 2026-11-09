// Workspace integration: actual Bridge setup/mount/join methods and candidate consumers.
// Transport and rendering are isolated; no OSS, AI, device or production bundle.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { build, transform } = require('esbuild');

async function main() {
    const root = path.resolve(__dirname, '..');
    const source = fs.readFileSync(path.join(root, 'src/bridge/SDK.ts'), 'utf8');
    function extract(start, end) {
        const a = source.indexOf(start), b = source.indexOf(end, a);
        assert(a >= 0 && b > a, `Missing source boundaries: ${start}`);
        return source.slice(a, b);
    }
    const helpers = await build({
        stdin: {
            contents: `
                export { mergeDynamicJoinRoomParameters } from './scripts/fixtures/upstream/white-web-sdk-2.16.63-parameters';
                export { applyDynamicMountParams } from '@netless/window-manager/src/Utils/dynamicConfig';
                export { withDynamicConfigDefaults, splitNativeConfiguration, resolveNativeConfiguration } from './src/bridge/DynamicConfigParameters';
                export { mergeDefaultAppliancePluginExtras } from './src/bridge/AppliancePluginDefaults';
                export { collectPreloadResults, configurationKey, preloadSuccess } from './src/bridge/PreloadCompletion';
                export { Lifecycle, currentScope, documentId, failure, inScope } from './src/bridge/Lifecycle';
                export { ApplianceWorkerUrlProvider } from './src/bridge/ApplianceWorkerUrls';
                export { mergeApplianceDynamicExtras } from './scripts/fixtures/upstream/appliance-plugin-1.1.49-dynamicConfig';
            `,
            resolveDir: root, loader: 'ts',
        },
        bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node14',
        plugins: [{ name: 'worker-source-stubs', setup(build) {
            build.onResolve({ filter: /\?raw$/ }, args => ({ path: args.path, namespace: 'worker-source-stub' }));
            build.onLoad({ filter: /.*/, namespace: 'worker-source-stub' }, () => ({ contents: 'test Worker source', loader: 'text' }));
        } }],
    });
    const mod = { exports: {} };
    new Function('module', 'exports', helpers.outputFiles[0].text)(mod, mod.exports);
    const compiled = await transform(`
        let sdk, room, player, nativeConfig, cursorAdapter, sdkConfigurationJson;
        ${fs.readFileSync(path.join(root, "src/bridge/RoomPreparation.ts"), "utf8").replace(/^import .*$/gm, "").replace(/\bexport /g, "")}
        ${extract('function removeBind()', 'function toBuiltinAppOptions(')}
        ${extract('function toBuiltinAppOptions(', 'class SDKBridge')}
        class Harness {
            ${extract('    newWhiteSdk =', '    replayRoom =')}
        }
        return { bridge: new Harness(), globals: () => ({sdk, room, player, nativeConfig, cursorAdapter}) };
    `, { loader: 'ts', target: 'es2020' });

    function scenario(options = {}) {
        const events = [], rooms = [], styles = [], window = { fullScreen: 'previous' };
        let joined, mounted, sdkConfiguration;
        const lifecycle = new mod.exports.Lifecycle();
        const workerLoads = { full: 0, sub: 0 }, workerBlobs = [];
        const workerUrls = new mod.exports.ApplianceWorkerUrlProvider(async () => {
            workerLoads.full++;
            events.push("worker.full");
            options.onWorkerLoad?.();
            await options.workerDelay;
            if (options.failWorkerLoad) throw Error('worker chunk missing');
            return { default: 'full' };
        }, async () => {
            workerLoads.sub++;
            events.push("worker.sub");
            return { default: 'sub' };
        }, source => { workerBlobs.push(source); return `blob:${source}`; });
        let applianceOptions;
        const appliancePreparations = [], appSelections = [];
        let generation = 0;
        class CursorTool { setRoom(value) { events.push('cursor.setRoom'); } }
        class WindowManager {
            static register() {}
            static async preloadApps(kinds) {
                appSelections.push([...kinds]);
                if (options.failApps) throw Error("unused custom App loader failed");
                if (options.hangApps) await new Promise(() => {});
            }
            static async mount(params) {
                mounted = mod.exports.applyDynamicMountParams(params, true);
                assert(params.room.useMultiViews);
                events.push('manager.mount');
                if (options.failMount) throw Error('mount failed');
                WindowManager.supportAppliancePlugin = mounted.supportAppliancePlugin;
                return {
                    boxState: 'normal', cameraState: {}, sceneState: {}, pageState: {},
                    setMaximized() { events.push('manager.maximize'); },
                    destroy() { events.push('manager.destroy'); if (options.failManagerCleanup) throw Error('cleanup failed'); },
                };
            }
        }
        class WhiteWebSdk {
            constructor(config) { sdkConfiguration = config; }
            __observeDynamicConfigPreload() {
                assert(sdkConfiguration.dynamicConfig, 'off path cannot register a dynamic observer');
                return options.hangDynamic ? new Promise(() => {}) : Promise.resolve({ state: {source: options.remote ? 'remote' : 'local'}, parameters: options.remote });
            }
            async waitForDynamicConfigPreload() { await this.__observeDynamicConfigPreload(); return {state: 'success', message: ''}; }
            async waitForModelPreload() { return {state: 'success', message: ''}; }
            prepareDynamicConfig() { throw Error('Bridge must not call private config prepare'); }
            prepareRoomResources() { throw Error('Bridge must not call private resources prepare'); }
            async joinRoom(params) {
                joined = mod.exports.mergeDynamicJoinRoomParameters(options.remote?.joinRoom, params);
                events.push('sdk.joinRoom');
                if (joined.useMultiViews) {
                    assert(sdkConfiguration.useMobXState, 'MobX must be ready at setup');
                    assert(joined.invisiblePlugins.includes(WindowManager), 'WM must be registered before Room acquisition');
                    assert.equal(joined.cursorAdapter, undefined);
                }
                const result = {
                    useMultiViews: !!joined.useMultiViews, state: {}, phase: 'connected', observerId: rooms.length + 1, isWritable: true,
                    dynamicConfig: options.remote,
                    bindHtmlElement() {
                        events.push('room.bind');
                        if (this.useMultiViews) throw Error('you should pass useMultiViews: false');
                    },
                    async disconnect() { events.push('room.disconnect'); this.phase = 'disconnected'; },
                };
                rooms.push(result);
                return result;
            }
        }
        const scope = {
            ...mod.exports, lifecycle, window, document: {
                createElement: () => { const style = { remove() { styles.splice(styles.indexOf(style), 1); } }; return style; },
                body: { appendChild(style) { styles.push(style); return style; } },
            },
            console: { warn() {}, log() {}, info() {} }, navigator: { userAgent: '' },
            WhiteWebSdk, WindowManager, CursorTool, RoomCallbackHandler: class {}, SDKCallbackHandler: class {},
            sdkCallbackHandler: { onSetupFail(error) { throw error; } },
            mergeLocalLogOptions: value => value, enableReport() {}, hookCreateElement() {},
            createPlugins: () => ({ setPluginContext() {} }),
            videoPlugin: {}, audioPlugin: {}, videoPlugin2: {}, audioPlugin2: {}, videoJsPlugin: () => ({}),
            resolveSlidePerformanceOptions: () => ({}), addHooksSlide() {}, logger() {},
            validateBackgroundImageLoadOptions() {}, bindLocalLogStateChange() {}, convertBound: value => value,
            divRef: () => ({}), createAppState: () => ({}), createPageState: () => ({}),
            addManagerListener(manager) { window.manager = manager; if (options.failListener) throw Error('listener failed'); },
            registerBridgeRoom() { events.push('registerBridgeRoom'); if (options.failRegistration) throw Error('register failed'); },
            getApplianceWorkerUrls: (...args) => workerUrls.get(...args),
            prepareApplianceRendering: async options => {
                appliancePreparations.push(options);
                return { renderMode: 'main-thread', contextType: '2d' };
            },
            getAppliancePreparationGeneration: () => 0,
            postBackgroundImageLoadEvent() {}, postApplianceInitLoadingChange() {},
            ApplianceMultiPlugin: { async getInstance(manager, adaptor) {
                applianceOptions = adaptor.options;
                events.push('plugin.create');
                if (options.failPlugin) throw Error('plugin failed');
                return { async destroy() {
                    events.push('plugin.destroy');
                    options.onPluginDestroy?.();
                    await options.pluginDrain;
                    events.push('plugin.drained');
                    if (options.failPluginCleanup) throw Error('plugin cleanup failed');
                } };
            } },
            SyncedStorePlugin: {}, IframeBridge: {}, IframeWrapper: {},
            async initSyncedStore() {
                events.push('store.init');
                if (options.failStore) throw Error('store failed');
                const store = { destroy() { events.push('store.destroy'); } };
                window.syncedStore = store;
                return store;
            },
            destroySyncedStore() { window.syncedStore?.destroy(); window.syncedStore = undefined; },
        };
        const runtime = new Function(...Object.keys(scope), compiled.code)(...Object.values(scope));
        runtime.bridge.newWhiteSdk({ appIdentifier: 'test', dynamicConfig: { url: 'https://example.test/latest.json' }, ...(options.setup || {}) });
        return {
            options, events, rooms, window, styles, runtime, lifecycle, workerLoads, workerBlobs, appliancePreparations, appSelections,
            applianceOptions: () => applianceOptions,
            joined: () => joined, mounted: () => mounted, config: () => sdkConfiguration,
            async join(params = {}) {
                let responses = 0, result;
                await mod.exports.inScope({ documentId: mod.exports.documentId, generation: ++generation }, () =>
                    runtime.bridge.joinRoom({ uuid: 'room', uid: 'user', roomToken: 'test', ...params }, text => { responses++; result = JSON.parse(text); }));
                if (result?.__error && lifecycle.task?.closeResult) await lifecycle.task.closeResult.catch(() => {});
                assert.equal(responses, 1);
                return result;
            },
        };
    }

    // The constructor opt-in survives Native JSON and the production setup
    // handler, independently from multi-view and remote Room defaults.
    for (const enableModelPreload of [undefined, false, true]) {
        const setup = JSON.parse(JSON.stringify({ enableModelPreload }));
        const r = scenario({ setup });
        assert.equal(r.config().enableModelPreload, enableModelPreload);
        assert.equal(Object.hasOwn(r.config(), 'enableModelPreload'), enableModelPreload !== undefined);
    }
    console.log('Bridge model preload: constructor opt-in omission/false/true forwarded unchanged');
    for (const selection of [undefined, [], ['Slide'], ['Presentation', 'DocsViewer'], ['MediaPlayer', 'MediaPlayer']]) {
        const r = scenario({ setup: { preloadBuiltinApps: selection, enableModelPreload: false } });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(Object.hasOwn(r.config(), 'preloadBuiltinApps'), false, 'Native-only selection must not leak into Web SDK'
        );
        assert.deepEqual(r.appSelections, selection?.length ? [[...new Set(selection)]] : []);
        assert.equal((await r.join()).__error, undefined);
        assert.equal(r.rooms.length, 1);
    }
    console.log('Bridge App preload: default off, empty opt-out, selected kinds and duplicate normalization preserve normal join');
    const pendingConfig = scenario({ hangDynamic: true, setup: { enableModelPreload: false, preloadBuiltinApps: ['Slide', 'Presentation'] } });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(pendingConfig.appSelections, [['Slide', 'Presentation']], 'optional class warmup must start without waiting for remote configuration');
    const capturedKinds = ['Presentation'];
    const capturedSelection = scenario({ setup: { preloadBuiltinApps: capturedKinds } });
    capturedKinds.push('MediaPlayer');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(capturedSelection.appSelections, [['Presentation']], 'constructor captures an independent list snapshot');
    const invalidSelection = scenario({ setup: { preloadBuiltinApps: [] } });
    const existingSdk = invalidSelection.runtime.globals().sdk;
    for (const value of [false, 'Slide', ['slide'], ['custom']]) {
        let response;
        invalidSelection.runtime.bridge.newWhiteSdk({ appIdentifier: 'test', preloadBuiltinApps: value }, text => { response = JSON.parse(text); });
        assert(response.__error.message.includes('preloadBuiltinApps'));
        assert.strictEqual(invalidSelection.runtime.globals().sdk, existingSdk, 'invalid selection must not replace an existing SDK');
    }
    for (const failure of ['failApps', 'hangApps']) {
        const r = scenario({ [failure]: true, setup: {enableModelPreload:false,enableAppliancePlugin:false,useMultiViews:false,preloadBuiltinApps:['Slide']} });
        const result = await r.join();
        assert.equal(result.__error, undefined, failure + ' cannot gate an unrelated blank Room');
        assert.equal(r.rooms.length, 1);
    }
    console.log('Bridge optional App preload rejection/hang cannot block blank Room join');


    // Native SDK options must prepare the appliance renderer before any Room,
    // independently from the model-preload opt-in. Only the renderer boundary
    // is stubbed; execute the production constructor and RoomPreparation cache.
    const minimalAppliance = scenario({ setup: {enableAppliancePlugin:true, dynamicConfig:undefined} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(minimalAppliance.rooms.length, 0);
    assert.equal(minimalAppliance.appliancePreparations.length, 0, 'plugin alone never starts optional preparation');
    assert.deepEqual(minimalAppliance.workerLoads, { full: 0, sub: 0 });
    assert.equal(minimalAppliance.runtime.globals().sdk.__nativePreloadResult, undefined);
    assert.equal(minimalAppliance.runtime.globals().sdk.__nativePreparation, undefined);
    assert.deepEqual(minimalAppliance.appSelections, []);
    for (const enableModelPreload of [undefined, false, true]) {
        for (const appliancePluginOptions of [undefined, {}, { extras: {} },
            { extras: { useWorker: 'auto', useSimple: true, canvasOpt: { contextType: '2d' } } }]) {
            const setup = JSON.parse(JSON.stringify({ enableModelPreload, enableAppliancePlugin: true, enablePreLoadAppliancePlugin: true, dynamicConfig:null,
                useMultiViews: true, appliancePluginOptions }));
            const r = scenario({ setup });
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(r.rooms.length, 0, 'appliance preparation must not allocate a Room');
            assert.equal(r.appliancePreparations.length, 1, 'explicit appliance preload starts independently from model preloading');
            assert.deepEqual(r.workerLoads, { full: 1, sub: 0 }, 'omitted useWorker/useSimple still prepares the default full Worker');
            const prepared = r.appliancePreparations[0];
            assert.equal(prepared.cdn.fullWorkerUrl, 'blob:full');
            if (appliancePluginOptions?.extras?.useWorker) {
                assert.equal(prepared.extras.useWorker, 'auto');
                assert.equal(prepared.extras.canvasOpt.contextType, '2d');
            } else {
                assert.equal(Object.hasOwn(prepared.extras, 'useWorker'), false, 'Bridge leaves the auto default to the plugin');
            }
            assert.equal((await r.join()).__error, undefined);
            assert.equal(r.appliancePreparations.length, 1, 'join reuses matching SDK-level appliance preparation');
            assert.deepEqual(r.workerLoads, { full: 1, sub: 0 });
        }
    }
    for (const enableAppliancePlugin of [undefined, false]) {
        const r = scenario({ setup: { enableModelPreload: true, enableAppliancePlugin } });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(r.appliancePreparations.length, 0, 'model opt-in cannot enable appliance preparation');
        assert.equal((await r.join()).__error, undefined);
        assert.equal(r.appliancePreparations.length, 0);
    }
    console.log('Bridge appliance preparation: minimal enableAppliancePlugin-only payload, 12 constructor combinations (omitted/empty/explicit options × model default/false/true), matching join reuse and 2 disabled-plugin cases passed');

    // Ordinary-room admission stays synchronous up to the original SDK call.
    // No private prepare API, App warmup, Worker source, optional task or observer.
    for (const enableModelPreload of [undefined, false]) for (const preloadBuiltinApps of [undefined, []]) {
        const r = scenario({ setup: { dynamicConfig: undefined, enableModelPreload, preloadBuiltinApps,
            useMultiViews: true, enableAppliancePlugin: true, enablePreLoadAppliancePlugin: false } });
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(r.events, []); assert.deepEqual(r.workerLoads, {full: 0, sub: 0});
        assert.deepEqual(r.appSelections, []);
        assert.equal(r.runtime.globals().sdk.__nativePreparation, undefined);
        assert.equal(r.runtime.globals().sdk.__nativePreloadResult, undefined);
        const joining = r.join();
        assert.equal(r.events[0], 'sdk.joinRoom', 'direct SDK call occurs before any optional microtask wait');
        assert.equal((await joining).__error, undefined);
        assert(r.events.indexOf('sdk.joinRoom') < r.events.indexOf('manager.mount'));
        assert(r.events.indexOf('manager.mount') < r.events.indexOf('worker.full'));
        assert(r.events.indexOf('worker.full') < r.events.indexOf('plugin.create'));
    }
    const flagWithoutPlugin = scenario({setup:{dynamicConfig:undefined, enableAppliancePlugin:false,enablePreLoadAppliancePlugin:true}});
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(flagWithoutPlugin.workerLoads,{full:0,sub:0});
    assert.equal(flagWithoutPlugin.runtime.globals().sdk.__nativePreloadResult,undefined);
    console.log('PASS ordinary baseline trace: direct SDK join -> WindowManager -> Worker -> plugin; four omitted/false/empty combinations and independent plugin flag');

    // Actual tagged Native payloads: unset BOOL defaults are below OSS, explicit false wins.
    const nativeDefaults = scenario({ setup: {
        useMultiViews: false, userCursor: false, __nativeConfigDefaults: ['useMultiViews', 'userCursor'],
    }, remote: { joinRoom: { useMultiViews: true, disableCameraTransform: true, floatBar: true },
        windowManager: { chessboard: false, fullscreen: true } } });
    assert.equal((await nativeDefaults.join({ disableCameraTransform: false, floatBar: false,
        __nativeConfigDefaults: ['disableCameraTransform', 'floatBar'], windowParams: {
            chessboard: true, fullscreen: false, __nativeConfigDefaults: ['chessboard', 'fullscreen'],
        } })).__error, undefined);
    assert.equal(nativeDefaults.joined().useMultiViews, true);
    assert.equal(nativeDefaults.joined().disableCameraTransform, true);
    assert.equal(nativeDefaults.joined().floatBar, true);
    assert.equal(nativeDefaults.mounted().chessboard, false);
    assert.ok(nativeDefaults.events.includes('manager.maximize'));
    assert.equal(nativeDefaults.joined().__nativeConfigDefaults, undefined);
    assert.equal(nativeDefaults.mounted().__nativeConfigDefaults, undefined);
    const hostFalse = scenario({ setup: { useMultiViews: false, __nativeConfigDefaults: [] },
        remote: { joinRoom: { useMultiViews: true, floatBar: true } } });
    await hostFalse.join({ floatBar: false, __nativeConfigDefaults: [] });
    assert.equal(hostFalse.joined().useMultiViews, false);
    assert.equal(hostFalse.joined().floatBar, false);
    const nativeFallback = scenario({ setup: { useMultiViews: false, __nativeConfigDefaults: ['useMultiViews'] } });
    await nativeFallback.join({ floatBar: false, __nativeConfigDefaults: ['floatBar'] });
    assert.equal(nativeFallback.joined().floatBar, false);

    // Native -> Bridge JSON preserves absent, false, true and explicit zero.
    // Exercise actual source factories; this is a payload contract test, not a device probe.
    for (const explicit of [undefined, false, true]) {
        const setup = JSON.parse(JSON.stringify({ useMultiViews: explicit }));
        const payload = JSON.parse(JSON.stringify({ disableCameraTransform: explicit, useNativeClipboard: explicit, undoCacheScenesCount: explicit === undefined ? undefined : 0 }));
        const r = scenario({ setup, remote: { joinRoom: { useMultiViews: true, disableCameraTransform: true, useNativeClipboard: true, undoCacheScenesCount: 32 } } });
        assert.equal((await r.join(payload)).__error, undefined);
        assert.equal(r.joined().useMultiViews, explicit ?? true);
        assert.equal(r.joined().disableCameraTransform, explicit ?? true);
        assert.equal(r.joined().useNativeClipboard, explicit ?? true);
        assert.equal(r.joined().undoCacheScenesCount, explicit === undefined ? 32 : 0);
        assert.equal(Object.hasOwn(setup, 'useMultiViews'), explicit !== undefined);
    }
    console.log('Bridge dynamic runtime: serialized Native JSON absence/false/true/zero precedence passed');
    for (const userCursor of [false, true]) {
        const r = scenario({ setup: { userCursor }, remote: { joinRoom: { useMultiViews: true } } });
        assert.equal((await r.join()).__error, undefined);
        assert.equal(r.rooms[0].useMultiViews, true);
        assert.equal(r.joined().cursorAdapter, undefined);
        assert.equal(r.joined().disableMagixEventDispatchLimit, true);
        assert.ok(!r.events.includes('room.bind'));
        assert.ok(!r.events.includes('room.disconnect'));
    }
    const single = scenario({ setup: { useMultiViews: false, userCursor: true }, remote: { joinRoom: { useMultiViews: true } } });
    assert.equal((await single.join()).__error, undefined);
    assert.equal(single.joined().useMultiViews, false);
    assert.equal(single.joined().cursorAdapter, single.runtime.globals().cursorAdapter);
    assert.deepEqual(single.events, ['sdk.joinRoom', 'room.bind', 'cursor.setRoom', 'registerBridgeRoom']);
    const explicitMulti = scenario({ setup: { useMultiViews: true }, remote: { joinRoom: { useMultiViews: false, disableMagixEventDispatchLimit: false } } });
    assert.equal((await explicitMulti.join()).__error, undefined);
    assert.equal(explicitMulti.rooms[0].useMultiViews, true);
    assert.equal(explicitMulti.joined().disableMagixEventDispatchLimit, false);
    const explicitLimit = scenario({ remote: { joinRoom: { useMultiViews: true, disableMagixEventDispatchLimit: true } } });
    assert.equal((await explicitLimit.join({ disableMagixEventDispatchLimit: false })).__error, undefined);
    assert.equal(explicitLimit.joined().disableMagixEventDispatchLimit, false);
    const fallback = scenario({ setup: { dynamicConfig: undefined, userCursor: true } });
    assert.equal((await fallback.join()).__error, undefined);
    assert.equal(fallback.config().useMobXState, false);
    assert.equal(fallback.joined().disableMagixEventDispatchLimit, false);

    for (const failure of ['failMount', 'failListener', 'failPlugin', 'failStore', 'failRegistration']) {
        const r = scenario({ [failure]: true, setup: { enableAppliancePlugin: true, enableSyncedStore: true }, remote: { joinRoom: { useMultiViews: true } } });
        const response = await r.join({ windowParams: { fullscreen: true } });
        assert.ok(response.__error);
        assert.ok(r.events.includes('room.disconnect'));
        assert.equal(r.runtime.globals().room, undefined);
        assert.equal(r.window.manager, undefined);
        assert.equal(r.window.appliancePlugin, undefined);
        assert.equal(r.window.syncedStore, undefined);
        assert.equal(r.window.fullScreen, 'previous');
        assert.equal(r.styles.length, 0);
        if (failure !== 'failMount') assert.equal(r.events.filter(e => e === 'manager.destroy').length, 1);
        if (['failStore', 'failRegistration'].includes(failure)) assert.ok(r.events.indexOf('plugin.destroy') < r.events.indexOf('manager.destroy'));
        // Recovery in the same Bridge: no stale Room can trigger the old bind guard.
        r.options[failure] = false;
        assert.equal((await r.join()).__error, undefined);
    }
    let releaseDrain, destroyStarted;
    const drain = new Promise(resolve => { releaseDrain = resolve; });
    const started = new Promise(resolve => { destroyStarted = resolve; });
    const delayed = scenario({ failStore: true, pluginDrain: drain, onPluginDestroy: destroyStarted,
        setup: { enableAppliancePlugin: true, enableSyncedStore: true }, remote: { joinRoom: { useMultiViews: true } } });
    const pending = delayed.join();
    await started;
    assert.ok(!delayed.events.includes('manager.destroy'));
    assert.ok(delayed.events.includes('room.disconnect'));
    releaseDrain();
    assert.equal((await pending).__error.message, 'store failed');
    assert.ok(delayed.events.indexOf('plugin.drained') < delayed.events.indexOf('manager.destroy'));
    const failedCleanup = scenario({ failStore: true, failManagerCleanup: true, failPluginCleanup: true, setup: { enableAppliancePlugin: true, enableSyncedStore: true }, remote: { joinRoom: { useMultiViews: true } } });
    assert.equal((await failedCleanup.join()).__error.message, 'store failed');
    assert.ok(failedCleanup.events.includes('room.disconnect'));
    const unsupported = scenario({ setup: { enableAppliancePlugin: true }, remote: { joinRoom: { useMultiViews: true } } });
    assert.match((await unsupported.join({ windowParams: { supportAppliancePlugin: false } })).__error.message, /requires supportAppliancePlugin/);
    assert.ok(!unsupported.events.includes('plugin.create'));
    assert.ok(unsupported.events.includes('room.disconnect'));
    for (const [local, remote, expected] of [
        [{}, {}, { full: 1, sub: 0 }],
        [{}, { useSimple: false }, { full: 1, sub: 1 }],
        [{ useSimple: true }, { useSimple: false }, { full: 1, sub: 0 }],
        [{ useSimple: false }, { useSimple: true }, { full: 1, sub: 1 }],
        [{ useSimple: 0 }, { useSimple: true }, { full: 1, sub: 1 }],
        [{ useSimple: 1 }, { useSimple: false }, { full: 1, sub: 0 }],
        [{}, { useSimple: 0 }, { full: 1, sub: 1 }],
        [{ useWorker: 'mainThread' }, {}, { full: 0, sub: 0 }],
        [{}, { useWorker: 'mainThread' }, { full: 0, sub: 0 }],
        [{ useWorker: 'auto' }, { useWorker: 'mainThread' }, { full: 1, sub: 0 }],
    ]) {
        const r = scenario({ setup: { useMultiViews: true, enableAppliancePlugin: true, appliancePluginOptions: { extras: local } },
            remote: { appliancePlugin: { extras: remote } } });
        assert.equal((await r.join({ appliancePluginOptions: { extras: local } })).__error, undefined);
        assert.deepEqual(r.workerLoads, expected);
        const effective = mod.exports.mergeApplianceDynamicExtras(r.rooms[0], r.applianceOptions().extras);
        if (effective.useWorker !== 'mainThread') {
            assert.ok(r.applianceOptions().cdn.fullWorkerUrl);
            assert.equal(!!r.applianceOptions().cdn.subWorkerUrl,
                effective.useSimple !== undefined && !effective.useSimple);
        }
    }
    const customWorker = scenario({ setup: { useMultiViews: true, enableAppliancePlugin: true, appliancePluginOptions: { cdn: { fullWorkerUrl: "blob:host" } } } });
    assert.equal((await customWorker.join({ appliancePluginOptions: { cdn: { fullWorkerUrl: 'blob:host' } } })).__error, undefined);
    assert.deepEqual(customWorker.workerLoads, { full: 0, sub: 0 });
    assert.deepEqual(customWorker.applianceOptions().cdn, { fullWorkerUrl: 'blob:host' });
    const missingWorker = scenario({ failWorkerLoad: true, setup: { useMultiViews: true, enableAppliancePlugin: true } });
    assert.equal((await missingWorker.join()).__error.message, 'worker chunk missing');
    assert.ok(!missingWorker.events.includes('plugin.create'));
    assert.ok(missingWorker.events.includes('manager.destroy'));
    assert.ok(missingWorker.events.includes('room.disconnect'));
    assert.ok(missingWorker.events.includes('sdk.joinRoom'));
    missingWorker.options.failWorkerLoad = false;
    assert.equal((await missingWorker.join()).__error, undefined);
    assert.ok(missingWorker.workerLoads.full >= 2);
    let releaseWorker, workerStarted;
    const workerDelay = new Promise(resolve => { releaseWorker = resolve; });
    const workerStart = new Promise(resolve => { workerStarted = resolve; });
    const cancelledWorker = scenario({ workerDelay, onWorkerLoad: workerStarted,
        setup: { useMultiViews: true, enableAppliancePlugin: true } });
    const cancelledJoin = cancelledWorker.join();
    await workerStart;
    const cancelledLeave = cancelledWorker.lifecycle.leave(cancelledWorker.lifecycle.task.scope);
    releaseWorker();
    assert.equal((await cancelledJoin).__error.code, 'Cancelled');
    await cancelledLeave;
    assert.ok(!cancelledWorker.events.includes('plugin.create'));
    assert.ok(cancelledWorker.events.includes('manager.destroy'));
    assert.ok(cancelledWorker.events.includes('sdk.joinRoom'));
    assert.equal(cancelledWorker.window.appliancePlugin, undefined);
    const disabledPlugin = scenario({ setup: { useMultiViews: true, enableAppliancePlugin: false } });
    await disabledPlugin.join();
    assert.deepEqual(disabledPlugin.workerLoads, { full: 0, sub: 0 });
    console.log('Bridge Worker integration: effective flags match SDK merge, custom CDN, failed chunk recovery and cancellation passed');
    console.log('Bridge dynamic runtime: effective mode, post-Room required resources, explicit priority, fallback, failure cleanup and recovery passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
