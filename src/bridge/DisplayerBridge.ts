import dsBridge from "dsbridge";
import { Displayer, Camera, AnimationMode, Rectangle, Player, Room, DisplayerState, ScenePathType, SceneMap, WhiteScene } from "white-web-sdk";
import { convertBound } from "../utils/BoundConvert";
import html2canvas from "html2canvas";
import { isRoom } from "../utils/Funs";
import { NativeCameraBound } from "../utils/ParamTypes";
import { Event as AkkoEvent } from "white-web-sdk";
import { IframeBridge } from "@netless/iframe-bridge";
import { TeleBoxState } from "@netless/telebox-insider";
import { PageState } from "@netless/window-manager";
import { whiteboardContainerId } from "..";
import { logger } from "../utils/Logger";

export type NativeDisplayerState = DisplayerState & {
    pageState: PageState;
    windowBoxState: TeleBoxState;
}

export const displayerNameSpace = "displayer";
export const asyncDisplayerNameSpace = "displayerAsync";

export function registerDisplayerBridge(aDisplayer: Displayer) {
    dsBridge.register(displayerNameSpace, new DisplayerBridge(aDisplayer));
    dsBridge.registerAsyn(asyncDisplayerNameSpace, new AsyncDisplayerBridge(aDisplayer));
}

function urlContentToDataUri(url) {
    return fetch(url)
        .then((response) => response.blob())
        .then((blob) => new Promise((callback) => {
            let reader = new FileReader();
            reader.onload = function () {
                callback(this.result);
            };
            reader.readAsDataURL(blob);
        })
        );
}

function screenshot(scenePath: string, fn: (scenePath: string, div: HTMLElement, width: number, height: number) => void, responseCallback: any) {
    const div = document.createElement("div");
    div.setAttribute("class", "shadow");
    const whiteboard = document.getElementById(whiteboardContainerId);
    if (whiteboard) {
        const color = window.getComputedStyle(whiteboard).backgroundColor;
        div.style.background = color;
    }
    document.body.appendChild(div);
    fn(scenePath, div, div.clientWidth, div.clientHeight);
    html2canvas(div, {
        useCORS: true, onclone: async function (div: Document): Promise<void> {
            const images = Array.from(div.getElementsByTagName("image"));
            for (const i of images) {
                const image = i as SVGImageElement;
                const url = image.href.baseVal;
                // https://github.com/niklasvh/html2canvas/issues/2104
                const dataUri = await urlContentToDataUri(url);
                image.href.baseVal = dataUri as string;
            }
        }
    }).then(canvas => {
        const data = canvas.toDataURL();
        document.body.removeChild(div);
        responseCallback(data);
    });
}

export class AsyncDisplayerBridge {
    sceneSnapshot: (scenePath: string, responseCallback: any) => void;
    scenePreview: (scenePath: string, responseCallback: any) => void;

    constructor(aDisplayer: Displayer) {
        this.sceneSnapshot = (scenePath: string, responseCallback: any) => {
            screenshot(scenePath, aDisplayer.fillSceneSnapshot.bind(aDisplayer), responseCallback);
        };

        this.scenePreview = (scenePath: string, responseCallback: any) => {
            screenshot(scenePath, aDisplayer.scenePreview.bind(aDisplayer), responseCallback);
        };
    }
}

export class DisplayerBridge {
    postMessage: (payload: any) => void;
    scaleIframeToFit: () => void;
    setDisableCameraTransform: (disable: boolean) => void;
    getDisableCameraTransform: () => void;
    setCameraBound: (nativeBound: NativeCameraBound) => void;
    getMemberState: (memberId: number) => void;
    getWindowManagerAttributes: () => any;
    scenePathType: (path: string) => ScenePathType;
    entireScenes: () => SceneMap;
    getScene: (scenePath: string) => WhiteScene | undefined;
    moveCamera: (camera: Partial<Camera> & Readonly<{ animationMode?: AnimationMode }>) => void;
    moveCameraToContain: (contain: Rectangle & Readonly<{
        animationMode?: AnimationMode;
    }>) => void;
    refreshViewSize: () => void;
    scalePptToFit: (mode: AnimationMode) => void;
    convertToPointInWorld: (x: number, y: number) => {
        x: number;
        y: number;
    };
    setBackgroundColor: (r: number, g: number, b: number, a?: number) => void;
    addHighFrequencyEventListener: (eventName: string, interval: number) => void;
    addMagixEventListener: (eventName: string) => void;
    removeMagixEventListener: (eventName: string) => void;

    constructor(aDisplayer: Displayer) {
        // 尝试让 native 端直接传入 json 格式
        this.postMessage = (payload: any) => {
            const message = { name: "parentWindow", payload: payload };
            const iframes = document.getElementsByTagName("iframe");
            if (iframes.length > 0 && iframes[0].contentWindow) {
                const iframe = iframes[0];
                iframe.contentWindow!.postMessage(message, "*");
            } else if (iframes.length == 0) {
                logger("postmessage", "no frames exist");
            } else {
                logger("postmessage", "no content Window");
            }
        }

        this.scaleIframeToFit = () => {
            const iframeBridge = aDisplayer.getInvisiblePlugin("IframeBridge") as IframeBridge | null;
            if (iframeBridge) {
                iframeBridge.scaleIframeToFit();
            }
        }

        this.setDisableCameraTransform = (disable: boolean) => {
            aDisplayer.disableCameraTransform = disable;
        }

        this.getDisableCameraTransform = () => {
            return aDisplayer.disableCameraTransform;
        }

        this.setCameraBound = (nativeBound: NativeCameraBound) => {
            const bound = convertBound(nativeBound);
            aDisplayer.setCameraBound(bound!);
        }

        this.getMemberState = (memberId: number) => {
            return JSON.stringify(aDisplayer.memberState(memberId));
        }

        this.getWindowManagerAttributes = () => {
            return JSON.parse(JSON.stringify(window.manager?.appManager?.attributes));
        }

        this.scenePathType = (path: string) => {
            return aDisplayer.scenePathType(path);
        }

        this.entireScenes = () => {
            return aDisplayer.entireScenes();
        }

        this.getScene = (scenePath: string) => {
            return aDisplayer.getScene(scenePath);
        }

        this.moveCamera = (camera: Partial<Camera> & Readonly<{ animationMode?: AnimationMode }>) => {
            aDisplayer.moveCamera(camera);
        }

        this.moveCameraToContain = (contain: Rectangle & Readonly<{
            animationMode?: AnimationMode;
        }>) => {
            aDisplayer.moveCameraToContain(contain);
        }

        this.refreshViewSize = () => {
            aDisplayer.refreshViewSize();
        }

        this.scalePptToFit = (mode: AnimationMode) => {
            aDisplayer.scalePptToFit(mode);
        }

        this.convertToPointInWorld = (x: number, y: number) => {
            const point = aDisplayer.convertToPointInWorld({ x, y });
            return point;
        }

        this.setBackgroundColor = (r: number, g: number, b: number, a?: number) => {
            const div = document.getElementById(whiteboardContainerId)!;
            logger("setBackgroundColor native", r, g, b, a);
            const color = (a === 1 || a === undefined) ? `rgb(${r}, ${g}, ${b})` : `rgb(${r}, ${g}, ${b})`;
            div.style.background = color;
        }

        this.addHighFrequencyEventListener = (eventName: string, interval: number) => {
            aDisplayer.addMagixEventListener(eventName, (evts: AkkoEvent[]) => {
                const uuid = (aDisplayer as Room).uuid || (aDisplayer as Player).roomUUID;
                const nativeEvts = evts.map(evt => {
                    return { uuid, eventName: evt.event, payload: evt.payload, scope: evt.scope, authorId: evt.authorId };
                });
                if (isRoom(aDisplayer)) {
                    dsBridge.call("room.fireHighFrequencyEvent", JSON.stringify(nativeEvts));
                } else {
                    dsBridge.call("player.fireHighFrequencyEvent", JSON.stringify(nativeEvts));
                }
            }, interval);
        }

        this.addMagixEventListener = (eventName: string) => {
            aDisplayer.addMagixEventListener(eventName, (evt: AkkoEvent) => {
                const uuid = (aDisplayer as Room).uuid || (aDisplayer as Player).roomUUID;
                const nativeEvt = {
                    uuid: uuid,
                    eventName: evt.event,
                    payload: evt.payload,
                    scope: evt.scope,
                    authorId: evt.authorId,
                };
                if (isRoom(aDisplayer)) {
                    dsBridge.call("room.fireMagixEvent", JSON.stringify(nativeEvt));
                } else {
                    dsBridge.call("player.fireMagixEvent", JSON.stringify(nativeEvt));
                }
            });
        }

        this.removeMagixEventListener = (eventName: string) => {
            aDisplayer.removeMagixEventListener(eventName);
        }
    }
}