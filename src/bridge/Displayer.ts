import dsBridge from "dsbridge";
import {Displayer, Camera, AnimationMode, Rectangle, Player, Room} from "white-web-sdk";
import {convertBound} from "../utils/BoundConvert";
import html2canvas from "html2canvas";
import {isRoom} from "../utils/Funs";
import {NativeCameraBound} from "../utils/ParamTypes";
import {Event as AkkoEvent } from "white-web-sdk";


export function registerDisplayer(displayer: Displayer, logger: (funName: string, ...param: any[]) => void) {

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
        const whiteboard = document.getElementById("whiteboard-container");
        if (whiteboard) {
            const color = window.getComputedStyle(whiteboard).backgroundColor;
            div.style.background = color;
        }

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
