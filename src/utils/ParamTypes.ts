
import {WhiteWebSdkConfiguration, ReplayRoomParams, JoinRoomParams, Room, Player, CameraBound, WhiteWebSdk} from "white-web-sdk";
import {BaseTypeKey, Writable, NumberType} from "./GenericHelper";
import { CombinePlayer } from '@netless/combine-player';

declare global {
    interface Window {
      room?: Room;
      sdk?: WhiteWebSdk;
      player?: Player;
      combinePlayer?: CombinePlayer;
      bridge?: any;
      __nativeTags?: any;
      __platform?: any;
      testRoom: () => void;
      testReplay: () => void;
      html2canvas: any;
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
    __nativeTags?: any;
    /** native 预热结果，web sdk 升级至 2.8.0 后，该功能不再需要主动测一遍。保留该字段，是为了兼容，以及抽离选项 */
    initializeOriginsStates?: any;
    __platform: "ios" | "android";
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
};

type BaseTypeReplayParams = Writable<BaseTypeKey<ReplayRoomParams>>;
export type NativeReplayParams = BaseTypeReplayParams & {
    cameraBound?: NativeCameraBound;
    step?: number;
    mediaURL?: string;
};