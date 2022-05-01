import { WindowManager } from '@netless/window-manager';
import dsbridge from 'dsbridge';
import html2canvas from 'html2canvas';
import { registerBridge } from '../utils/Funs';
import { logger } from '../utils/Logger';
import { AsyncDisplayerBridge, DisplayerBridge } from './DisplayerBridge';
import { PlayerAsyncBridge, PlayerStateBridge } from './PlayerBridge';
import { RoomAsyncBridge, RoomBridge, RoomPPTBridge, RoomStateBridge, RoomSyncBridge } from './RoomBridge';
import { SDKBridge } from './SDKBridge';

export const whiteboardContainerId = "whiteboard-container";

function setBackgroundColor(r: number, g: number, b: number, a?: number) {
    const div = document.getElementById(whiteboardContainerId);
    if (div) {
        const color = (a === 1 || a === undefined) ? `rgb(${r}, ${g}, ${b})` : `rgb(${r}, ${g}, ${b})`;
        div.style.background = color;
    } else {
        console.log(whiteboardContainerId, "not exist");
    }
}

const sdkNameSpace = "sdk";

const displayerNameSpace = "displayer";
const asyncDisplayerNameSpace = "displayerAsync";
const pptNamespace = "ppt";

const roomSyncNamespace = "room.sync";
const roomNamespace = "room";
const roomStateNamespace = "room.state";

const playerNameSpace = "player";
const playerStateNameSpace = "player.state";

export function registerDsbridge() {
    window.registerApp = WindowManager.register;
    window.setBackgroundColor = setBackgroundColor;
    window.html2canvas = html2canvas;
    (window as any).scenePreview = new AsyncDisplayerBridge().scenePreview;

    // sdk
    dsbridge.registerAsyn(sdkNameSpace, new SDKBridge());

    // displayer
    dsbridge.register(displayerNameSpace, new DisplayerBridge());
    dsbridge.registerAsyn(asyncDisplayerNameSpace, new AsyncDisplayerBridge());

    // room
    dsbridge.register(roomNamespace, new RoomBridge());
    dsbridge.registerAsyn(roomNamespace, new RoomAsyncBridge());
    dsbridge.register(pptNamespace, new RoomPPTBridge());
    dsbridge.register(roomSyncNamespace, new RoomSyncBridge());
    // FIXME:同步方法尽量还是放在同步方法里。
    // 由于 Android 不方便改，暂时只把新加的 get 方法放在此处。dsbridge 注册时，同一个注册内容，会被覆盖，而不是合并。
    dsbridge.register(roomStateNamespace, new RoomStateBridge());

    // player
    dsbridge.registerAsyn(playerNameSpace, new PlayerAsyncBridge());
    dsbridge.register(playerStateNameSpace, new PlayerStateBridge());

    registerBridge([
        sdkNameSpace,
        displayerNameSpace, asyncDisplayerNameSpace,
        roomNamespace, pptNamespace, roomSyncNamespace, roomStateNamespace,
        playerNameSpace, playerStateNameSpace
    ], logger);
}