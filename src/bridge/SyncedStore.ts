import { SyncedStorePlugin, Storage, SyncedStore } from "@netless/synced-store";
import { Displayer, StorageStateChangedEvent } from "@netless/window-manager";
import { register, registerAsyn } from ".";

const syncedStoreNamespace = "store";
const syncedStoreAsyncNamespace = "store";

const storages = new Map<string, Storage>()

export interface SyncedStoreUpdateHandler {
    onSyncedStoreUpdate(update: { name: string, data: any }): void
}

export async function initSyncedStore(displayer: Displayer, handler: SyncedStoreUpdateHandler) {
    const syncedStore = await SyncedStorePlugin.init(displayer);
    window.syncedStore = syncedStore;

    register(syncedStoreNamespace, new StoreBridge(syncedStore))
    registerAsyn(syncedStoreAsyncNamespace, new StoreAsyncBridge(syncedStore, handler))

    return syncedStore
}

export function destroySyncedStore() {
    storages.clear();
    window.syncedStore?.destroy();
    window.syncedStore = undefined
}

export class StoreAsyncBridge {
    constructor(readonly syncedStore: SyncedStore, readonly handler: SyncedStoreUpdateHandler) { }

    connectStorage = (name: string, object: any, responseCallback: any) => {
        if (storages.has(name)) {
            responseCallback(JSON.stringify(storages.get(name)!.state))
            return
        }

        try {
            const storage = this.syncedStore.connectStorage(name, object)
            storage.on("stateChanged", (diff: StorageStateChangedEvent) => {
                if (process.env.DEBUG) {
                    console.log(`storage[${name}] state changed ${JSON.stringify(diff)}`);
                }
                this.handler.onSyncedStoreUpdate({ name, data: diff })
            });
            storages.set(name, storage)
            responseCallback(JSON.stringify(storage.state))
        } catch (e) {
            responseCallback(JSON.stringify({ __error: { message: e.message, jsStack: e.stack } }));
        }
    }

    getStorageState = (name: string, responseCallback: any) => {
        const storage = storages.get(name);
        return responseCallback(JSON.stringify(storage?.state || {}));
    }
}

export class StoreBridge {
    constructor(readonly syncedStore: SyncedStore) { }

    /** Disconnect from synced storage and release listeners */
    disconnectStorage = (name: string) => {
        const storage = storages.get(name);
        storage?.disconnect();
        storages.delete(name);
    }

    /** delete synced storage data and disconnect from synced storage */
    deleteStorage = (name: string) => {
        const storage = storages.get(name);
        storage?.deleteStorage();
    }

    /** reset storage state to default state */
    resetState = (name: string) => {
        const storage = storages.get(name);
        storage?.resetState();
    }

    /** update storage state */
    setStorageState = (name: string, partialState: any) => {
        const storage = storages.get(name);
        storage?.setState(partialState);
    }

}