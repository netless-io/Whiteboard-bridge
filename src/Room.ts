import dsBridge from "dsbridge";
import {
    ImageInformation,
    GlobalState,
    MemberState,
    Room,
    ViewMode,
    SceneDefinition,
} from "white-web-sdk";
import { DisplayerBridge } from "./Displayer";

// common types
type PluginInformation = {
    readonly protocal: string;
    readonly props?: {
        [key: string]: any;
    };
    readonly centerX: number;
    readonly centerY: number;
    readonly width: number;
    readonly height: number;
};

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

export class RoomBridge extends DisplayerBridge {

    public bindHtmlElement(element: HTMLDivElement | null): void {
        this.room.bindHtmlElement(element);
    }

    private cleanCurrentScene(retainPpt: boolean): void {
        const sceneState = this.room.state.sceneState;
        const scene = {
            name: sceneState.scenes[sceneState.index].name,
            ppt: (retainPpt ? sceneState.scenes[sceneState.index].ppt : undefined),
        };
        const paths: string[] = sceneState.scenePath.split("/");
        paths.pop();
        const path = paths.join("/");
        this.room.putScenes(path, [scene], sceneState.index);
        this.room.setScenePath(sceneState.scenePath);
    }

    public constructor(public readonly room: Room, protected readonly logger: (funName: string, ...param: any[]) => void) {
        super(room, logger);
        dsBridge.register("ppt", {
            nextStep: () => {
                this.logger("nextStep");
                this.room.pptNextStep();
            },
            previousStep: () => {
                this.logger("previousStep");
                this.room.pptPreviousStep();
            },
        });
        dsBridge.registerAsyn("room", {
            /** set 系列API */
            /** 暂时无用，不再有具体内容 */
            setGlobalState: (modifyState: Partial<GlobalState>) => {
                this.logger("setGlobalState", modifyState);
                this.room.setGlobalState(modifyState);
            },
            /** 替代切换页面，设置当前场景。path 为想要设置场景的 path */
            setScenePath: (scenePath: string, responseCallback: any) => {
                try {
                    this.logger("setScenePath", scenePath);
                    this.room.setScenePath(scenePath);
                    responseCallback(JSON.stringify({}));
                } catch (e) {
                    return responseCallback(JSON.stringify({__error: {message: e.message, jsStack: e.stack}}));
                }
            },
            setMemberState: (memberState: Partial<MemberState>) => {
                this.logger("setMemberState", memberState);
                this.room.setMemberState(memberState);
            },
            setViewMode: (viewMode: string) => {
                let mode = ViewMode[viewMode] as any;
                if (mode === undefined) {
                    mode = ViewMode.Freedom;
                }
                this.logger("setViewMode", {viewMode, mode});
                this.room.setViewMode(mode);
            },
            setWritable: (writable: boolean, responseCallback: any) => {
                this.room.setWritable(writable).then(() => {
                    responseCallback(JSON.stringify({isWritable: this.room.isWritable, observerId: this.room.observerId}));
                }).catch(error => {
                    responseCallback(JSON.stringify({__error: {message: error.message, jsStack: error.stack}}));
                });
            },
            /** get 系列 API */
            getMemberState: (responseCallback: any) => {
                this.logger("getMemberState", this.room.state.memberState);
                return responseCallback(JSON.stringify(this.room.state.memberState));
            },
            getGlobalState: (responseCallback: any) => {
                this.logger("getGlobalState", this.room.state.globalState);
                return responseCallback(JSON.stringify(this.room.state.globalState));
            },
            getSceneState: (responseCallback: any) => {
                this.logger("getSceneState", this.room.state.sceneState);
                return responseCallback(JSON.stringify(this.room.state.sceneState));
            },
            getRoomMembers: (responseCallback: any) => {
                this.logger("getRoomMembers", this.room.state.roomMembers);
                return responseCallback(JSON.stringify(this.room.state.roomMembers));
            },
            /** @deprecated 使用 scenes 代替，ppt 将作为 scene 的成员变量 */
            getPptImages: (responseCallback: any) => {
                const ppts = this.room.state.sceneState.scenes.map(s => {
                    if (s.ppt) {
                        return s.ppt.src;
                    } else {
                        return "";
                    }
                });
                return responseCallback(JSON.stringify(ppts));
            },
            setSceneIndex: (index: number, responseCallback: any) => {
                this.logger("setSceneIndex", index);
                try {
                    this.room.setSceneIndex(index);
                    responseCallback(JSON.stringify({}));
                } catch (error) {
                    responseCallback(JSON.stringify({__error: {message: error.message, jsStack: error.stack}}));
                }
            },
            getScenes: (responseCallback: any) => {
                this.logger("getScenes", this.room.state.sceneState.scenes);
                return responseCallback(JSON.stringify(this.room.state.sceneState.scenes));
            },
            getZoomScale: (responseCallback: any) => {
                this.logger("getZoomScale", this.room.state.zoomScale);
                return responseCallback(JSON.stringify(this.room.state.zoomScale));
            },
            getBroadcastState: (responseCallback: any) => {
                this.logger("getBroadcastState", this.room.state.zoomScale);
                return responseCallback(JSON.stringify(this.room.state.broadcastState));
            },
            getRoomPhase: (responseCallback: any) => {
                this.logger("getRoomPhase", JSON.stringify(this.room.phase));
                return responseCallback(this.room.phase);
            },
            disconnect: (responseCallback: any) => {
                this.room.disconnect().then(() => {
                    responseCallback();
                });
            },
            zoomChange: (scale: number) => {
                this.logger("zoomChange");
                this.room.zoomChange(scale);
            },
            disableCameraTransform: (disableCamera: boolean) => {
                this.logger("disableCameraTransform", disableCamera);
                this.room.disableCameraTransform = disableCamera;
            },
            disableDeviceInputs: (disable: boolean) => {
                this.logger("disableDeviceInputs", disable);
                this.room.disableDeviceInputs = disable;
            },
            disableOperations: (disableOperations: boolean) => {
                this.logger("disableOperations", disableOperations);
                this.room.disableOperations = disableOperations;
            },
            putScenes: (dir: string, scenes: SceneDefinition[], index: number, responseCallback: any) => {
                this.logger("putScenes", scenes);
                this.room.putScenes(dir, scenes, index);
                responseCallback(JSON.stringify(this.room.state.sceneState));
            },
            removeScenes: (dirOrPath: string) => {
                this.logger("removeScenes", dirOrPath);
                this.room.removeScenes(dirOrPath);
            },
            /* 移动，重命名当前scene，参考 mv 命令 */
            moveScene: (source: string, target: string) => {
                this.logger("moveScene", source, target);
                this.room.moveScene(source, target);
            },
            cleanScene: (retainPpt: boolean) => {
                let retain: boolean;
                if (retainPpt === undefined) {
                    retain = false;
                } else {
                    retain = !!retainPpt;
                }
                this.logger("cleanScene", retainPpt);
                // TODO: web sdk 2.6.1 将会修复该问题，到时候切换回去
                this.cleanCurrentScene(retain);
            },
            insertImage: (imageInfo: ImageInformation) => {
                this.logger("insertImage", imageInfo);
                this.room.insertImage(imageInfo);
            },
            insertVideo: (videoInfo: VideoPluginInfo) => {
                this.logger("insertVideo", videoInfo);
                // TODO: insertVideo
            },
            completeImageUpload: (uuid: string, url: string) => {
                this.logger("completeImageUpload", uuid, url);
                this.room.completeImageUpload(uuid, url);
            },
            dispatchMagixEvent: (event: EventEntry) => {
                this.logger("dispatchMagixEvent", event);
                this.room.dispatchMagixEvent(event.eventName, event.payload);
            },
            setTimeDelay: (delay: number) => {
                this.logger("setTimeDelay", delay);
                this.room.timeDelay = delay;
            },
        });
        // FIXME:同步方法尽量还是放在同步方法里。
        // 由于 Android 不方便改，暂时只把新加的 get 方法放在此处。dsbridge 注册时，同一个注册内容，会被覆盖，而不是合并。
        dsBridge.register("room.state", {
            getRoomState: () => {
                return this.room.state;
            },
            getTimeDelay: () => {
                return this.room.timeDelay;
            },
            getPhase: () => {
                return this.room.phase;
            },
            isWritable: () => {
                return this.room.isWritable;
            },
            debugInfo: () => {
                try {
                    const screen = (this.room as any).screen;
                    const {camera, visionRectangle, adaptedRectangle, divElement} = screen;
                    return {camera, visionRectangle, adaptedRectangle, divWidth: divElement.clientWidth, divHeight: divElement.clientHeight};
                } catch (error) {
                    return {error: error.message};
                }
            },
        });
    }
}