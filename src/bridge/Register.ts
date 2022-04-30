import { WindowManager } from '@netless/window-manager';
import dsbridge from 'dsbridge';
import { registerBridge } from '../utils/Funs';
import { logger } from '../utils/Logger';
import { AsyncDisplayerBridge, DisplayerBridge } from './DisplayerBridge';
import { AsyncBridgePlayer, PlayerState } from './Player';
import { AsyncRoom, BridgeRoom, PPTRoom, RoomState, SyncRoom } from './Room';
import { SDK } from './SDK';

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

    // sdk
    dsbridge.registerAsyn(sdkNameSpace, new SDK());

    // displayer
    dsbridge.register(displayerNameSpace, new DisplayerBridge());
    dsbridge.registerAsyn(asyncDisplayerNameSpace, new AsyncDisplayerBridge());

    // room
    dsbridge.register(roomNamespace, new BridgeRoom());
    dsbridge.registerAsyn(roomNamespace, new AsyncRoom());
    dsbridge.register(pptNamespace, new PPTRoom());
    dsbridge.register(roomSyncNamespace, new SyncRoom());
    // FIXME:同步方法尽量还是放在同步方法里。
    // 由于 Android 不方便改，暂时只把新加的 get 方法放在此处。dsbridge 注册时，同一个注册内容，会被覆盖，而不是合并。
    dsbridge.register(roomStateNamespace, new RoomState());

    // player
    dsbridge.registerAsyn(playerNameSpace, new AsyncBridgePlayer());
    dsbridge.register(playerStateNameSpace, new PlayerState());

    registerBridge([
        sdkNameSpace,
        displayerNameSpace, asyncDisplayerNameSpace,
        roomNamespace, pptNamespace, roomSyncNamespace, roomStateNamespace,
        playerNameSpace, playerStateNameSpace
    ], logger);
}