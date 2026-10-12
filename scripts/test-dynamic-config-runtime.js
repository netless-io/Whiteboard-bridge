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
                export { mergeDynamicJoinRoomParameters } from '../white-sdk/web-sdk/src/dynamicConfig/Parameters';
                export { applyDynamicMountParams } from '../window-manager/src/Utils/dynamicConfig';
                export { withDynamicConfigDefaults, splitNativeConfiguration, resolveNativeConfiguration } from './src/bridge/DynamicConfigParameters';
                export { mergeDefaultAppliancePluginExtras } from './src/bridge/AppliancePluginDefaults';
            `,
            resolveDir: root, loader: 'ts',
        },
        bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node14',
    });
    const mod = { exports: {} };
    new Function('module', 'exports', helpers.outputFiles[0].text)(mod, mod.exports);
    const compiled = await transform(`
        let sdk, room, player, nativeConfig, cursorAdapter;
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
        class CursorTool { setRoom(value) { events.push('cursor.setRoom'); } }
        class WindowManager {
            static register() {}
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
            async joinRoom(params) {
                joined = mod.exports.mergeDynamicJoinRoomParameters(options.remote?.joinRoom, params);
                events.push('sdk.joinRoom');
                if (joined.useMultiViews) {
                    assert(sdkConfiguration.useMobXState, 'MobX must be ready at setup');
                    assert(joined.invisiblePlugins.includes(WindowManager), 'WM must be registered before Room acquisition');
                    assert.equal(joined.cursorAdapter, undefined);
                }
                const result = {
                    useMultiViews: !!joined.useMultiViews, state: {}, observerId: rooms.length + 1, isWritable: true,
                    dynamicConfig: options.remote,
                    bindHtmlElement() {
                        events.push('room.bind');
                        if (this.useMultiViews) throw Error('you should pass useMultiViews: false');
                    },
                    async disconnect() { events.push('room.disconnect'); },
                };
                rooms.push(result);
                return result;
            }
        }
        const scope = {
            ...mod.exports, window, document: {
                createElement: () => { const style = { remove() { styles.splice(styles.indexOf(style), 1); } }; return style; },
                body: { appendChild(style) { styles.push(style); return style; } },
            },
            console: { warn() {}, log() {} }, navigator: { userAgent: '' },
            WhiteWebSdk, WindowManager, CursorTool, RoomCallbackHandler: class {},
            sdkCallbackHandler: { onSetupFail(error) { throw error; } },
            mergeLocalLogOptions: value => value, enableReport() {}, hookCreateElement() {},
            createPlugins: () => ({ setPluginContext() {} }),
            videoPlugin: {}, audioPlugin: {}, videoPlugin2: {}, audioPlugin2: {}, videoJsPlugin: () => ({}),
            resolveSlidePerformanceOptions: () => ({}), addHooksSlide() {}, logger() {},
            validateBackgroundImageLoadOptions() {}, bindLocalLogStateChange() {}, convertBound: value => value,
            divRef: () => ({}), createAppState: () => ({}), createPageState: () => ({}),
            addManagerListener(manager) { window.manager = manager; if (options.failListener) throw Error('listener failed'); },
            registerBridgeRoom() { events.push('registerBridgeRoom'); if (options.failRegistration) throw Error('register failed'); },
            getApplianceWorkerUrls: () => ({ fullWorkerUrl: 'full', subWorkerUrl: 'sub' }),
            postBackgroundImageLoadEvent() {}, postApplianceInitLoadingChange() {},
            ApplianceMultiPlugin: { async getInstance() {
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
            options, events, rooms, window, styles, runtime,
            joined: () => joined, mounted: () => mounted, config: () => sdkConfiguration,
            async join(params = {}) {
                let responses = 0, result;
                await runtime.bridge.joinRoom({ uuid: 'room', uid: 'user', roomToken: 'test', ...params }, text => { responses++; result = JSON.parse(text); });
                assert.equal(responses, 1);
                return result;
            },
        };
    }

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
        assert.equal(r.events.at(-1), 'room.disconnect');
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
    assert.ok(!delayed.events.includes('room.disconnect'));
    releaseDrain();
    assert.equal((await pending).__error.message, 'store failed');
    assert.ok(delayed.events.indexOf('plugin.drained') < delayed.events.indexOf('manager.destroy'));
    const failedCleanup = scenario({ failStore: true, failManagerCleanup: true, failPluginCleanup: true, setup: { enableAppliancePlugin: true, enableSyncedStore: true }, remote: { joinRoom: { useMultiViews: true } } });
    assert.equal((await failedCleanup.join()).__error.message, 'store failed');
    assert.equal(failedCleanup.events.at(-1), 'room.disconnect');
    const unsupported = scenario({ setup: { enableAppliancePlugin: true }, remote: { joinRoom: { useMultiViews: true } } });
    assert.match((await unsupported.join({ windowParams: { supportAppliancePlugin: false } })).__error.message, /requires supportAppliancePlugin/);
    assert.ok(!unsupported.events.includes('plugin.create'));
    assert.equal(unsupported.events.at(-1), 'room.disconnect');
    console.log('Bridge dynamic runtime: effective mode, pre-room dependencies, explicit priority, fallback, failure cleanup and recovery passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
