import * as React from "react";
import dsBridge from "dsbridge";
import {RoomBridge} from "./Room";
import {PlayerBridge} from "./Player";
import "./App.css";
import {DeviceType, WhiteWebSdk, WhiteWebSdkConfiguration, ReplayRoomParams, PlayerPhase, JoinRoomParams, RoomPhase, Displayer, Room, Player, createPlugins, setAsyncModuleLoadMode, AsyncModuleLoadMode} from "white-web-sdk";
import UserCursor from "./UserCursor";
import {BaseTypeKey, Writable} from "./utils/tools";
import {NativeCameraBound, convertToBound} from "./utils/CameraBound";
import {videoPlugin} from "@netless/white-video-plugin";
import {audioPlugin} from "@netless/white-audio-plugin";
import "./MultipleDomain";
import multipleDomain from "./MultipleDomain";

declare global {
    interface Window {
      displayer?: Displayer;
      room?: Room;
      player?: Player;
      whiteSdk?: any;
    }
  }

type NativeSDKConfig = {
    /** 开启图片拦截功能 */
    enableInterrupterAPI?: boolean;
    /** 是否开启 debug 模式，打印命令输出 */
    debug?: boolean;
    /** 是否显示用户头像 */
    userCursor?: boolean;
    /** 路线备用，在 web-sdk 启用多域名之前的临时补充方案 */
    routeBackup?: boolean;
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
        window.whiteSdk = this;

        this.cursor = new UserCursor();
        setAsyncModuleLoadMode(AsyncModuleLoadMode.StoreAsBase64);
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
        const {debug, userCursor, enableInterrupterAPI, routeBackup, ...restConfig} = config;
        if (routeBackup) {
            multipleDomain();
        }

        const plugins = createPlugins({"video": videoPlugin, "audio": audioPlugin});
        this.webSdk = new WhiteWebSdk({
            ...restConfig,
            plugins: plugins,
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

                setTimeout(() => {
                    if (this.roomBridge && this.roomBridge.room.phase === RoomPhase.Reconnecting) {
                        this.logger("disconnect", "reconnecting too long, call disconnect automatically");
                        this.roomBridge.room.disconnect();
                    }
                }, 35000);
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

            window.displayer = room;
            window.room = room;

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
                    try {
                        this.cursorAdapter.setColorAndAppliance(this.playerBridge.player.state.roomMembers);
                    } catch (error) {
                        console.warn(error);
                    }
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

            window.displayer = player;
            window.player = player;

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
        window.room = undefined;
        window.player = undefined;
        window.displayer = undefined;
        (window as any).displayerBridge = undefined;
    }

    private setContainerRef = (ref: HTMLDivElement | null): void => {
        if (this.container === ref) {
            return;
        }

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

        const plugins = createPlugins({"video": videoPlugin, "audio": audioPlugin});
        this.webSdk = new WhiteWebSdk({
            plugins: plugins,
            urlInterrupter: url => {
                console.log(url); return url;
            },
        });
    }

    private joinTestRoom = async () => {
        this.setupDebugSdk();
        this.joinRoom({uuid: "955f6e90d03a4395a4e575917a7d46b4", roomToken: "WHITEcGFydG5lcl9pZD0xTnd5aDBsMW9ZazhaRWNuZG1kaWgwcmJjVWVsQnE1UkpPMVMmc2lnPWIzMDI5MTgwZDZlZmM1ZjcxZGZhMzFkYTAzYTA2ZGVkYTJlNDA4OWI6YWRtaW5JZD01MjEmcm9vbUlkPTk1NWY2ZTkwZDAzYTQzOTVhNGU1NzU5MTdhN2Q0NmI0JnRlYW1JZD02NDYmcm9sZT1yb29tJmV4cGlyZV90aW1lPTE2MDgzODQ1MzEmYWs9MU53eWgwbDFvWWs4WkVjbmRtZGloMHJiY1VlbEJxNVJKTzFTJmNyZWF0ZV90aW1lPTE1NzY4Mjc1Nzkmbm9uY2U9MTU3NjgyNzU3ODU3MDAw", userPayload: {avatar: "https://white-pan.oss-cn-shanghai.aliyuncs.com/101/image/alin-rusu-1239275-unsplash_opt.jpg"}}, () => {});
    }

    private replayTestRoom = async() => {
        this.setupDebugSdk();
        this.replayRoom({room: "", roomToken: ""}, () => {});
    }
}

export default App;
