import { WindowManager } from '@netless/window-manager';
import type { CombinePlayer } from "@netless/combine-player";
import { WhiteWebSdk, Room, Player } from 'white-web-sdk';
import { AppRegisterParams, PluginContext, PluginParams } from '@netless/whiteboard-bridge-types';
import { SyncedStore } from '@netless/synced-store';
import { RtcAudioEffectClient } from '../RtcAudioEffectClient';
import { PCMProxy } from '../PCMProxy';

declare global {
  interface PrepareParams {
    appId: string;
    region: string;
    expire?: number;
  }
  interface Window {
    room?: Room;
    manager?: WindowManager;
    // 用来给外部 js 注册用的
    registerApp?: typeof WindowManager.register;
    sdk?: WhiteWebSdk;
    player?: Player;
    combinePlayer?: CombinePlayer;
    fullScreen?: boolean;
    bridge?: any;
    __nativeTags?: any;
    __platform?: any;
    __netlessUA?: string;
    __netlessMobXUseProxies?: string;
    __mediaPlayerAudioEffectClient?: RtcAudioEffectClient;
    __pcmProxy?: PCMProxy;
    testRoom: () => void;
    testReplay: () => void;
    html2canvas: any;
    setBackgroundColor: (r: number, g: number, b: number, a?: number | undefined) => void;
    plugins: any;
    pluginParams: PluginParams[];
    pluginContext: PluginContext[];
    appRegisterParams: AppRegisterParams[];
    nativeWebSocket?: boolean;
    syncedStore?: SyncedStore;
    appliancePlugin: any;
  }
}