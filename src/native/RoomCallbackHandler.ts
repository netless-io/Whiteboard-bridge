import {logger} from '../utils/Logger'
import { call } from '../bridge';
import {createPageState} from '../utils/Funs'
import {RoomPhase, RoomState} from "white-web-sdk";
import {NativeDisplayerState} from '../bridge/Displayer';

const reconnectingTimeout = 45000;

type NativeRoomState = RoomState & NativeDisplayerState;

export class RoomCallbackHandler {
    // RoomCallbacks
    onPhaseChanged = (phase) => {
        call("room.firePhaseChanged", phase);

        const room = window.room;
        if (room && room.phase === RoomPhase.Reconnecting) {
            setTimeout(() => {
                if (room && room.phase === RoomPhase.Reconnecting) {
                    logger(`room start disconnect by reconnecting timeout by bridge`);
                    room.disconnect().then(() => {
                        const timeoutStr = `Reconnect time exceeds ${reconnectingTimeout} milliseconds, sdk call disconnect automatically`;
                        logger(timeoutStr);
                        call("room.fireDisconnectWithError",timeoutStr);
                    });
                }
            }, reconnectingTimeout);
        }
    }

    onCanUndoStepsUpdate = (canUndoSteps: number) => {
        call("room.fireCanUndoStepsUpdate", canUndoSteps);
    }

    onCanRedoStepsUpdate = (canRedoSteps: number)  => {
        call("room.fireCanRedoStepsUpdate", canRedoSteps);
    }
    
    onRoomStateChanged = (modifyState: Partial<NativeRoomState>) => {

        const {sceneState, ...resetState} = modifyState;

        if (window.manager) {
            // sceneState 由 windowManager 触发
            if (Object.keys(resetState).length !== 0) {
                call("room.fireRoomStateChanged", JSON.stringify(resetState));
            }
        } else {
            // 单窗口模式下，如果有 sceneState，则手动生成一个 pageState
            if (sceneState) {
                modifyState = {...modifyState, ...createPageState(sceneState)}
            }
            call("room.fireRoomStateChanged", JSON.stringify(modifyState));
        }
    }

    onDisconnectWithError = (error) => {
        call("room.fireDisconnectWithError", error.message);
    }

    onKickedWithReason = (reason: string)  => {
        call("room.fireKickedWithReason", reason);
    }

    // DisplayerCallbacks
    onCatchErrorWhenAppendFrame = (userId: number, error: Error) => {
        logger("onCatchErrorWhenAppendFrame", [userId, error.message]);
        // TODO: 在初始化 room 过程中，就回调该方法的话，对于 room 的判断会存在问题
        call("room.fireCatchErrorWhenAppendFrame", {userId: userId, error: error.message});
    }

    onCatchErrorWhenRender = (err: Error) => {
        // FIXME: native 端未添加
        // call("room.onCatchErrorWhenRender", {error: err.message});
    }
}