import dsBridge from "dsbridge";
import { ImageInformation, ViewMode, Room, SceneDefinition, MemberState, GlobalState } from "white-web-sdk";
import { registerDisplayer } from "../bridge/Displayer";

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

export function registerRoom(room: Room, logger: (funName: string, ...param: any[]) => void) {
    window.room = room;
    registerDisplayer(room, logger);

    dsBridge.register("ppt", {
        nextStep: () => {
            logger("nextStep");
            room.pptNextStep();
        },
        previousStep: () => {
            logger("previousStep");
            room.pptPreviousStep();
        },
    });
    dsBridge.register("room.sync", {
        /** 客户端本地效果，会导致 web 2.9.2 和 native 2.9.3 以下出现问题。*/
        disableSerialization: (disable: boolean) => {
            room.disableSerialization = disable;
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
    dsBridge.registerAsyn("room", {
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
            responseCallback(room.canRedoSteps);
        },
        canUndoSteps: (responseCallback: any) => {
            responseCallback(room.canUndoSteps);
        },
        /** set 系列API */
        /** 暂时无用，不再有具体内容 */
        setGlobalState: (modifyState: Partial<GlobalState>) => {
            logger("setGlobalState", modifyState);
            room.setGlobalState(modifyState);
        },
        /** 替代切换页面，设置当前场景。path 为想要设置场景的 path */
        setScenePath: (scenePath: string, responseCallback: any) => {
            try {
                logger("setScenePath", scenePath);
                room.setScenePath(scenePath);
                responseCallback(JSON.stringify({}));
            } catch (e) {
                return responseCallback(JSON.stringify({ __error: { message: e.message, jsStack: e.stack } }));
            }
        },
        setMemberState: (memberState: Partial<MemberState>) => {
            logger("setMemberState", memberState);
            room.setMemberState(memberState);
        },
        setViewMode: (viewMode: string) => {
            let mode = ViewMode[viewMode] as any;
            if (mode === undefined) {
                mode = ViewMode.Freedom;
            }
            logger("setViewMode", { viewMode, mode });
            room.setViewMode(mode);
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
            logger("getMemberState", room.state.memberState);
            return responseCallback(JSON.stringify(room.state.memberState));
        },
        getGlobalState: (responseCallback: any) => {
            logger("getGlobalState", room.state.globalState);
            return responseCallback(JSON.stringify(room.state.globalState));
        },
        getSceneState: (responseCallback: any) => {
            logger("getSceneState", room.state.sceneState);
            return responseCallback(JSON.stringify(room.state.sceneState));
        },
        getRoomMembers: (responseCallback: any) => {
            logger("getRoomMembers", room.state.roomMembers);
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
            logger("setSceneIndex", index);
            try {
                room.setSceneIndex(index);
                responseCallback(JSON.stringify({}));
            } catch (error) {
                responseCallback(JSON.stringify({ __error: { message: error.message, jsStack: error.stack } }));
            }
        },
        getScenes: (responseCallback: any) => {
            logger("getScenes", room.state.sceneState.scenes);
            return responseCallback(JSON.stringify(room.state.sceneState.scenes));
        },
        getZoomScale: (responseCallback: any) => {
            logger("getZoomScale", room.state.zoomScale);
            return responseCallback(JSON.stringify(room.state.zoomScale));
        },
        getBroadcastState: (responseCallback: any) => {
            logger("getBroadcastState", room.state.zoomScale);
            return responseCallback(JSON.stringify(room.state.broadcastState));
        },
        getRoomPhase: (responseCallback: any) => {
            logger("getRoomPhase", JSON.stringify(room.phase));
            return responseCallback(room.phase);
        },
        disconnect: (responseCallback: any) => {
            room.disconnect().then(() => {
                responseCallback();
            });
        },
        zoomChange: (scale: number) => {
            logger("zoomChange");
            room.moveCamera({ scale });
        },
        disableCameraTransform: (disableCamera: boolean) => {
            logger("disableCameraTransform", disableCamera);
            room.disableCameraTransform = disableCamera;
        },
        disableDeviceInputs: (disable: boolean) => {
            logger("disableDeviceInputs", disable);
            room.disableDeviceInputs = disable;
        },
        disableOperations: (disableOperations: boolean) => {
            logger("disableOperations", disableOperations);
            room.disableCameraTransform = disableOperations;
            room.disableDeviceInputs = disableOperations;
        },
        putScenes: (dir: string, scenes: SceneDefinition[], index: number, responseCallback: any) => {
            logger("putScenes", scenes);
            room.putScenes(dir, scenes, index);
            responseCallback(JSON.stringify(room.state.sceneState));
        },
        removeScenes: (dirOrPath: string) => {
            logger("removeScenes", dirOrPath);
            room.removeScenes(dirOrPath);
        },
        /* 移动，重命名当前scene，参考 mv 命令 */
        moveScene: (source: string, target: string) => {
            logger("moveScene", source, target);
            room.moveScene(source, target);
        },
        cleanScene: (retainPpt: boolean) => {
            let retain: boolean;
            if (retainPpt === undefined) {
                retain = false;
            } else {
                retain = !!retainPpt;
            }
            logger("cleanCurrentScene: ", retainPpt);
            room.cleanCurrentScene(retainPpt);
        },
        insertImage: (imageInfo: ImageInformation) => {
            logger("insertImage", imageInfo);
            room.insertImage(imageInfo);
        },
        insertVideo: (videoInfo: VideoPluginInfo) => {
            logger("insertVideo", videoInfo);
        },
        completeImageUpload: (uuid: string, url: string) => {
            logger("completeImageUpload", uuid, url);
            room.completeImageUpload(uuid, url);
        },
        dispatchMagixEvent: (event: EventEntry) => {
            logger("dispatchMagixEvent", event);
            room.dispatchMagixEvent(event.eventName, event.payload);
        },
        setTimeDelay: (delay: number) => {
            logger("setTimeDelay", delay);
            room.timeDelay = delay;
        },
    });
    // FIXME:同步方法尽量还是放在同步方法里。
    // 由于 Android 不方便改，暂时只把新加的 get 方法放在此处。dsbridge 注册时，同一个注册内容，会被覆盖，而不是合并。
    dsBridge.register("room.state", {
        getRoomState: () => {
            return room.state;
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
}