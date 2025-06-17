import { register, registerAsyn, call } from ".";
import { Displayer, Camera, AnimationMode, Rectangle, Player, Room, DisplayerState } from "white-web-sdk";
import { convertBound } from "../utils/BoundConvert";
import html2canvas from "html2canvas";
import { addBridgeLogHook, isRoom } from "../utils/Funs";
import type { NativeCameraBound } from "@netless/whiteboard-bridge-types";
import { Event as AkkoEvent } from "white-web-sdk";
import { IframeBridge } from "@netless/iframe-bridge";
import { TeleBoxState } from "@netless/telebox-insider";
import { PageState } from "@netless/window-manager";
import { whiteboardContainerId } from "../App";
import { logger } from "../utils/Logger";

export type NativeDisplayerState = DisplayerState & {
    pageState: PageState;
    windowBoxState: TeleBoxState;
    appState: {
        focusedId: string | undefined;
        appIds: string[];
    };
}

const displayerNameSpace = "displayer";
const asyncDisplayerNameSpace = "displayerAsync";

export function registerDisplayerBridge(aDisplayer: Displayer) {
    register(displayerNameSpace, new DisplayerBridge(aDisplayer));
    registerAsyn(asyncDisplayerNameSpace, new AsyncDisplayerBridge(aDisplayer));
    addBridgeLogHook([displayerNameSpace, asyncDisplayerNameSpace], logger);
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

function setBackgroundColor(r: number, g: number, b: number, a?: number) {
    const div = document.getElementById(whiteboardContainerId);
    if (div) {
        const color = (a === 1 || a === undefined) ? `rgb(${r}, ${g}, ${b})` : `rgb(${r}, ${g}, ${b})`;
        div.style.background = color;
    } else {
        console.log(whiteboardContainerId, "not exist");
    }
}
window.setBackgroundColor = setBackgroundColor;

function screenshot(scenePath: string, fn: (scenePath: string, div: HTMLElement, width: number, height: number) => void | Promise<void>, responseCallback: any) {
    const div = document.createElement("div");
    div.setAttribute("class", "shadow");
    const whiteboard = document.getElementById(whiteboardContainerId);
    if (whiteboard) {
        const color = window.getComputedStyle(whiteboard).backgroundColor;
        div.style.background = color;
    }
    document.body.appendChild(div);
    Promise.resolve(fn(scenePath, div, div.clientWidth, div.clientHeight)).then(() => {
        return html2canvas(div, {
            useCORS: true, 
            onclone: async function (div: Document): Promise<void> {
                const images = Array.from(div.getElementsByTagName("image"));
                for (const i of images) {
                    const image = i as SVGImageElement;
                    const url = image.href.baseVal;
                    // https://github.com/niklasvh/html2canvas/issues/2104
                    const dataUri = await urlContentToDataUri(url);
                    image.href.baseVal = dataUri as string;
                }
            }
        });
    }).then(canvas => {
        const data = canvas.toDataURL();
        document.body.removeChild(div);
        responseCallback(data);
    });
}

export class AsyncDisplayerBridge {
    constructor(readonly aDisplayer: Displayer) { }

    sceneSnapshot = (scenePath: string, responseCallback: any) => {
        const f = window.appliancePlugin ?
            (this.aDisplayer as any).fillSceneSnapshotAsync.bind(this.aDisplayer) :
            this.aDisplayer.fillSceneSnapshot.bind(this.aDisplayer);
        screenshot(scenePath, f, responseCallback);
    };

    scenePreview = (scenePath: string, responseCallback: any) => {
        const f = window.appliancePlugin ?
            (this.aDisplayer as any).scenePreviewAsync.bind(this.aDisplayer) :
            this.aDisplayer.scenePreview.bind(this.aDisplayer);
        screenshot(scenePath,f, responseCallback);
    };
}

export class DisplayerBridge {
    constructor(readonly aDisplayer: Displayer) { }
    // 尝试让 native 端直接传入 json 格式
    postMessage = (payload: any) => {
        const message = { name: "parentWindow", payload: payload };
        const iframes = document.getElementsByTagName("iframe");
        if (iframes.length > 0 && iframes[0].contentWindow) {
            const iframe = iframes[0];
            iframe.contentWindow!.postMessage(message, "*");
        } else if (iframes.length == 0) {
            logger("postmessage fail", "no frames exist");
        } else {
            logger("postmessage fail", "no content Window");
        }
    }

    scaleIframeToFit = () => {
        const iframeBridge = this.aDisplayer.getInvisiblePlugin("IframeBridge") as IframeBridge | null;
        if (iframeBridge) {
            iframeBridge.scaleIframeToFit();
        }
    }

    setDisableCameraTransform = (disable: boolean) => {
        this.aDisplayer.disableCameraTransform = disable;
    }

    getDisableCameraTransform = () => {
        return this.aDisplayer.disableCameraTransform;
    }

    setCameraBound = (nativeBound: NativeCameraBound) => {
        const bound = convertBound(nativeBound);
        this.aDisplayer.setCameraBound(bound!);
    }

    getMemberState = (memberId: number) => {
        return JSON.stringify(this.aDisplayer.memberState(memberId));
    }

    getWindowManagerAttributes = () => {
        return JSON.parse(JSON.stringify(window.manager?.appManager?.attributes));
    }

    scenePathType = (path: string) => {
        return this.aDisplayer.scenePathType(path);
    }

    entireScenes = () => {
        return this.aDisplayer.entireScenes();
    }

    getScene = (scenePath: string) => {
        return this.aDisplayer.getScene(scenePath);
    }

    moveCamera = (camera: Partial<Camera> & Readonly<{ animationMode?: AnimationMode }>) => {
        this.aDisplayer.moveCamera(camera);
    }

    moveCameraToContain = (contain: Rectangle & Readonly<{
        animationMode?: AnimationMode;
    }>) => {
        this.aDisplayer.moveCameraToContain(contain);
    }

    refreshViewSize = () => {
        this.aDisplayer.refreshViewSize();
    }

    scalePptToFit = (mode: AnimationMode) => {
        this.aDisplayer.scalePptToFit(mode);
    }

    convertToPointInWorld = (x: number, y: number) => {
        const point = this.aDisplayer.convertToPointInWorld({ x, y });
        return point;
    }

    setBackgroundColor = (r: number, g: number, b: number, a?: number) => {
        const div = document.getElementById(whiteboardContainerId)!;
        const color = (a === 1 || a === undefined) ? `rgb(${r}, ${g}, ${b})` : `rgb(${r}, ${g}, ${b})`;
        div.style.background = color;
    }

    addHighFrequencyEventListener = (eventName: string, interval: number) => {
        this.aDisplayer.addMagixEventListener(eventName, (evts: AkkoEvent[]) => {
            const uuid = (this.aDisplayer as Room).uuid || (this.aDisplayer as Player).roomUUID;
            const nativeEvts = evts.map(evt => {
                return { uuid, eventName: evt.event, payload: evt.payload, scope: evt.scope, authorId: evt.authorId };
            });
            if (isRoom(this.aDisplayer)) {
                call("room.fireHighFrequencyEvent", JSON.stringify(nativeEvts));
            } else {
                call("player.fireHighFrequencyEvent", JSON.stringify(nativeEvts));
            }
        }, interval);
    }

    addMagixEventListener = (eventName: string) => {
        this.aDisplayer.addMagixEventListener(eventName, (evt: AkkoEvent) => {
            const uuid = (this.aDisplayer as Room).uuid || (this.aDisplayer as Player).roomUUID;
            const nativeEvt = {
                uuid: uuid,
                eventName: evt.event,
                payload: evt.payload,
                scope: evt.scope,
                authorId: evt.authorId,
            };
            if (isRoom(this.aDisplayer)) {
                call("room.fireMagixEvent", JSON.stringify(nativeEvt));
            } else {
                call("player.fireMagixEvent", JSON.stringify(nativeEvt));
            }
        });
    }

    removeMagixEventListener = (eventName: string) => {
        this.aDisplayer.removeMagixEventListener(eventName);
    }
}