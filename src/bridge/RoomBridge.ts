import dsBridge from "dsbridge";
import { ImageInformation, ViewMode, Room, SceneDefinition, MemberState, GlobalState, WhiteScene, RoomPhase } from "white-web-sdk";
import { registerDisplayerBridge } from "./DisplayerBridge";
import { AddAppOptions, AddPageParams, BuiltinApps } from "@netless/window-manager";
import { Attributes as SlideAttributes } from "@netless/app-slide";
import { createPageState } from "../utils/Funs";

export const pptNamespace = "ppt";
export const roomSyncNamespace = "room.sync";
export const roomNamespace = "room";
export const roomStateNamespace = "room.state";

export function registerBridgeRoom(aRoom: Room) {
    window.room = aRoom;
    registerDisplayerBridge(aRoom);

    dsBridge.register(roomNamespace, new RoomBridge());
    dsBridge.registerAsyn(roomNamespace, new RoomAsyncBridge(aRoom));
    dsBridge.register(pptNamespace, new RoomPPTBridge(aRoom));
    dsBridge.register(roomSyncNamespace, new RoomSyncBridge(aRoom));
    // FIXME:同步方法尽量还是放在同步方法里。
    // 由于 Android 不方便改，暂时只把新加的 get 方法放在此处。dsbridge 注册时，同一个注册内容，会被覆盖，而不是合并。
    dsBridge.register(roomStateNamespace, new RoomStateBridge(aRoom));
}

type VideoPluginInfo = {
    readonly props?: {
        videoUrl: string;
    }
    readonly centerX: number;
    readonly centerY: number;
    readonly width: number;
    readonly height: number;
};

type EventEntry = {
    eventName: string;
    payload: any;
};

function makeSlideParams(scenes: SceneDefinition[]): {
    scenesWithoutPPT: SceneDefinition[];
    taskId: string;
    url: string;
} {
    const scenesWithoutPPT: SceneDefinition[] = [];
    let taskId = "";
    let url = "";

    // e.g. "ppt(x)://cdn/prefix/dynamicConvert/{taskId}/1.slide"
    const pptSrcRE = /^pptx?(?<prefix>:\/\/\S+?dynamicConvert)\/(?<taskId>\w+)\//;

    for (const { name, ppt } of scenes) {
        // make sure scenesWithoutPPT.length === scenes.length
        scenesWithoutPPT.push({ name });

        if (!ppt || !ppt.src.startsWith("ppt")) {
            continue;
        }
        const match = pptSrcRE.exec(ppt.src);
        if (!match || !match.groups) {
            continue;
        }
        taskId = match.groups.taskId;
        url = "https" + match.groups.prefix;
        break;
    }

    return { scenesWithoutPPT, taskId, url };
}

function addSlideApp(scenePath: string, title: string, scenes: SceneDefinition[]): Promise<string | undefined> {
    const { scenesWithoutPPT, taskId, url } = makeSlideParams(scenes);
    try {
        if (taskId && url) {
            return window.manager!.addApp({
                kind: "Slide",
                options: {
                    scenePath,
                    title,
                    scenes: scenesWithoutPPT,
                },
                attributes: {
                    taskId,
                    url,
                } as SlideAttributes,
            });
        } else {
            return window.manager!.addApp({
                kind: BuiltinApps.DocsViewer,
                options: {
                    scenePath,
                    title,
                    scenes,
                },
            });
        }
    } catch (err) {
        console.log(err);
        return Promise.reject()
    }
}

function updateIframePluginState(room: Room) {
    // iframe 根据 disableDeviceInputs 禁用操作，主动修改该值后，需要调用 updateIframePluginState 来更新状态
    // tslint:disable-next-line:no-unused-expression
    room.getInvisiblePlugin("IframeBridge") && (room.getInvisiblePlugin("IframeBridge")! as any).computedZindex();
    // tslint:disable-next-line:no-unused-expression
    room.getInvisiblePlugin("IframeBridge") && (room.getInvisiblePlugin("IframeBridge")! as any).updateStyle();
}

export class RoomBridge {
    setWindowManagerAttributes(attributes: any) {
        window.manager?.setAttributes(attributes);
        window.manager?.refresh();
    }
}

export class RoomPPTBridge {
    nextStep: () => void;
    previousStep: () => void;

    constructor(room: Room) {
        this.nextStep = () => {
            room.pptNextStep();
        }

        this.previousStep = () => {
            room.pptPreviousStep();
        }
    }
}

export class RoomSyncBridge {
    syncBlockTimestamp: (timestamp: number) => void;
    /** 客户端本地效果，会导致 web 2.9.2 和 native 2.9.3 以下出现问题。*/
    disableSerialization: (disable: boolean) => void;
    copy: () => void;
    paste: () => void;
    duplicate: () => void;
    delete: () => void;
    disableEraseImage: (disable: boolean) => void;

    constructor(room: Room) {
        this.syncBlockTimestamp = (timestamp: number) => {
            room.syncBlockTimestamp(timestamp);
        }

        /** 客户端本地效果，会导致 web 2.9.2 和 native 2.9.3 以下出现问题。*/
        this.disableSerialization = (disable: boolean) => {
            room.disableSerialization = disable;
            /** 单窗口且开启序列化主动触发一次redo,undo次数回调 */
            if (!disable && window.manager == null) {
                dsBridge.call("room.fireCanUndoStepsUpdate", room.canUndoSteps);
                dsBridge.call("room.fireCanRedoStepsUpdate", room.canRedoSteps);
            }
        }

        this.copy = () => {
            room.copy();
        }

        this.paste = () => {
            room.paste();
        }

        this.duplicate = () => {
            room.duplicate();
        }

        this.delete = () => {
            room.delete();
        }

        this.disableEraseImage = (disable) => {
            room.disableEraseImage = disable;
        }
    }
}

export class RoomAsyncBridge {
    redo: (responseCallback: any) => void;
    /** 撤回 */
    undo: (responseCallback: any) => void;
    /** 取消撤回 */
    canRedoSteps: (responseCallback: any) => void;
    canUndoSteps: (responseCallback: any) => void;
    /** set 系列API */
    setGlobalState: (modifyState: Partial<GlobalState>) => void;
    /** 替代切换页面，设置当前场景。path 为想要设置场景的 path */
    setScenePath: (scenePath: string, responseCallback: any) => void;
    addPage: (params: AddPageParams) => void;
    nextPage: (responseCallback: any) => void;
    prevPage: (responseCallback: any) => void;
    setMemberState: (memberState: Partial<MemberState>) => void;
    setViewMode: (viewMode: string) => void;
    setWritable: (writable: boolean, responseCallback: any) => void;
    /** get 系列 API */
    getMemberState: (responseCallback: any) => void;
    getGlobalState: (responseCallback: any) => void;
    getSceneState: (responseCallback: any) => void;
    getRoomMembers: (responseCallback: any) => void;
    /** @deprecated 使用 scenes 代替，ppt 将作为 scene 的成员变量 */
    getPptImages: (responseCallback: any) => void;
    setSceneIndex: (index: number, responseCallback: any) => void;
    getScenes: (responseCallback: any) => void;
    getZoomScale: (responseCallback: any) => void;
    getBroadcastState: (responseCallback: any) => void;
    getRoomPhase: (responseCallback: any) => void;
    disconnect: (responseCallback: any) => void;
    zoomChange: (scale: number) => void;
    disableCameraTransform: (disableCamera: boolean) => void;
    disableDeviceInputs: (disable: boolean) => void;
    disableOperations: (disableOperations: boolean) => void;
    disableWindowOperation: (disable: boolean) => void;
    putScenes: (dir: string, scenes: SceneDefinition[], index: number, responseCallback: any) => void;
    removeScenes: (dirOrPath: string) => void;
    /* 移动，重命名当前scene，参考 mv 命令 */
    moveScene: (source: string, target: string) => void;
    /**
     * 在指定位置插入文字
     * @param x 第一个字的的左侧边中点，世界坐标系中的 x 坐标
     * @param y 第一个字的的左侧边中点，世界坐标系中的 y 坐标
     * @param textContent 初始化文字的内容
     * @param responseCallback 完成回调
     * @returns 该文字的标识符
     */
    insertText: (x: number, y: number, textContent: string, responseCallback: any) => void;
    cleanScene: (retainPpt: boolean) => void;
    insertImage: (imageInfo: ImageInformation) => void;
    insertVideo: (videoInfo: VideoPluginInfo) => void;
    completeImageUpload: (uuid: string, url: string) => void;
    dispatchMagixEvent: (event: EventEntry) => void;
    setTimeDelay: (delay: number) => void;
    addApp: (kind: string, options: any, attributes: any, responseCallback: any) => void;
    closeApp: (appId: string, responseCallback: any) => void;
    getSyncedState: (responseCallback: any) => void;
    safeSetAttributes: (attributes: any) => void;
    safeUpdateAttributes: (keys: string[], attributes: any) => void;

    constructor(room: Room) {
        this.redo = (responseCallback: any) => {
            const count = room.redo();
            responseCallback(count);
        }

        /** 撤回 */
        this.undo = (responseCallback: any) => {
            const count = room.undo();
            responseCallback(count);
        }

        /** 取消撤回 */
        this.canRedoSteps = (responseCallback: any) => {
            if (window.manager) {
                responseCallback(window.manager.canRedoSteps);
            } else {
                responseCallback(room.canRedoSteps);
            }
        }

        this.canUndoSteps = (responseCallback: any) => {
            if (window.manager) {
                responseCallback(window.manager.canUndoSteps);
            } else {
                responseCallback(room.canUndoSteps);
            }
        }

        /** set 系列API */
        this.setGlobalState = (modifyState: Partial<GlobalState>) => {
            room.setGlobalState(modifyState);
        }

        /** 替代切换页面，设置当前场景。path 为想要设置场景的 path */
        this.setScenePath = (scenePath: string, responseCallback: any) => {
            try {
                if (window.manager) {
                    window.manager.setMainViewScenePath(scenePath);
                } else {
                    room.setScenePath(scenePath);
                }
                responseCallback(JSON.stringify({}));
            } catch (e) {
                return responseCallback(JSON.stringify({ __error: { message: e.message, jsStack: e.stack } }));
            }
        }

        this.addPage = (params: AddPageParams) => {
            if (window.manager) {
                window.manager.addPage(params)
            } else {
                const dir = room.state.sceneState.contextPath
                const after = params.after
                if (after) {
                    const tIndex = room.state.sceneState.index + 1
                    room.putScenes(dir, [params.scene || {}], tIndex)
                } else {
                    room.putScenes(dir, [params.scene || {}]);
                }
            }
        }

        this.nextPage = (responseCallback: any) => {
            if (window.manager) {
                window.manager.nextPage().then((result) => {
                    responseCallback(result)
                })
            } else {
                const nextIndex = room.state.sceneState.index + 1;
                if (nextIndex < room.state.sceneState.scenes.length) {
                    room.setSceneIndex(nextIndex)
                    responseCallback(true)
                } else {
                    responseCallback(false)
                }
            }
        }

        this.prevPage = (responseCallback: any) => {
            if (window.manager) {
                window.manager.prevPage().then((result) => {
                    responseCallback(result)
                })
            } else {
                const prevIndex = room.state.sceneState.index - 1;
                if (prevIndex >= 0) {
                    room.setSceneIndex(prevIndex)
                    responseCallback(true)
                } else {
                    responseCallback(false)
                }
            }
        }

        this.setMemberState = (memberState: Partial<MemberState>) => {
            room.setMemberState(memberState);
        }

        this.setViewMode = (viewMode: string) => {
            let mode = ViewMode[viewMode] as any;
            if (mode === undefined) {
                mode = ViewMode.Freedom;
            }
            if (window.manager) {
                window.manager.setViewMode(mode);
            } else {
                room.setViewMode(mode);
            }
        }

        this.setWritable = (writable: boolean, responseCallback: any) => {
            room.setWritable(writable).then(() => {
                responseCallback(JSON.stringify({ isWritable: room.isWritable, observerId: room.observerId }));
            }).catch(error => {
                responseCallback(JSON.stringify({ __error: { message: error.message, jsStack: error.stack } }));
            });
        }

        /** get 系列 API */
        this.getMemberState = (responseCallback: any) => {
            return responseCallback(JSON.stringify(room.state.memberState));
        }

        this.getGlobalState = (responseCallback: any) => {
            return responseCallback(JSON.stringify(room.state.globalState));
        }

        this.getSceneState = (responseCallback: any) => {
            return responseCallback(JSON.stringify(room.state.sceneState));
        }

        this.getRoomMembers = (responseCallback: any) => {
            return responseCallback(JSON.stringify(room.state.roomMembers));
        }

        /** @deprecated 使用 scenes 代替，ppt 将作为 scene 的成员变量 */
        this.getPptImages = (responseCallback: any) => {
            const ppts = room.state.sceneState.scenes.map(s => {
                if (s.ppt) {
                    return s.ppt.src;
                } else {
                    return "";
                }
            });
            return responseCallback(JSON.stringify(ppts));
        }

        this.setSceneIndex = (index: number, responseCallback: any) => {
            try {
                if (window.manager) {
                    window.manager.setMainViewSceneIndex(index);
                } else {
                    room.setSceneIndex(index);
                }
                responseCallback(JSON.stringify({}));
            } catch (error) {
                responseCallback(JSON.stringify({ __error: { message: error.message, jsStack: error.stack } }));
            }
        }

        this.getScenes = (responseCallback: any) => {
            return responseCallback(JSON.stringify(room.state.sceneState.scenes));
        }

        this.getZoomScale = (responseCallback: any) => {
            let scale = 1;
            if (window.manager) {
                scale = window.manager.mainView.camera.scale;
            } else {
                scale = room.state.cameraState.scale;
            }
            return responseCallback(JSON.stringify(scale));
        }

        this.getBroadcastState = (responseCallback: any) => {
            return responseCallback(JSON.stringify(room.state.broadcastState));
        }

        this.getRoomPhase = (responseCallback: any) => {
            return responseCallback(room.phase);
        }

        this.disconnect = (responseCallback: any) => {
            room.disconnect().then(() => {
                responseCallback();
            });
        }

        this.zoomChange = (scale: number) => {
            room.moveCamera({ scale });
        }

        this.disableCameraTransform = (disableCamera: boolean) => {
            room.disableCameraTransform = disableCamera;
        }

        this.disableDeviceInputs = (disable: boolean) => {
            if (window.manager) {
                window.manager.setReadonly(disable);
            }
            room.disableDeviceInputs = disable;
            updateIframePluginState(room);
        }

        this.disableOperations = (disableOperations: boolean) => {
            room.disableCameraTransform = disableOperations;
            room.disableDeviceInputs = disableOperations;
            updateIframePluginState(room);
        }

        this.disableWindowOperation = (disable: boolean) => {
            window.manager?.setReadonly(disable);
        }

        this.putScenes = (dir: string, scenes: SceneDefinition[], index: number, responseCallback: any) => {
            room.putScenes(dir, scenes, index);
            responseCallback(JSON.stringify(room.state.sceneState));
        }

        this.removeScenes = (dirOrPath: string) => {
            room.removeScenes(dirOrPath);
        }

        /* 移动，重命名当前scene，参考 mv 命令 */
        this.moveScene = (source: string, target: string) => {
            room.moveScene(source, target);
        }

        /**
         * 在指定位置插入文字
         * @param x 第一个字的的左侧边中点，世界坐标系中的 x 坐标
         * @param y 第一个字的的左侧边中点，世界坐标系中的 y 坐标
         * @param textContent 初始化文字的内容
         * @param responseCallback 完成回调
         * @returns 该文字的标识符
         */
        this.insertText = (x: number, y: number, textContent: string, responseCallback: any) => {
            if (window.manager) {
                responseCallback(window.manager.mainView.insertText(x, y, textContent));
            } else {
                responseCallback(room.insertText(x, y, textContent));
            }
        }

        this.cleanScene = (retainPpt: boolean) => {
            let retain: boolean;
            if (retainPpt === undefined) {
                retain = false;
            } else {
                retain = !!retainPpt;
            }
            room.cleanCurrentScene(retainPpt);
        }

        this.insertImage = (imageInfo: ImageInformation) => {
            room.insertImage(imageInfo);
        }

        this.insertVideo = (videoInfo: VideoPluginInfo) => {
            // TODO: ???
        }

        this.completeImageUpload = (uuid: string, url: string) => {
            room.completeImageUpload(uuid, url);
        }

        this.dispatchMagixEvent = (event: EventEntry) => {
            room.dispatchMagixEvent(event.eventName, event.payload);
        }

        this.setTimeDelay = (delay: number) => {
            room.timeDelay = delay;
        }

        this.addApp = (kind: string, options: any, attributes: any, responseCallback: any) => {
            if (window.manager) {
                if (kind === "Slide") {
                    const opts = options as AddAppOptions
                    addSlideApp(opts.scenePath!, opts.title!, opts.scenes!)
                        .then(appId => {
                            responseCallback(appId)
                        })
                } else {
                    window.manager.addApp({
                        kind: kind,
                        options: options,
                        attributes: attributes
                    }).then(appId => {
                        responseCallback(appId)
                    });
                }
            }
        }

        this.closeApp = (appId: string, responseCallback: any) => {
            if (window.manager) {
                window.manager.closeApp(appId).then(() => {
                    return responseCallback(undefined);
                });
            }
        }

        this.getSyncedState = (responseCallback: any) => {
            let result = window.syncedStore ? window.syncedStore!.attributes : {}
            responseCallback(JSON.stringify(result))
        }

        this.safeSetAttributes = (attributes: any) => {
            window.syncedStore?.safeSetAttributes(attributes)
        }

        this.safeUpdateAttributes = (keys: string[], attributes: any) => {
            window.syncedStore?.safeUpdateAttributes(keys, attributes)
        }
    }
}

export class RoomStateBridge {
    getRoomState: () => any;
    getTimeDelay: () => number;
    getPhase: () => RoomPhase;
    isWritable: () => boolean;
    debugInfo: () => any;

    constructor(room: Room) {
        this.getRoomState = () => {
            const state = room.state;
            if (window.manager) {
                return { ...state, ...{ windowBoxState: window.manager.boxState }, cameraState: window.manager.cameraState, sceneState: window.manager.sceneState, ...{ pageState: window.manager.pageState } };
            } else {
                return { ...state, ...createPageState(state.sceneState) };
            }
        }

        this.getTimeDelay = () => {
            return room.timeDelay;
        }

        this.getPhase = () => {
            return room.phase;
        }

        this.isWritable = () => {
            return room.isWritable;
        }

        this.debugInfo = () => {
            try {
                const screen = (room as any).screen;
                const { camera, visionRectangle, adaptedRectangle, divElement } = screen;
                return { camera, visionRectangle, adaptedRectangle, divWidth: divElement.clientWidth, divHeight: divElement.clientHeight };
            } catch (error) {
                return { error: error.message };
            }
        }
    }
}