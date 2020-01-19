import dsBridge from "dsbridge";
import {Displayer, Camera, AnimationMode, Rectangle, Player, Room} from "white-web-sdk";
import {NativeCameraBound, convertToBound} from "./utils/CameraBound";
import html2canvas from "html2canvas";
import {Event as AkkoEvent } from "white-web-sdk";

type NativeEvent = {
    uuid: string;
    eventName: string;
    payload: any;
    scope: string;
    authorId: string;
};

function isRoom(displayer: Displayer): displayer is Room {
    return (displayer as Player).roomUUID === undefined;
}

export class DisplayerBridge {
    public constructor(readonly displayer: Displayer, protected readonly logger: (funName: string, ...param: any[]) => void) {
        dsBridge.register("displayer", {
            setDisableCameraTransform: (disable: boolean) => {
                displayer.disableCameraTransform = disable;
            },
            getDisableCameraTransform: () => {
                return displayer.disableCameraTransform;
            },
            setCameraBound: this.setCameraBound,
            getMemberState: (memberId: number) => {
                return JSON.stringify(displayer.memberState(memberId));
            },
            moveCamera: (camera: Partial<Camera> & Readonly<{animationMode?: AnimationMode}>) => {
                this.logger("moveCamera: ", camera);
                this.displayer.moveCamera(camera);
            },
            moveCameraToContain: (contain: Rectangle & Readonly<{
                animationMode?: AnimationMode;
            }>) => {
                this.logger("moveCameraToContain: ", contain);
                this.displayer.moveCameraToContain(contain);
            },
            refreshViewSize: () => {
                this.logger("refreshViewSize");
                this.displayer.refreshViewSize();
            },
            scalePptToFit: (mode: AnimationMode) => {
                this.logger("scalePptToFit", mode);
                this.displayer.scalePptToFit(mode);
            },
            convertToPointInWorld: (x: number, y: number) => {
                this.logger("convertToPointInWorld", x, y);
                const point = this.displayer.convertToPointInWorld({x, y});
                return point;
            },
            setBackgroundColor: (r: number, g: number, b: number, a?: number) => {
                const div = document.getElementById("whiteboard-container")!;
                this.logger("setBackgroundColor native", r, g, b, a);
                const color = (a === 1 || a === undefined) ? `rgb(${r}, ${g}, ${b})` : `rgb(${r}, ${g}, ${b})`;
                this.logger("setBackgroundColor color", color);
                div.style.background = color;
            },
            addHighFrequencyEventListener: (eventName: string, interval: number) => {
                this.logger("addHighFrequencyEventListener", eventName, interval);
                this.displayer.addMagixEventListener(eventName, (evts: AkkoEvent[]) => {
                    const uuid = (this.displayer as Room).uuid || (this.displayer as Player).roomUUID;
                    const nativeEvts: NativeEvent[] = evts.map(evt => {
                        return {uuid, eventName: evt.event, payload: evt.payload, scope: evt.scope, authorId: evt.authorId};
                    });
                    if (isRoom(this.displayer)) {
                        dsBridge.call("room.fireHighFrequencyEvent", JSON.stringify(nativeEvts));
                    } else {
                        dsBridge.call("player.fireHighFrequencyEvent", JSON.stringify(nativeEvts));
                    }
                }, interval);
            },
            addMagixEventListener: (eventName: string) => {
                this.logger("addMagixEventListener", eventName);
                this.displayer.addMagixEventListener(eventName, (evt: AkkoEvent) => {
                    this.logger("fireMagixEvent", evt);
                    const uuid = (this.displayer as Room).uuid || (this.displayer as Player).roomUUID;
                    const nativeEvt = {
                        uuid: uuid,
                        eventName: evt.event,
                        payload: evt.payload,
                        scope: evt.scope,
                        authorId: evt.authorId,
                    };
                    if (isRoom(this.displayer)) {
                        dsBridge.call("room.fireMagixEvent", JSON.stringify(nativeEvt));
                    } else {
                        dsBridge.call("player.fireMagixEvent", JSON.stringify(nativeEvt));
                    }
                });
            },
            removeMagixEventListener: (eventName: string) => {
                this.logger("removeMagixEventListener", eventName);
                this.displayer.removeMagixEventListener(eventName);
            },
        });
        dsBridge.registerAsyn("displayerAsync", {
            scenePreview: this.pagePreview,
            sceneSnapshot: this.pageCover,
        });
        (window as any).html2canvas = html2canvas;
        (window as any).displayerBridge = this;
    }

    public setCameraBound = (nativeBound: NativeCameraBound) => {
        this.logger("setCameraBound nativeBound", nativeBound);
        const bound = convertToBound(nativeBound);
        this.logger("setCameraBound bound", bound);
        this.displayer.setCameraBound(bound!);
    }

    public pageCover = (scenePath: string, responseCallback: any) => {
        this.screenshot(scenePath, this.displayer.fillSceneSnapshot.bind(this.displayer), responseCallback);
    }

    public pagePreview = (scenePath: string, responseCallback: any) => {
        this.screenshot(scenePath, this.displayer.scenePreview.bind(this.displayer), responseCallback);
    }

    public screenshot = (scenePath: string, fn: (scenePath: string, div: HTMLElement, width: number, height: number) => void, responseCallback: any) => {
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
}