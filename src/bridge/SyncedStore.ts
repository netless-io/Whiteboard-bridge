import { SyncedStore, Storage } from "@netless/synced-store";
import { Displayer, StorageStateChangedEvent } from "@netless/window-manager";
import { register, registerAsyn } from ".";

const syncedStoreNamespace = "store";
const syncedStoreAsyncNamespace = "store";

const storages = new Map<string, Storage>()

export interface SyncedStoreUpdateHandler {
    onSyncedStoreUpdate(update: { name: string, data: any }): void
}

export async function initSyncedStore(displayer: Displayer, handler: SyncedStoreUpdateHandler) {
    const syncedStore = await SyncedStore.init(displayer);
    window.syncedStore = syncedStore;

    register(syncedStoreNamespace, new StoreBridge(syncedStore))
    registerAsyn(syncedStoreAsyncNamespace, new StoreAsyncBridge(syncedStore, handler))

    return syncedStore
}

export function destroySyncedStore() {
    window.syncedStore = undefined

    storages.forEach(storage => {
        storage.destroy();
    })
    storages.clear();
}

export class StoreAsyncBridge {
    constructor(readonly syncedStore: SyncedStore, readonly handler: SyncedStoreUpdateHandler) { }

    connectStorage = (name: string, object: any, responseCallback: any) => {
        try {
            const storage = this.syncedStore.connectStorage(name, object)
            storage.addStateChangedListener((diff: StorageStateChangedEvent) => {
                if (process.env.DEBUG) {
                    console.log(`storage[${name}] state changed ${JSON.stringify(diff)}`);
                }
                const data = {};
                Object.keys(diff).forEach((key) => {
                    if (diff[key]) {
                        data[key] = diff[key]!.newValue;
                    }
                })
                if (process.env.DEBUG) {
                    console.log(`storage[${name}] state changed processed ${JSON.stringify(data)}`);
                }
                this.handler.onSyncedStoreUpdate({ name, data })
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

    // Destroy the Storage instance. The data will be kept.
    destroyStorage = (name: string) => {
        const storage = storages.get(name);
        storage?.destroy();
    }

    // Empty storage data.
    emptyStorage = (name: string) => {
        const storage = storages.get(name);
        storage?.emptyStorage();
    }

    // Delete storage index with all of its data and destroy the Storage instance.
    deleteStorage = (name: string) => {
        const storage = storages.get(name);
        storage?.deleteStorage();
    }

    // update storage state
    setStorageState = (name: string, partialState: any) => {
        const storage = storages.get(name);
        storage?.setState(partialState);
    }

}