import { WindowManager } from "@netless/window-manager";
import "../utils/ParamTypes";
import dsBridge from "dsbridge";
import { DisplayerState } from "white-web-sdk";
import { TeleBoxState } from "@netless/telebox-insider";
import { PageState } from "@netless/window-manager";

type NativeDisplayerState = DisplayerState & {
    pageState: PageState;
    windowBoxState: TeleBoxState;
}

function fireDisplayerState(state: Partial<NativeDisplayerState>) {
    if (window.room) {
        dsBridge.call("room.fireRoomStateChanged", JSON.stringify(state));
    } else if (window.player) {
        dsBridge.call("player.onPlayerStateChanged", JSON.stringify(state));
    }
}

export function registerManager(manager: WindowManager, logger: (funName: string, ...param: any[]) => void): void {
    window.manager = manager;

    // 多窗口模式下，原有的 cameraState 意义丢失，通过这种方式，来替代显示 mainView 的 cameraState
    manager.emitter.on("cameraStateChange", cameraState => {
        fireDisplayerState({cameraState});
    });

    manager.emitter.on("sceneStateChange", sceneState => {
        fireDisplayerState({sceneState});
    });

    manager.emitter.on("boxStateChange", state => {
        fireDisplayerState({ windowBoxState: state });
    });

    manager.emitter.on("pageStateChange", pageState => {
        fireDisplayerState({pageState});
    });
    
    manager.emitter.on("canRedoStepsChange",canRedoSteps => {
        dsBridge.call("room.fireCanRedoStepsUpdate", canRedoSteps);
    });
    manager.emitter.on("canUndoStepsChange",canUndoSteps => {
        dsBridge.call("room.fireCanUndoStepsUpdate", canUndoSteps);
    });

    manager.emitter.on("loadApp", event => {
        logger("loadApp", event);
        // dsBridge.call("manager.onLoadApp", event);
    });
}