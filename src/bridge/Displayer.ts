import dsBridge from "dsbridge";
import {Displayer, Camera, AnimationMode, Rectangle, Player, Room} from "white-web-sdk";
import {convertBound} from "../utils/BoundConvert";
import html2canvas from "html2canvas";
import {isRoom, registerBridge} from "../utils/Funs";
import {NativeCameraBound} from "../utils/ParamTypes";
import {Event as AkkoEvent } from "white-web-sdk";
import {IframeBridge} from "@netless/iframe-bridge";
import { logger } from "../utils/Logger";
import { DisplayerState } from "white-web-sdk";
import { TeleBoxState } from "@netless/telebox-insider";
import { PageState } from "@netless/window-manager";
import { whiteboardContainerId } from "./Register";

export type NativeDisplayerState = DisplayerState & {
    pageState: PageState;
    windowBoxState: TeleBoxState;
}

export function updateGlobalDisplayer(aDisplayer: Displayer) {
    displayer = aDisplayer;
    window.html2canvas = html2canvas;
    (window as any).scenePreview = new AsyncBridgeDisplayer().scenePreview;
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
    html2canvas(div, {useCORS: true, onclone: async function(div: Document): Promise<void> {
        const images = Array.from(div.getElementsByTagName("image"));
        for (const i of images) {
            const image = i as SVGImageElement;
            const url = image.href.baseVal;
            // https://github.com/niklasvh/html2canvas/issues/2104
            const dataUri = await urlContentToDataUri(url);
            image.href.baseVal = dataUri as string;
        }
    }}).then(canvas => {
        const data = canvas.toDataURL();
        document.body.removeChild(div);
        responseCallback(data);
    });
}

let displayer: Displayer;
export class AsyncBridgeDisplayer {
    sceneSnapshot(scenePath: string, responseCallback: any) {
        screenshot(scenePath, displayer.fillSceneSnapshot.bind(displayer), responseCallback);
    }
    
    scenePreview(scenePath: string, responseCallback: any) {
        screenshot(scenePath, displayer.scenePreview.bind(displayer), responseCallback);
    }
}

export class BridgeDisplayer {
    // 尝试让 native 端直接传入 json 格式
    postMessage(payload: any) {
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

    scaleIframeToFit() {
        const iframeBridge = displayer.getInvisiblePlugin("IframeBridge") as IframeBridge | null;
        if (iframeBridge) {
            iframeBridge.scaleIframeToFit();
        }
    }

    setDisableCameraTransform(disable: boolean) {
        displayer.disableCameraTransform = disable;
    }

    getDisableCameraTransform() {
        return displayer.disableCameraTransform;
    }

    setCameraBound = (nativeBound: NativeCameraBound) => {
        const bound = convertBound(nativeBound);
        logger("setCameraBound bound", bound);
        displayer.setCameraBound(bound!);
    }

    getMemberState(memberId: number) {
        return JSON.stringify(displayer.memberState(memberId));
    }

    getWindowManagerAttributes(): any {
        return JSON.parse(JSON.stringify(window.manager?.appManager?.attributes));
    }

    scenePathType(path: string) {
        return displayer.scenePathType(path);
    }

    entireScenes() {
        return displayer.entireScenes();
    }

    getScene(scenePath: string) {
        return displayer.getScene(scenePath);
    }
     
    moveCamera(camera: Partial<Camera> & Readonly<{animationMode?: AnimationMode}>) {
        logger("moveCamera: ", camera);
        displayer.moveCamera(camera);
    }

    moveCameraToContain(contain: Rectangle & Readonly<{
        animationMode?: AnimationMode;
    }>) {
        logger("moveCameraToContain: ", contain);
        displayer.moveCameraToContain(contain);
    }

    refreshViewSize() {
        logger("refreshViewSize");
        displayer.refreshViewSize();
    }

    scalePptToFit(mode: AnimationMode) {
        logger("scalePptToFit", mode);
        displayer.scalePptToFit(mode);
    }

    convertToPointInWorld(x: number, y: number) {
        logger("convertToPointInWorld", x, y);
        const point = displayer.convertToPointInWorld({ x, y });
        return point;
    }


    setBackgroundColor(r: number, g: number, b: number, a?: number) {
        const div = document.getElementById("whiteboard-container")!;
        logger("setBackgroundColor native", r, g, b, a);
        const color = (a === 1 || a === undefined) ? `rgb(${r}, ${g}, ${b})` : `rgb(${r}, ${g}, ${b})`;
        logger("setBackgroundColor color", color);
        div.style.background = color;
    }

    addHighFrequencyEventListener(eventName: string, interval: number) {
        logger("addHighFrequencyEventListener", eventName, interval);
        displayer.addMagixEventListener(eventName, (evts: AkkoEvent[]) => {
            const uuid = (displayer as Room).uuid || (displayer as Player).roomUUID;
            const nativeEvts = evts.map(evt => {
                return { uuid, eventName: evt.event, payload: evt.payload, scope: evt.scope, authorId: evt.authorId };
            });
            if (isRoom(displayer)) {
                dsBridge.call("room.fireHighFrequencyEvent", JSON.stringify(nativeEvts));
            } else {
                dsBridge.call("player.fireHighFrequencyEvent", JSON.stringify(nativeEvts));
            }
        }, interval);
    }

    addMagixEventListener(eventName: string) {
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
    }

    removeMagixEventListener(eventName: string) {
        logger("removeMagixEventListener", eventName);
        displayer.removeMagixEventListener(eventName);
    }
}