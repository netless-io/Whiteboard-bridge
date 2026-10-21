import { currentScope, inScope } from "./Lifecycle";
import { scopedCall } from ".";
import { SyncedStorePlugin, Storage, SyncedStore } from "@netless/synced-store";
import { Displayer, StorageStateChangedEvent } from "@netless/window-manager";
import { call, register, registerAsyn } from ".";
import { addBridgeLogHook } from "../utils/Funs";
import { logger } from "../utils/Logger";

const syncedStoreNamespace = "store";
const syncedStoreAsyncNamespace = "store";

const storeMaps = new WeakMap<SyncedStore, Map<string, Storage>>();

export async function initSyncedStore(displayer: Displayer) {
    const scope = currentScope();
    const syncedStore = await SyncedStorePlugin.init(displayer);
    window.syncedStore = syncedStore;
    storeMaps.set(syncedStore, new Map());

    inScope(scope, () => {
        register(syncedStoreNamespace, new StoreBridge(syncedStore));
        registerAsyn(syncedStoreAsyncNamespace, new StoreAsyncBridge(syncedStore));
    });
    addBridgeLogHook([syncedStoreNamespace], logger);
    return syncedStore
}

export function destroySyncedStore() {
    if (window.syncedStore) storeMaps.get(window.syncedStore)?.clear();
    window.syncedStore?.destroy();
    window.syncedStore = undefined
}

export class StoreAsyncBridge {
    private call = scopedCall();
    constructor(readonly syncedStore: SyncedStore) { }
    private get storages() { return storeMaps.get(this.syncedStore)!; }

    connectStorage = (name: string, object: any, responseCallback: any) => {
        if (this.storages.has(name)) {
            responseCallback(JSON.stringify(this.storages.get(name)!.state))
            return
        }

        try {
            const storage = this.syncedStore.connectStorage(name, object)
            storage.on("stateChanged", (diff: StorageStateChangedEvent) => {
                if (process.env.DEBUG) {
                    console.log(`storage[${name}] state changed ${JSON.stringify(diff)}`);
                }
                this.call('store.fireSyncedStoreUpdate', JSON.stringify({ name, data: diff }));
            });
            this.storages.set(name, storage)
            responseCallback(JSON.stringify(storage.state))
        } catch (e) {
            responseCallback(JSON.stringify({ __error: { message: e.message, jsStack: e.stack } }));
        }
    }

    getStorageState = (name: string, responseCallback: any) => {
        const storage = this.storages.get(name);
        return responseCallback(JSON.stringify(storage?.state || {}));
    }
}

export class StoreBridge {
    constructor(readonly syncedStore: SyncedStore) { }
    private get storages() { return storeMaps.get(this.syncedStore)!; }

    /** Disconnect from synced storage and release listeners */
    disconnectStorage = (name: string) => {
        const storage = this.storages.get(name);
        storage?.disconnect();
        this.storages.delete(name);
    }

    /** delete synced storage data and disconnect from synced storage */
    deleteStorage = (name: string) => {
        const storage = this.storages.get(name);
        storage?.deleteStorage();
        this.storages.delete(name);
    }

    /** reset storage state to default state */
    resetState = (name: string) => {
        const storage = this.storages.get(name);
        storage?.resetState();
    }

    /** update storage state */
    setStorageState = (name: string, partialState: any) => {
        const storage = this.storages.get(name);
        storage?.setState(partialState);
    }

}