import dsBridge from "dsbridge";
import {Displayer, Camera, ImageInformation, ViewMode, AnimationMode, Rectangle, Player, Room, SceneDefinition, ObserverMode, MemberState, GlobalState} from "white-web-sdk";
import {convertBound} from "./BoundConvert";
import html2canvas from "html2canvas";
import {isRoom} from "./Funs";
import {NativeCameraBound} from "./ParamTypes";
import {Event as AkkoEvent } from "white-web-sdk";

function registerDisplayer(displayer: Displayer, logger: (funName: string, ...param: any[]) => void) {

    const setCameraBound = (nativeBound: NativeCameraBound) => {
        logger("setCameraBound nativeBound", nativeBound);
        const bound = convertBound(nativeBound);
        logger("setCameraBound bound", bound);
        displayer.setCameraBound(bound!);
    }
    
    const pageCover = (scenePath: string, responseCallback: any) => {
        screenshot(scenePath, displayer.fillSceneSnapshot.bind(displayer), responseCallback);
    }
    
    const pagePreview = (scenePath: string, responseCallback: any) => {
        screenshot(scenePath, displayer.scenePreview.bind(displayer), responseCallback);
    }
    
    const screenshot = (scenePath: string, fn: (scenePath: string, div: HTMLElement, width: number, height: number) => void, responseCallback: any) => {
        const div = document.createElement("div");
        div.setAttribute("class", "shadow");
        document.body.appendChild(div);
        fn(scenePath, div, div.clientWidth, div.clientHeight);
        html2canvas(div, {useCORS: true, onclone: function(div: Document): void {
            Array.from(div.getElementsByTagName("svg")).forEach(s => {
                // https://github.com/eKoopmans/html2pdf.js/issues/185
                // https://github.com/niklasvh/html2canvas/issues/1578
                s.setAttribute("width", `${s.clientWidth}`);
                s.setAttribute("height", `${s.clientHeight}`);
            });
        }}).then(canvas => {
            (window as any).canvas = canvas;
            const data = canvas.toDataURL();
            document.body.removeChild(div);
            responseCallback(data);
        });
    }

    dsBridge.register("displayer", {
        setDisableCameraTransform: (disable: boolean) => {
            displayer.disableCameraTransform = disable;
        },
        getDisableCameraTransform: () => {
            return displayer.disableCameraTransform;
        },
        setCameraBound: setCameraBound,
        getMemberState: (memberId: number) => {
            return JSON.stringify(displayer.memberState(memberId));
        },
        scenePathType: (path: string) => {
            return displayer.scenePathType(path);
        },
        entireScenes: () => {
            return displayer.entireScenes();
        },
        moveCamera: (camera: Partial<Camera> & Readonly<{animationMode?: AnimationMode}>) => {
            logger("moveCamera: ", camera);
            displayer.moveCamera(camera);
        },
        moveCameraToContain: (contain: Rectangle & Readonly<{
            animationMode?: AnimationMode;
        }>) => {
            logger("moveCameraToContain: ", contain);
            displayer.moveCameraToContain(contain);
        },
        refreshViewSize: () => {
            logger("refreshViewSize");
            displayer.refreshViewSize();
        },
        scalePptToFit: (mode: AnimationMode) => {
            logger("scalePptToFit", mode);
            displayer.scalePptToFit(mode);
        },
        convertToPointInWorld: (x: number, y: number) => {
            logger("convertToPointInWorld", x, y);
            const point = displayer.convertToPointInWorld({x, y});
            return point;
        },
        setBackgroundColor: (r: number, g: number, b: number, a?: number) => {
            const div = document.getElementById("whiteboard-container")!;
            logger("setBackgroundColor native", r, g, b, a);
            const color = (a === 1 || a === undefined) ? `rgb(${r}, ${g}, ${b})` : `rgb(${r}, ${g}, ${b})`;
            logger("setBackgroundColor color", color);
            div.style.background = color;
        },
        addHighFrequencyEventListener: (eventName: string, interval: number) => {
            logger("addHighFrequencyEventListener", eventName, interval);
            displayer.addMagixEventListener(eventName, (evts: AkkoEvent[]) => {
                const uuid = (displayer as Room).uuid || (displayer as Player).roomUUID;
                const nativeEvts = evts.map(evt => {
                    return {uuid, eventName: evt.event, payload: evt.payload, scope: evt.scope, authorId: evt.authorId};
                });
                if (isRoom(displayer)) {
                    dsBridge.call("room.fireHighFrequencyEvent", JSON.stringify(nativeEvts));
                } else {
                    dsBridge.call("player.fireHighFrequencyEvent", JSON.stringify(nativeEvts));
                }
            }, interval);
        },
        addMagixEventListener: (eventName: string) => {
            logger("addMagixEventListener", eventName);
            displayer.addMagixEventListener(eventName, (evt: AkkoEvent) => {
                logger("fireMagixEvent", evt);
                const uuid = (displayer as Room).uuid || (displayer as Player).roomUUID;
                const nativeEvt = {
                    uuid: uuid,
                    eventName: evt.event,
                    payload: evt.payload,
                    scope: evt.scope,
                    authorId: evt.authorId,
                };
                if (isRoom(displayer)) {
                    dsBridge.call("room.fireMagixEvent", JSON.stringify(nativeEvt));
                } else {
                    dsBridge.call("player.fireMagixEvent", JSON.stringify(nativeEvt));
                }
            });
        },
        removeMagixEventListener: (eventName: string) => {
            logger("removeMagixEventListener", eventName);
            displayer.removeMagixEventListener(eventName);
        },
    });
    dsBridge.registerAsyn("displayerAsync", {
        scenePreview: pagePreview,
        sceneSnapshot: pageCover,
    });
    window.html2canvas = html2canvas;
    (window as any).pagePreview = pagePreview;
}

export function registerPlayer(player: Player, logger: (funName: string, ...param: any[]) => void) {
    window.player = player;
    registerDisplayer(player, logger);
    const stop = () => {
        try {
            logger("stop");
            player.stop();
        } catch (error) {
            console.log("stop:", error.message);
        }
    }

    dsBridge.registerAsyn("player", {
        play: () => {
            logger("play");
            player.play();
        },
        pause: () => {
            logger("pause");
            player.pause();
        },
        stop: () => {
            logger("stop");
            player.stop();
        },
        seekToScheduleTime: (beginTime: number) => {
            logger("seekToScheduleTime", beginTime);
            player.seekToScheduleTime(beginTime);
        },
        setObserverMode: (observerMode: string) => {
            logger("setObserverMode", observerMode);
            player.setObserverMode(observerMode as ObserverMode);
        },
        setPlaybackSpeed: (rate: number) => {
            logger("playbackSpeed", rate);
            player.playbackSpeed = rate;
        },
    });

    dsBridge.register("player.state", {
        roomUUID: () => {
            return player.roomUUID;
        },
        phase: () => {
            logger("phase", player.phase);
            return player.phase;
        },
        playerState: () => {
            // 如果没有加载第一帧，会直接报错
            try {
                logger("playerState", player.state);
                return player.state;
            } catch (error) {
                return {};
            }
        },
        playbackSpeed: () => {
            logger("playbackSpeed", player.playbackSpeed);
            return player.playbackSpeed;
        },
        timeInfo: () => {
            const {scheduleTime, timeDuration, framesCount, beginTimestamp} = player;
            const info = {scheduleTime, timeDuration, framesCount, beginTimestamp};
            logger("timeInfo", info);
            return info;
        },
    });
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

export function registerRoom(room: Room, logger: (funName: string, ...param: any[]) => void) {
    window.room = room;
    registerDisplayer(room, logger);

    const cleanCurrentScene = (retainPpt: boolean) => {
        logger("cleanCurrentScene: ", retainPpt);
        room.cleanCurrentScene(retainPpt);
    }

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
                return responseCallback(JSON.stringify({__error: {message: e.message, jsStack: e.stack}}));
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
            logger("setViewMode", {viewMode, mode});
            room.setViewMode(mode);
        },
        setWritable: (writable: boolean, responseCallback: any) => {
            room.setWritable(writable).then(() => {
                responseCallback(JSON.stringify({isWritable: room.isWritable, observerId: room.observerId}));
            }).catch(error => {
                responseCallback(JSON.stringify({__error: {message: error.message, jsStack: error.stack}}));
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
                responseCallback(JSON.stringify({__error: {message: error.message, jsStack: error.stack}}));
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
            room.moveCamera({scale});
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
            logger("cleanScene", retainPpt);
            // TODO: web sdk 2.6.1 将会修复该问题，到时候切换回去
            cleanCurrentScene(retain);
        },
        insertImage: (imageInfo: ImageInformation) => {
            logger("insertImage", imageInfo);
            room.insertImage(imageInfo);
        },
        insertVideo: (videoInfo: VideoPluginInfo) => {
            logger("insertVideo", videoInfo);
            // TODO: insertVideo
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
                const {camera, visionRectangle, adaptedRectangle, divElement} = screen;
                return {camera, visionRectangle, adaptedRectangle, divWidth: divElement.clientWidth, divHeight: divElement.clientHeight};
            } catch (error) {
                return {error: error.message};
            }
        },
    });
}