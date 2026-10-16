import {logger} from '../utils/Logger'
import { scopedCall } from '../bridge';
import {createPageState} from '../utils/Funs'
import {RoomPhase, RoomState} from "white-web-sdk";
import {NativeDisplayerState} from '../bridge/Displayer';

import { lifecycle, Task } from "../bridge/Lifecycle";

type NativeRoomState = RoomState & NativeDisplayerState;

export class RoomCallbackHandler {
    private call = scopedCall();
    constructor(private task?: Task) {}
    // RoomCallbacks
    onPhaseChanged = (phase) => {
        if (this.task) lifecycle.phase(this.task, phase);
        this.call("room.firePhaseChanged", phase);


    }

    onCanUndoStepsUpdate = (canUndoSteps: number) => {
        this.call("room.fireCanUndoStepsUpdate", canUndoSteps);
    }

    onCanRedoStepsUpdate = (canRedoSteps: number)  => {
        this.call("room.fireCanRedoStepsUpdate", canRedoSteps);
    }
    
    onRoomStateChanged = (modifyState: Partial<NativeRoomState>) => {

        const {sceneState, ...resetState} = modifyState;

        if (window.manager) {
            // sceneState 由 windowManager 触发
            if (Object.keys(resetState).length !== 0) {
                this.call("room.fireRoomStateChanged", JSON.stringify(resetState));
            }
        } else {
            // 单窗口模式下，如果有 sceneState，则手动生成一个 pageState
            if (sceneState) {
                modifyState = {...modifyState, ...createPageState(sceneState)}
            }
            this.call("room.fireRoomStateChanged", JSON.stringify(modifyState));
        }
    }

    onDisconnectWithError = (error) => {
        if (this.task) lifecycle.phase(this.task, "error");
        this.call("room.fireDisconnectWithError", error.message);
    }

    onKickedWithReason = (reason: string)  => {
        if (this.task) lifecycle.phase(this.task, "kicked");
        this.call("room.fireKickedWithReason", reason);
    }

    // DisplayerCallbacks
    onCatchErrorWhenAppendFrame = (userId: number, error: Error) => {
        logger("onCatchErrorWhenAppendFrame", [userId, error.message]);
        // TODO: 在初始化 room 过程中，就回调该方法的话，对于 room 的判断会存在问题
        this.call("room.fireCatchErrorWhenAppendFrame", {userId: userId, error: error.message});
    }

    onCatchErrorWhenRender = (err: Error) => {
        // FIXME: native 端未添加
        // call("room.onCatchErrorWhenRender", {error: err.message});
    }
}
