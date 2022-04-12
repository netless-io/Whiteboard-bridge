import dsBridge from "dsbridge";
import { ImageInformation, ViewMode, Room, SceneDefinition, MemberState, GlobalState, WhiteScene } from "white-web-sdk";
import { registerDisplayer } from "../bridge/Displayer";
import { AddAppOptions, AddPageParams, BuiltinApps } from "@netless/window-manager";
import { Attributes as SlideAttributes } from "@netless/app-slide";
import { createPageState, registerBridge } from "../utils/Funs";

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

function addSlideApp(scenePath: string, title: string, scenes: SceneDefinition[]): Promise<string | undefined>{
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

function setWindowManagerAttributes(attributes: any) {
    window.manager?.setAttributes(attributes);
    window.manager?.refresh();
}

const pptNamespace = "ppt";
const roomSyncNamespace = "room.sync";
const roomNamespace = "room";
const roomStateNamespace = "room.state";

export function registerRoom(room: Room, logger: (funName: string, ...param: any[]) => void) {
    window.room = room;
    registerDisplayer(room, logger);

    function updateIframePluginState() {
        // iframe 根据 disableDeviceInputs 禁用操作，主动修改该值后，需要调用 updateIframePluginState 来更新状态
        // tslint:disable-next-line:no-unused-expression
        room.getInvisiblePlugin("IframeBridge") && (room.getInvisiblePlugin("IframeBridge")! as any).computedZindex();
        // tslint:disable-next-line:no-unused-expression
        room.getInvisiblePlugin("IframeBridge") && (room.getInvisiblePlugin("IframeBridge")! as any).updateStyle();
    }

    dsBridge.register(roomNamespace, {
        setWindowManagerAttributes
    });

    dsBridge.register(pptNamespace, {
        nextStep: () => {
            room.pptNextStep();
        },
        previousStep: () => {
            room.pptPreviousStep();
        },
    });
    dsBridge.register(roomSyncNamespace, {
        syncBlockTimestamp: (timestamp: number) => {
            room.syncBlockTimestamp(timestamp);
        },
        /** 客户端本地效果，会导致 web 2.9.2 和 native 2.9.3 以下出现问题。*/
        disableSerialization: (disable: boolean) => {
            room.disableSerialization = disable;
            /** 单窗口且开启序列化主动触发一次redo,undo次数回调 */
            if (!disable && window.manager == null) {
                dsBridge.call("room.fireCanUndoStepsUpdate", room.canUndoSteps);
                dsBridge.call("room.fireCanRedoStepsUpdate", room.canRedoSteps);
            }
        },
        copy: () => {
            room.copy();
        },
        paste: () => {
            room.paste();
        },
        duplicate: () => {
            room.duplicate();
        },
        delete: () => {
            room.delete();
        },
        disableEraseImage: (disable) => {
            room.disableEraseImage = disable;
        },
    });
    dsBridge.registerAsyn(roomNamespace, {
        /** 取消撤回 */
        redo: (responseCallback: any) => {
            const count = room.redo();
            responseCallback(count);
        },
        /** 撤回 */
        undo: (responseCallback: any) => {
            const count = room.undo();
            responseCallback(count);
        },
        canRedoSteps: (responseCallback: any) => {
            if (window.manager) {
                responseCallback(window.manager.canRedoSteps);
            } else {
                responseCallback(room.canRedoSteps);
            }
        },
        canUndoSteps: (responseCallback: any) => {
            if (window.manager) {
                responseCallback(window.manager.canUndoSteps);
            } else {
                responseCallback(room.canUndoSteps);
            }
        },
        /** set 系列API */
        setGlobalState: (modifyState: Partial<GlobalState>) => {
            room.setGlobalState(modifyState);
        },
        /** 替代切换页面，设置当前场景。path 为想要设置场景的 path */
        setScenePath: (scenePath: string, responseCallback: any) => {
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
        },
        addPage: (params: AddPageParams) => {
            if (window.manager) {
                window.manager.addPage(params)
            } else {
                const dir = room.state.sceneState.contextPath
                const after = params.after
                if (after) {
                    const tIndex = room.state.sceneState.index + 1
                    room.putScenes(dir,  [params.scene || {}], tIndex)
                } else {
                    room.putScenes(dir, [params.scene || {}]);
                }
            }
        },
        nextPage: (responseCallback: any) => {
            if (window.manager) {
                window.manager.nextPage().then((result)=> {
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
        },
        prevPage: (responseCallback: any) => {
            if (window.manager) {
                window.manager.prevPage().then((result)=> {
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
        },
        setMemberState: (memberState: Partial<MemberState>) => {
            room.setMemberState(memberState);
        },
        setViewMode: (viewMode: string) => {
            let mode = ViewMode[viewMode] as any;
            if (mode === undefined) {
                mode = ViewMode.Freedom;
            }
            if (window.manager) {
                window.manager.setViewMode(mode);
            } else {
                room.setViewMode(mode);
            }
        },
        setWritable: (writable: boolean, responseCallback: any) => {
            room.setWritable(writable).then(() => {
                responseCallback(JSON.stringify({ isWritable: room.isWritable, observerId: room.observerId }));
            }).catch(error => {
                responseCallback(JSON.stringify({ __error: { message: error.message, jsStack: error.stack } }));
            });
        },
        /** get 系列 API */
        getMemberState: (responseCallback: any) => {
            return responseCallback(JSON.stringify(room.state.memberState));
        },
        getGlobalState: (responseCallback: any) => {
            return responseCallback(JSON.stringify(room.state.globalState));
        },
        getSceneState: (responseCallback: any) => {
            return responseCallback(JSON.stringify(room.state.sceneState));
        },
        getRoomMembers: (responseCallback: any) => {
            return responseCallback(JSON.stringify(room.state.roomMembers));
        },
        /** @deprecated 使用 scenes 代替，ppt 将作为 scene 的成员变量 */
        getPptImages: (responseCallback: any) => {
            const ppts = room.state.sceneState.scenes.map(s => {
                if (s.ppt) {
                    return s.ppt.src;
                } else {
                    return "";
                }
            });
            return responseCallback(JSON.stringify(ppts));
        },
        setSceneIndex: (index: number, responseCallback: any) => {
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
        },
        getScenes: (responseCallback: any) => {
            return responseCallback(JSON.stringify(room.state.sceneState.scenes));
        },
        getZoomScale: (responseCallback: any) => {
            let scale = 1;
            if (window.manager) {
                scale = window.manager.mainView.camera.scale;
            } else {
                scale = room.state.cameraState.scale;
            }
            return responseCallback(JSON.stringify(scale));
        },
        getBroadcastState: (responseCallback: any) => {
            return responseCallback(JSON.stringify(room.state.broadcastState));
        },
        getRoomPhase: (responseCallback: any) => {
            return responseCallback(room.phase);
        },
        disconnect: (responseCallback: any) => {
            room.disconnect().then(() => {
                responseCallback();
            });
        },
        zoomChange: (scale: number) => {
            room.moveCamera({ scale });
        },
        disableCameraTransform: (disableCamera: boolean) => {
            room.disableCameraTransform = disableCamera;
        },
        disableDeviceInputs: (disable: boolean) => {
            if (window.manager) {
                window.manager.setReadonly(disable);
            }
            room.disableDeviceInputs = disable;
            updateIframePluginState();
        },
        disableOperations: (disableOperations: boolean) => {
            room.disableCameraTransform = disableOperations;
            room.disableDeviceInputs = disableOperations;
            updateIframePluginState();
        },
        disableWindowOperation: (disable: boolean) => {
            window.manager?.setReadonly(disable);
        },
        putScenes: (dir: string, scenes: SceneDefinition[], index: number, responseCallback: any) => {
            room.putScenes(dir, scenes, index);
            responseCallback(JSON.stringify(room.state.sceneState));
        },
        removeScenes: (dirOrPath: string) => {
            room.removeScenes(dirOrPath);
        },
        /* 移动，重命名当前scene，参考 mv 命令 */
        moveScene: (source: string, target: string) => {
            room.moveScene(source, target);
        },
        /**
         * 在指定位置插入文字
         * @param x 第一个字的的左侧边中点，世界坐标系中的 x 坐标
         * @param y 第一个字的的左侧边中点，世界坐标系中的 y 坐标
         * @param textContent 初始化文字的内容
         * @param responseCallback 完成回调
         * @returns 该文字的标识符
         */
        insertText: (x: number, y: number, textContent: string, responseCallback: any) => {
            if (window.manager) {
                responseCallback(window.manager.mainView.insertText(x, y, textContent));
            } else {
                responseCallback(room.insertText(x, y, textContent));
            }
        },
        cleanScene: (retainPpt: boolean) => {
            let retain: boolean;
            if (retainPpt === undefined) {
                retain = false;
            } else {
                retain = !!retainPpt;
            }
            room.cleanCurrentScene(retainPpt);
        },
        insertImage: (imageInfo: ImageInformation) => {
            room.insertImage(imageInfo);
        },
        insertVideo: (videoInfo: VideoPluginInfo) => {
        },
        completeImageUpload: (uuid: string, url: string) => {
            room.completeImageUpload(uuid, url);
        },
        dispatchMagixEvent: (event: EventEntry) => {
            room.dispatchMagixEvent(event.eventName, event.payload);
        },
        setTimeDelay: (delay: number) => {
            room.timeDelay = delay;
        },

        addApp: (kind: string, options: any, attributes: any, responseCallback: any) => {
            if (window.manager) {
                if (kind === "Slide") {
                    const opts = options as AddAppOptions
                    addSlideApp(opts.scenePath!, opts.title!,opts.scenes!)
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
        },

        closeApp: (appId: string, responseCallback: any) => {
            if (window.manager) {
                window.manager.closeApp(appId).then( () => {
                    return responseCallback(undefined);
                });
            }
        },

        getSyncedState: (responseCallback: any) => {
            let result = window.syncedStore ? window.syncedStore!.attributes : {}
            responseCallback(JSON.stringify(result))
        },

        safeSetAttributes: (attributes: any) => {
            window.syncedStore?.safeSetAttributes(attributes)
        },

        safeUpdateAttributes: (keys: string[], attributes: any) => {
            window.syncedStore?.safeUpdateAttributes(keys, attributes)
        }
    });
    // FIXME:同步方法尽量还是放在同步方法里。
    // 由于 Android 不方便改，暂时只把新加的 get 方法放在此处。dsbridge 注册时，同一个注册内容，会被覆盖，而不是合并。
    dsBridge.register(roomStateNamespace, {
        getRoomState: () => {
            const state = room.state;
            if (window.manager) {
                return { ...state, ...{ windowBoxState: window.manager.boxState }, cameraState: window.manager.cameraState, sceneState: window.manager.sceneState, ...{ pageState: window.manager.pageState } };
            } else {
                return { ...state, ...createPageState(state.sceneState) };
            }
        },
        getTimeDelay: () => {
            return room.timeDelay;
        },
        getPhase: () => {
            return room.phase;
        },
        isWritable: () => {
            return room.isWritable;
        },
        debugInfo: () => {
            try {
                const screen = (room as any).screen;
                const { camera, visionRectangle, adaptedRectangle, divElement } = screen;
                return { camera, visionRectangle, adaptedRectangle, divWidth: divElement.clientWidth, divHeight: divElement.clientHeight };
            } catch (error) {
                return { error: error.message };
            }
        },
    });
    registerBridge([pptNamespace, roomNamespace, roomStateNamespace, roomSyncNamespace], logger);
}