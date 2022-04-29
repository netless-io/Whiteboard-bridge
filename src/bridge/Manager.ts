import { WindowManager } from "@netless/window-manager";
import "../utils/ParamTypes";
import dsBridge from "dsbridge";
import { RoomCallbackHandler } from "./RoomCallbackHandler";
import { ReplayerCallbackHandler } from "./ReplayerCallbackHandler";

export function listenEmitterFromManager(manager: WindowManager, logger: (funName: string, ...param: any[]) => void, handler: RoomCallbackHandler | ReplayerCallbackHandler): void {
    window.manager = manager;

    // 多窗口模式下，原有的 cameraState 意义丢失，通过这种方式，来替代显示 mainView 的 cameraState
    manager.emitter.on("cameraStateChange", cameraState => {
        if (handler instanceof RoomCallbackHandler) {
            handler.onRoomStateChanged({cameraState});
        } else {
            handler.onPlayerStateChanged({cameraState});
        }
    });

    manager.emitter.on("sceneStateChange", sceneState => {
        if (handler instanceof RoomCallbackHandler) {
            handler.onRoomStateChanged({sceneState});
        } else {
            handler.onPlayerStateChanged({sceneState});
        }
    });

    manager.emitter.on("boxStateChange", state => {
        if (handler instanceof RoomCallbackHandler) {
            handler.onRoomStateChanged({windowBoxState: state});
        } else {
            handler.onPlayerStateChanged({windowBoxState: state});
        }
    });

    manager.emitter.on("pageStateChange", pageState => {
        if (handler instanceof RoomCallbackHandler) {
            handler.onRoomStateChanged({pageState});
        } else {
            handler.onPlayerStateChanged({pageState});
        }
    });
    
    manager.emitter.on("canRedoStepsChange",canRedoSteps => {
        if (handler instanceof RoomCallbackHandler) {
            handler.onCanRedoStepsUpdate(canRedoSteps);
        }
    });
    manager.emitter.on("canUndoStepsChange",canUndoSteps => {
        if (handler instanceof RoomCallbackHandler) {
            handler.onCanUndoStepsUpdate(canUndoSteps);
        }
    });

    manager.emitter.on("loadApp", event => {
        logger("loadApp", event);
        // dsBridge.call("manager.onLoadApp", event);
    });
}