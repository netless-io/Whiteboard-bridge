import { Attributes as SlideAttributes } from "@netless/app-slide";
import { TeleBoxColorScheme } from '@netless/telebox-insider';
import { AddAppOptions, AddPageParams, BuiltinApps } from "@netless/window-manager";
import { GlobalState, ImageInformation, MemberState, Room, SceneDefinition, ViewMode } from "white-web-sdk";
import { addBridgeLogHook, createPageState } from "../utils/Funs";
import { logger } from "../utils/Logger";
import { registerDisplayerBridge } from "./Displayer";
import { call, register, registerAsyn } from ".";
import { pptNamespace, RemovePageParams, roomNamespace, roomStateNamespace, roomSyncNamespace } from "@netless/whiteboard-bridge-types";

export function registerBridgeRoom(aRoom: Room) {
    window.room = aRoom;
    registerDisplayerBridge(aRoom);

    // FIXME:同步方法尽量还是放在同步方法里。
    // 由于 Android 不方便改，暂时只把新加的 get 方法放在此处。dsbridge 注册时，同一个注册内容，会被覆盖，而不是合并。
    register(roomNamespace, new RoomBridge());
    registerAsyn(roomNamespace, new RoomAsyncBridge(aRoom));
    register(pptNamespace, new RoomPPTBridge(aRoom));
    register(roomSyncNamespace, new RoomSyncBridge(aRoom));
    register(roomStateNamespace, new RoomStateBridge(aRoom));

    addBridgeLogHook([roomNamespace, pptNamespace, roomSyncNamespace, roomStateNamespace], logger);
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
    const scenesWithoutPPT: SceneDefinition[] = scenes.map(v => { return { name: v.name } });
    let taskId = "";
    let url = "";

    // e.g. "ppt(x)://prefix/dynamicConvert/{taskId}/1.slide"
    const pptSrcRE = /^pptx?(?<prefix>:\/\/\S+?dynamicConvert)\/(?<taskId>\w+)\//;
    for (const { ppt } of scenes) {
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
                // TODO: extract to a constant
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
        logger("addSlideApp error", err);
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

    setContainerSizeRatio(ratio) {
        window.manager?.setContainerSizeRatio(ratio);
    }

    setPrefersColorScheme(scheme: TeleBoxColorScheme) {
        window.manager?.setPrefersColorScheme(scheme);
    }
}

export class RoomPPTBridge {
    constructor(readonly room: Room) { }
    nextStep = () => {
        this.room.pptNextStep();
    }

    previousStep = () => {
        this.room.pptPreviousStep();
    }
}

export class RoomSyncBridge {
    constructor(readonly room: Room) { }
    syncBlockTimestamp = (timestamp: number) => {
        this.room.syncBlockTimestamp(timestamp);
    }

    /** 默认为 true，房间内，任一用户设置为 false，会使 web 2.9.2 和 native 2.9.3 出现报错而不能正常使用。*/
    disableSerialization = (disable: boolean) => {
        this.room.disableSerialization = disable;
        /** 单窗口且开启序列化主动触发一次redo,undo次数回调 */
        if (!disable && window.manager == null) {
            call("room.fireCanUndoStepsUpdate", this.room.canUndoSteps);
            call("room.fireCanRedoStepsUpdate", this.room.canRedoSteps);
        }
    }

    copy = () => {
        this.room.copy();
    }

    paste = () => {
        this.room.paste();
    }

    duplicate = () => {
        this.room.duplicate();
    }

    delete = () => {
        this.room.delete();
    }

    disableEraseImage = (disable) => {
        this.room.disableEraseImage = disable;
    }
}

export class RoomAsyncBridge {
    constructor(readonly room: Room) { }
    redo = (responseCallback: any) => {
        const count = this.room.redo();
        responseCallback(count);
    }

    /** 撤回 */
    undo = (responseCallback: any) => {
        const count = this.room.undo();
        responseCallback(count);
    }

    /** 取消撤回 */
    canRedoSteps = (responseCallback: any) => {
        if (window.manager) {
            responseCallback(window.manager.canRedoSteps);
        } else {
            responseCallback(this.room.canRedoSteps);
        }
    }

    canUndoSteps = (responseCallback: any) => {
        if (window.manager) {
            responseCallback(window.manager.canUndoSteps);
        } else {
            responseCallback(this.room.canUndoSteps);
        }
    }

    /** set 系列API */
    setGlobalState = (modifyState: Partial<GlobalState>) => {
        this.room.setGlobalState(modifyState);
    }

    /** 替代切换页面，设置当前场景。path 为想要设置场景的 path */
    setScenePath = (scenePath: string, responseCallback: any) => {
        try {
            if (window.manager) {
                window.manager.setMainViewScenePath(scenePath);
            } else {
                this.room.setScenePath(scenePath);
            }
            responseCallback(JSON.stringify({}));
        } catch (e) {
            return responseCallback(JSON.stringify({ __error: { message: e.message, jsStack: e.stack } }));
        }
    }

    addPage = (params: AddPageParams, responseCallback?: any) => {
        if (window.manager) {
            window.manager.addPage(params)
            .then(() => {
                if (responseCallback) {
                    responseCallback();
                }
            }).catch(e => {
                if (responseCallback) {
                    return responseCallback(JSON.stringify({ __error: { message: e.message, jsStack: e.stack } }));
                }
            });
        } else {
            const dir = this.room.state.sceneState.contextPath;
            const after = params.after;
            if (after) {
                const tIndex = this.room.state.sceneState.index + 1;
                this.room.putScenes(dir, [params.scene || {}], tIndex);
            } else {
                this.room.putScenes(dir, [params.scene || {}]);
            }
            if (responseCallback) {
                setTimeout(() => {
                    responseCallback();
                }, 0);
            }
        }
    }

    removePage = (params: RemovePageParams, responseCallback: any) => {
        if (window.manager) {
            window.manager.removePage(params.index)
            .then(success => {
                responseCallback(success);
            })
            .catch(e => {
                return responseCallback(JSON.stringify({ __error: { message: e.message, jsStack: e.stack } }));
            })
        } else {
            const scenes = this.room.state.sceneState.scenes;
            const index = params.index || this.room.state.sceneState.index;
            if (scenes.length == 1) {
                logger("removePage warning", "can't remove the last page");
                return responseCallback(JSON.stringify({ __error: { message: "removePage warning, can't remove the last page"} }));
            }
            if (index < scenes.length) {
                const dir = this.room.state.sceneState.contextPath
                // 根场景时 contextPath 为 "/", 其他场景示例 "/context/Path"
                const dirWithSlash = dir.endsWith("/") ? dir : dir + "/";
                this.room.removeScenes(dirWithSlash + scenes[index].name);
                return responseCallback(true);
            } else {
                logger("removePage warning", "index out of range");
                return responseCallback(JSON.stringify({ __error: { message: 'removePage warning, index out of range'} }));
            }
        }
    }

    nextPage = (responseCallback: any) => {
        if (window.manager) {
            window.manager.nextPage().then((result) => {
                responseCallback(result)
            })
        } else {
            const nextIndex = this.room.state.sceneState.index + 1;
            if (nextIndex < this.room.state.sceneState.scenes.length) {
                this.room.setSceneIndex(nextIndex)
                responseCallback(true)
            } else {
                responseCallback(false)
            }
        }
    }

    prevPage = (responseCallback: any) => {
        if (window.manager) {
            window.manager.prevPage().then((result) => {
                responseCallback(result)
            })
        } else {
            const prevIndex = this.room.state.sceneState.index - 1;
            if (prevIndex >= 0) {
                this.room.setSceneIndex(prevIndex)
                responseCallback(true)
            } else {
                responseCallback(false)
            }
        }
    }

    setMemberState = (memberState: Partial<MemberState>) => {
        this.room.setMemberState(memberState);
    }

    setViewMode = (viewMode: string) => {
        let mode = ViewMode[viewMode] as any;
        if (mode === undefined) {
            mode = ViewMode.Freedom;
        }
        if (window.manager) {
            window.manager.setViewMode(mode);
        } else {
            this.room.setViewMode(mode);
        }
    }

    setWritable = (writable: boolean, responseCallback: any) => {
        this.room.setWritable(writable).then(() => {
            responseCallback(JSON.stringify({ isWritable: this.room.isWritable, observerId: this.room.observerId }));
        }).catch(error => {
            responseCallback(JSON.stringify({ __error: { message: error.message, jsStack: error.stack } }));
        });
    }

    /** get 系列 API */
    getMemberState = (responseCallback: any) => {
        return responseCallback(JSON.stringify(this.room.state.memberState));
    }

    getGlobalState = (responseCallback: any) => {
        return responseCallback(JSON.stringify(this.room.state.globalState));
    }

    getSceneState = (responseCallback: any) => {
        return responseCallback(JSON.stringify(this.room.state.sceneState));
    }

    getRoomMembers = (responseCallback: any) => {
        return responseCallback(JSON.stringify(this.room.state.roomMembers));
    }

    /** @deprecated 使用 scenes 代替，ppt 将作为 scene 的成员变量 */
    getPptImages = (responseCallback: any) => {
        const ppts = this.room.state.sceneState.scenes.map(s => {
            if (s.ppt) {
                return s.ppt.src;
            } else {
                return "";
            }
        });
        return responseCallback(JSON.stringify(ppts));
    }

    setSceneIndex = (index: number, responseCallback: any) => {
        try {
            if (window.manager) {
                window.manager.setMainViewSceneIndex(index);
            } else {
                this.room.setSceneIndex(index);
            }
            responseCallback(JSON.stringify({}));
        } catch (error) {
            responseCallback(JSON.stringify({ __error: { message: error.message, jsStack: error.stack } }));
        }
    }

    getScenes = (responseCallback: any) => {
        return responseCallback(JSON.stringify(this.room.state.sceneState.scenes));
    }

    getZoomScale = (responseCallback: any) => {
        let scale = 1;
        if (window.manager) {
            scale = window.manager.mainView.camera.scale;
        } else {
            scale = this.room.state.cameraState.scale;
        }
        return responseCallback(JSON.stringify(scale));
    }

    getBroadcastState = (responseCallback: any) => {
        return responseCallback(JSON.stringify(this.room.state.broadcastState));
    }

    getRoomPhase = (responseCallback: any) => {
        return responseCallback(this.room.phase);
    }

    disconnect = (responseCallback: any) => {
        this.room.disconnect().then(() => {
            responseCallback();
        });
    }

    zoomChange = (scale: number) => {
        this.room.moveCamera({ scale });
    }

    disableCameraTransform = (disableCamera: boolean) => {
        this.room.disableCameraTransform = disableCamera;
    }

    disableDeviceInputs = (disable: boolean) => {
        if (window.manager) {
            window.manager.setReadonly(disable);
        }
        this.room.disableDeviceInputs = disable;
        updateIframePluginState(this.room);
    }

    disableOperations = (disableOperations: boolean) => {
        this.room.disableCameraTransform = disableOperations;
        this.room.disableDeviceInputs = disableOperations;
        updateIframePluginState(this.room);
    }

    disableWindowOperation = (disable: boolean) => {
        window.manager?.setReadonly(disable);
    }

    putScenes = (dir: string, scenes: SceneDefinition[], index: number, responseCallback: any) => {
        this.room.putScenes(dir, scenes, index);
        responseCallback(JSON.stringify(this.room.state.sceneState));
    }

    removeScenes = (dirOrPath: string) => {
        this.room.removeScenes(dirOrPath);
    }

    /* 移动，重命名当前scene，参考 mv 命令 */
    moveScene = (source: string, target: string) => {
        this.room.moveScene(source, target);
    }

    /**
     * 在指定位置插入文字
     * @param x 第一个字的的左侧边中点，世界坐标系中的 x 坐标
     * @param y 第一个字的的左侧边中点，世界坐标系中的 y 坐标
     * @param textContent 初始化文字的内容
     * @param responseCallback 完成回调
     * @returns 该文字的标识符
     */
    insertText = (x: number, y: number, textContent: string, responseCallback: any) => {
        if (window.manager) {
            responseCallback(window.manager.mainView.insertText(x, y, textContent));
        } else {
            responseCallback(this.room.insertText(x, y, textContent));
        }
    }

    cleanScene = (retainPpt: boolean) => {
        let retain: boolean;
        if (retainPpt === undefined) {
            retain = false;
        } else {
            retain = !!retainPpt;
        }
        this.room.cleanCurrentScene(retainPpt);
    }

    insertImage = (imageInfo: ImageInformation) => {
        this.room.insertImage(imageInfo);
    }

    insertVideo = (videoInfo: VideoPluginInfo) => {
        // TODO: ???
    }

    completeImageUpload = (uuid: string, url: string) => {
        this.room.completeImageUpload(uuid, url);
    }

    dispatchMagixEvent = (event: EventEntry) => {
        this.room.dispatchMagixEvent(event.eventName, event.payload);
    }

    setTimeDelay = (delay: number) => {
        this.room.timeDelay = delay;
    }

    addApp = (kind: string, options: any, attributes: any, responseCallback: any) => {
        if (window.manager) {
            if (kind === "Slide") {
                // 检查是否使用由 projector 转换服务
                const { taskId, url } = attributes || {}
                if (taskId && url) {
                    window.manager.addApp({
                        kind: kind,
                        options: options as AddAppOptions,
                        attributes: attributes as SlideAttributes
                    }).then(appId => {
                        responseCallback(appId)
                    });
                } else {
                    // 兼容Canvas版本转换服务
                    const opts = options as AddAppOptions
                    addSlideApp(opts.scenePath!, opts.title!, opts.scenes!)
                        .then(appId => {
                            responseCallback(appId)
                        })
                }
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

    closeApp = (appId: string, responseCallback: any) => {
        if (window.manager) {
            window.manager.closeApp(appId).then(() => {
                return responseCallback(undefined);
            });
        }
    }

    getSyncedState = (responseCallback: any) => {
        let result = window.syncedStore ? window.syncedStore!.attributes : {}
        responseCallback(JSON.stringify(result))
    }
}

export class RoomStateBridge {
    constructor(readonly room: Room) { }
    getRoomState = () => {
        const state = this.room.state;
        if (window.manager) {
            return { ...state, ...{ windowBoxState: window.manager.boxState }, cameraState: window.manager.cameraState, sceneState: window.manager.sceneState, ...{ pageState: window.manager.pageState } };
        } else {
            return { ...state, ...createPageState(state.sceneState) };
        }
    }

    getTimeDelay = () => {
        return this.room.timeDelay;
    }

    getPhase = () => {
        return this.room.phase;
    }

    isWritable = () => {
        return this.room.isWritable;
    }

    debugInfo = () => {
        try {
            const screen = (this.room as any).screen;
            const { camera, visionRectangle, adaptedRectangle, divElement } = screen;
            return { camera, visionRectangle, adaptedRectangle, divWidth: divElement.clientWidth, divHeight: divElement.clientHeight };
        } catch (error) {
            return { error: error.message };
        }
    }
}