
import {WhiteWebSdkConfiguration, ReplayRoomParams, JoinRoomParams, Room, Player, CameraBound, WhiteWebSdk} from "white-web-sdk";
import {BaseTypeKey, Writable, NumberType} from "./GenericHelper";
import { CombinePlayer } from '@netless/combine-player';
import { WindowManager, MountParams } from "@netless/window-manager";
import { SyncedStore } from "@netless/synced-store";

declare global {
    interface Window {
      room?: Room;
      manager?: WindowManager;
      syncedStore?: SyncedStore;
      sdk?: WhiteWebSdk;
      player?: Player;
      combinePlayer?: CombinePlayer;
      bridge?: any;
      __nativeTags?: any;
      __platform?: any;
      testRoom: () => void;
      testReplay: () => void;
      html2canvas: any;
      setBackgroundColor: (r: number, g: number, b: number, a?: number | undefined) => void;
      plugins: any;
      nativeWebSocket?: boolean;
    }
}

export type NativeSDKConfig = {
    /** enableImgErrorCallback */
    enableImgErrorCallback?: boolean;
    /** 开启图片拦截功能 */
    enableInterrupterAPI?: boolean;
    /** 是否开启 debug 模式，打印命令输出 */
    log?: boolean;
    /** 是否显示用户头像 */
    userCursor?: boolean;
    /** 路线备用，在 web-sdk 启用多域名之前的临时补充方案 */
    routeBackup?: boolean;
    enableIFramePlugin?: boolean;
    enableRtcIntercept?: boolean;
    enableSyncedStore?: boolean;
    __nativeTags?: any;
    /** native 预热结果，web sdk 升级至 2.8.0 后，该功能不再需要主动测一遍。保留该字段，是为了兼容，以及抽离选项 */
    initializeOriginsStates?: any;
    __platform: "ios" | "android";
    /** 多窗口在初始化的时候，需要配置 useMobxState 为 true，所以在初始化 sdk 的时候，就需要知道参数 */
    useMultiViews?: boolean;
    /** window manager 注册参数，会透传给注册的组件 */
    appOptions?: {
        // 每个 app 单独的 window manager 注册参数 slide
        [key: string]: {
            [key: string]: any;
        };
    };
} & WhiteWebSdkConfiguration;

// Android 使用 enum 名称，请勿随意改动
export enum ScaleMode  {
    Scale,
    AspectFit,
    AspectFitScale,
    AspectFitSpace,
    AspectFill,
    AspectFillScale,
}

export type ScaleModeKey = keyof typeof ScaleMode;

export type ContentModeType = {
    mode: ScaleMode | ScaleModeKey;
    scale?: number;
    space?: number;
};

type NumberCameraBound = NumberType<CameraBound>;
/** 移除掉方法参数，使用自定义类替换 */
export type NativeCameraBound = NumberCameraBound & {
    maxContentMode?: ContentModeType;
    minContentMode?: ContentModeType;
};

type BaseTypeRoomParams = BaseTypeKey<JoinRoomParams>;
export type NativeJoinRoomParams = BaseTypeRoomParams & {
    cameraBound?: NativeCameraBound;
    timeout?: number;
    windowParams?: MountParams;
    userPayload?: {[key in string]: any};
    nativeWebSocket?: boolean;
};

type BaseTypeReplayParams = Writable<BaseTypeKey<ReplayRoomParams>>;
export type NativeReplayParams = BaseTypeReplayParams & {
    cameraBound?: NativeCameraBound;
    step?: number;
    mediaURL?: string;
};