import * as React from "react";
import dsBridge from "dsbridge";
import {RoomBridge} from "./Room";
import {PlayerBridge} from "./Player";
import "./App.css";
import {DeviceType, WhiteWebSdk, WhiteWebSdkConfiguration, ReplayRoomParams, PlayerPhase, JoinRoomParams} from "white-web-sdk";
import UserCursor from "./UserCursor";
import {BaseTypeKey, Writable} from "./utils/tools";
import {NativeCameraBound, convertToBound} from "./utils/CameraBound";

type NativeSDKConfig = {
    /** 开启图片拦截功能 */
    enableInterrupterAPI?: boolean;
    /** 是否开启 debug 模式，打印命令输出 */
    debug?: boolean;
    /** 是否显示用户头像 */
    userCursor?: boolean;
} & WhiteWebSdkConfiguration;

type BaseTypeRoomParams = BaseTypeKey<JoinRoomParams>;
type NativeJoinRoomParams = BaseTypeRoomParams & {
    cameraBound?: NativeCameraBound;
};

type BaseTypeReplayParams = Writable<BaseTypeKey<ReplayRoomParams>>;
type NativeReplayParams = BaseTypeReplayParams & {
    cameraBound?: NativeCameraBound;
};

export class App extends React.Component<{}, {}> {

    private webSdk!: WhiteWebSdk;
    private nativeConfig?: NativeSDKConfig;
    private container: HTMLDivElement | null = null;
    private cursor: UserCursor;
    private roomBridge?: RoomBridge;
    private playerBridge?: PlayerBridge;
    private debug: boolean = false;

    public constructor(props: {}) {
        super(props);

        window.addEventListener("error", (e: ErrorEvent) => {
            this.throw(e.message, e.error);
        });
        (window as any).whiteSdk = this;

        this.cursor = new UserCursor();

        dsBridge.registerAsyn("sdk", {
            newWhiteSdk: this.newWhiteSdk,
            joinRoom: this.joinRoom,
            replayRoom: this.replayRoom,
        });
    }

    private get cursorAdapter(): UserCursor | undefined {
        if (this.nativeConfig && !!this.nativeConfig!.userCursor) {
            return this.cursor;
        }
        return undefined;
    }

    private newWhiteSdk = (config: NativeSDKConfig)  => {

        const urlInterrupter = config.enableInterrupterAPI ? (url: string) => {
            const modifyUrl: string = dsBridge.call("sdk.urlInterrupter", url);
            if (modifyUrl.length > 0) {
                return modifyUrl;
            }
            return url;
        } : undefined;

        this.debug = !!config.debug;
        this.nativeConfig = config;

        this.logger("newWhiteSdk", config);
        const {debug, userCursor, enableInterrupterAPI, ...restConfig} = config;
        this.webSdk = new WhiteWebSdk({
            ...restConfig,
            deviceType: DeviceType.Touch,
            urlInterrupter: urlInterrupter,
        });
    }

    private joinRoom = (nativeParams: NativeJoinRoomParams, responseCallback: any) => {

        this.removeBind();

        this.logger("joinRoom", nativeParams);
        this.webSdk!.joinRoom({
            ...nativeParams,
            cameraBound: convertToBound(nativeParams.cameraBound),
            cursorAdapter: this.cursorAdapter,
        }, {
            onRoomStateChanged: modifyState => {
                if (modifyState.roomMembers && this.cursorAdapter) {
                    this.cursorAdapter.setColorAndAppliance(modifyState.roomMembers);
                }
                dsBridge.call("room.fireRoomStateChanged", JSON.stringify(modifyState));
            },
            onPhaseChanged: phase => {
                dsBridge.call("room.firePhaseChanged", phase);
            },
            onDisconnectWithError: error => {
                dsBridge.call("room.fireDisconnectWithError", error.message);
            },
            onKickedWithReason: reason => {
                dsBridge.call("room.fireKickedWithReason", reason);
            },
            onCatchErrorWhenAppendFrame: (userId: number, error: Error) => {
                dsBridge.call("room.fireCatchErrorWhenAppendFrame", {userId: userId, error: error.message});
            },
        }).then(room => {

            (window as any).displayer = room;
            (window as any).room = room;

            this.roomBridge = new RoomBridge(room, this.logger);
            if (this.container) {
                this.roomBridge.bindHtmlElement(this.container);
            }
            if (room.state.roomMembers && this.cursorAdapter) {
                this.cursorAdapter.setColorAndAppliance(room.state.roomMembers);
            }
            return responseCallback(JSON.stringify({state: room.state, observerId: room.observerId}));
        }).catch((e: Error) => {
            return responseCallback(JSON.stringify({__error: {message: e.message, jsStack: e.stack}}));
        });
    }

    private replayRoom = (replayParams: NativeReplayParams, responseCallback: any) => {

        this.removeBind();

        // just fix warning
        if (replayParams.audioUrl) {
            replayParams.mediaURL = replayParams.audioUrl;
            replayParams.audioUrl = undefined;
        }

        this.logger("replayRoom", replayParams);
        this.webSdk.replayRoom({
            ...replayParams,
            cursorAdapter: this.cursorAdapter,
            cameraBound: convertToBound(replayParams.cameraBound),
        }, {
            onPhaseChanged: phase => {
                if (phase !== PlayerPhase.WaitingFirstFrame && this.cursorAdapter && this.playerBridge) {
                    this.cursorAdapter.setColorAndAppliance(this.playerBridge.player.state.roomMembers);
                }
                this.logger("onPhaseChanged:", phase);
                dsBridge.call("player.onPhaseChanged", phase);
            },
            onLoadFirstFrame: () => {
                console.log("onLoadFirstFrame");
                // playerState 在此时才可读。这个时候需要把完整的 playerState 传递给 native，保证：
                // 1. native 端同步 API 状态的完整性
                // 2. Android 目前 playState diff 的正确性。
                dsBridge.call("player.onPlayerStateChanged", JSON.stringify(this.playerBridge!.player.state));
                dsBridge.call("player.onLoadFirstFrame");
            },
            onSliceChanged: slice => {
                dsBridge.call("player.onSliceChanged", slice);
            },
            onPlayerStateChanged: modifyState => {
                if (modifyState.roomMembers && this.cursorAdapter) {
                    this.cursorAdapter.setColorAndAppliance(modifyState.roomMembers);
                }
                dsBridge.call("player.onPlayerStateChanged", JSON.stringify(modifyState));
            },
            onStoppedWithError: error => {
                dsBridge.call("player.onStoppedWithError", JSON.stringify({"error": error.message, jsStack: error.stack}));
            },
            onScheduleTimeChanged: scheduleTime => {
                // TODO:调整回调频率，强制调用频率（或者允许设置）
                dsBridge.call("player.onScheduleTimeChanged", scheduleTime);
            },
            onCatchErrorWhenAppendFrame: (userId, error) => {
                dsBridge.call("player.onCatchErrorWhenAppendFrame", {userId: userId, error: error.message});
            },
            onCatchErrorWhenRender: err => {
                dsBridge.call("player.onCatchErrorWhenRender", {error: err.message});
            },
        }).then(player => {

            (window as any).displayer = player;
            (window as any).player = player;

            this.playerBridge = new PlayerBridge(player, this.logger);
            if (this.container) {
                this.playerBridge.bindHtmlElement(this.container);
            }
            const {scheduleTime, timeDuration, framesCount, beginTimestamp} = player;
            return responseCallback(JSON.stringify({timeInfo: {scheduleTime, timeDuration, framesCount, beginTimestamp}}));
        }).catch((e: Error) => {
            return responseCallback(JSON.stringify({__error: {message: e.message, jsStack: e.stack}}));
        });
    }

    private removeBind = () => {
        if (this.playerBridge) {
            this.playerBridge.stop();
            this.playerBridge.bindHtmlElement(null);
            this.playerBridge = undefined;
        }
        if (this.roomBridge) {
            this.roomBridge.bindHtmlElement(null);
            this.roomBridge = undefined;
        }
        (window as any).room = undefined;
        (window as any).player = undefined;
        (window as any).displayer = undefined;
        (window as any).displayerBridge = undefined;
    }

    private setContainerRef = (ref: HTMLDivElement | null): void => {
        this.container = ref;
        if (this.playerBridge) {
            this.playerBridge.bindHtmlElement(ref);
        } else if (this.roomBridge) {
            this.roomBridge.bindHtmlElement(ref);
        }
    }

    public render(): React.ReactNode {
        return (
            // 使用 position 定位，兼容 Android 4.4
            <div id="whiteboard-container" style={{position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 1}} ref={this.setContainerRef}/>
        );
    }

    // fix  Android Studio 的 logcat 只能显示 chromium 打印的第一个参数的问题
    private logger = (funName: string, ...params: any[]): void => {
        if (this.debug) {
            console.log(JSON.stringify({funName, params: {...params}}));
            dsBridge.call("sdk.logger", {funName, params: {...params}});
        }
    }

    private throw = (...param: any[]): void => {
        // FIXME:有时候只有 error，没有具体信息
        console.log(JSON.stringify({...param}));
        dsBridge.call("sdk.throwError", {...param});
    }
    // DEBUG 调试专用
    private setupDebugSdk = () => {
        this.debug = true;
        this.nativeConfig = {debug: true, userCursor: true};
        this.webSdk = new WhiteWebSdk({
            urlInterrupter: url => {
                console.log(url); return url;
            },
        });
    }

    private joinTestRoom = async () => {
        this.setupDebugSdk();
        this.joinRoom({uuid: "446ffa0f7f624796ae11584937fb5cbb", roomToken: "WHITEcGFydG5lcl9pZD1OZ3pwQWNBdlhiemJERW9NY0E0Z0V3RTUwbVZxM0NIbDJYV0Ymc2lnPTRmYjcyNTdiZjIzZmE3ZDMzNmFiODZkMGNjNWY0MGZkZDc1YzBhYjE6YWRtaW5JZD0yMTYmcm9vbUlkPTQ0NmZmYTBmN2Y2MjQ3OTZhZTExNTg0OTM3ZmI1Y2JiJnRlYW1JZD0zNDEmcm9sZT1yb29tJmV4cGlyZV90aW1lPTE1OTkzMjUxMDYmYWs9Tmd6cEFjQXZYYnpiREVvTWNBNGdFd0U1MG1WcTNDSGwyWFdGJmNyZWF0ZV90aW1lPTE1Njc3NjgxNTQmbm9uY2U9MTU2Nzc2ODE1NDEyMjAw", userPayload: {avatar: "https://white-pan.oss-cn-shanghai.aliyuncs.com/101/image/alin-rusu-1239275-unsplash_opt.jpg"}}, () => {});
    }

    private replayTestRoom = async() => {
        this.setupDebugSdk();
        this.replayRoom({room: "", roomToken: ""}, () => {});
    }
}

export default App;
