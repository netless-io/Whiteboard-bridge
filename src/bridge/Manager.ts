import { WindowManager } from "@netless/window-manager";
import "../utils/ParamTypes";
import { RoomCallbackHandler } from "../native/RoomCallbackHandler";
import { ReplayerCallbackHandler } from "../native/ReplayerCallbackHandler";
import { call } from ".";

export function addManagerListener(manager: WindowManager, logger: (funName: string, ...param: any[]) => void, handler: RoomCallbackHandler | ReplayerCallbackHandler): void {
    window.manager = manager;

    if (handler instanceof RoomCallbackHandler) {
        addRoomListener(manager, logger, handler);
    } else {
        addReplayListener(manager, logger, handler);
    }
}

function addRoomListener(manager: WindowManager, logger: (funName: string, ...param: any[]) => void, handler: RoomCallbackHandler) {
    // 多窗口模式下，原有的 cameraState 意义丢失，通过这种方式，来替代显示 mainView 的 cameraState
    manager.emitter.on("cameraStateChange", cameraState => {
        handler.onRoomStateChanged({cameraState});
    });

    manager.emitter.on("sceneStateChange", sceneState => {
        call("room.fireRoomStateChanged", JSON.stringify({sceneState}));
    });

    manager.emitter.on("boxStateChange", state => {
        handler.onRoomStateChanged({windowBoxState: state});
    });

    manager.emitter.on("pageStateChange", pageState => {
        handler.onRoomStateChanged({pageState});
    });
    
    manager.emitter.on("canRedoStepsChange",canRedoSteps => {
        handler.onCanRedoStepsUpdate(canRedoSteps);
    });
    manager.emitter.on("canUndoStepsChange",canUndoSteps => {
        handler.onCanUndoStepsUpdate(canUndoSteps);
    });

    manager.emitter.on("loadApp", event => {
        logger("loadApp", event);
    });
}

function addReplayListener(manager: WindowManager, logger: (funName: string, ...param: any[]) => void, handler: ReplayerCallbackHandler) {
    // 多窗口模式下，原有的 cameraState 意义丢失，通过这种方式，来替代显示 mainView 的 cameraState
    manager.emitter.on("cameraStateChange", cameraState => {
        handler.onPlayerStateChanged({cameraState});
    });

    manager.emitter.on("sceneStateChange", sceneState => {
        call("player.onPlayerStateChanged", JSON.stringify({sceneState}));
    });

    manager.emitter.on("boxStateChange", state => {
        handler.onPlayerStateChanged({windowBoxState: state});
    });

    manager.emitter.on("pageStateChange", pageState => {
        handler.onPlayerStateChanged({pageState});
    });

    manager.emitter.on("loadApp", event => {
        logger("loadApp", event);
        // dsBridge.call("manager.onLoadApp", event);
    });
}