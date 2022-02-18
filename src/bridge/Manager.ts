import { WindowManager } from "@netless/window-manager";
import "../utils/ParamTypes";
import dsBridge from "dsbridge";
import { Camera, RoomState, Size } from "white-web-sdk";

export function registerManager(manager: WindowManager, logger: (funName: string, ...param: any[]) => void): void {
    window.manager = manager;
    // 多窗口，cameraState 不可用，通过这种方式，来替代
    manager.mainView.callbacks.on("onCameraUpdated", (camera: Camera) => {
        const size = manager.mainView.size;
        const modifyState: Partial<RoomState> = {cameraState: {...size, ...camera}};
        if (window.room) {
            dsBridge.call("room.fireRoomStateChanged", JSON.stringify(modifyState));
        } else if (window.player) {
            dsBridge.call("player.onPlayerStateChanged", JSON.stringify(modifyState));
        }
    });
    manager.mainView.callbacks.on("onSizeUpdated", (size: Size) => {
        const camera = manager.mainView.camera;
        const modifyState: Partial<RoomState> = {cameraState: {...size, ...camera}};
        if (window.room) {
            dsBridge.call("room.fireRoomStateChanged", JSON.stringify(modifyState));
        } else if (window.player) {
            dsBridge.call("player.onPlayerStateChanged", JSON.stringify(modifyState));
        }
    });

    manager.emitter.on("boxStateChange", state => {
        const modifyState = { windowBoxState: state }
        if (window.room) {
            dsBridge.call("room.fireRoomStateChanged", JSON.stringify(modifyState));
        } else if (window.player) {
            dsBridge.call("player.onPlayerStateChanged", JSON.stringify(modifyState));
        }
    });
    
    manager.emitter.on("canRedoStepsChange",canRedoSteps => {
        dsBridge.call("room.fireCanRedoStepsUpdate", canRedoSteps);
    });
    manager.emitter.on("canUndoStepsChange",canUndoSteps => {
        dsBridge.call("room.fireCanUndoStepsUpdate", canUndoSteps);
    });
    window.manager = manager;
}