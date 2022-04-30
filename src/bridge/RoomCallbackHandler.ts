import {logger} from '../utils/Logger'
import dsBridge from "dsbridge";
import {createPageState} from '../utils/Funs'
import {RoomPhase, MediaType, RoomState} from "white-web-sdk";
import {NativeDisplayerState} from './DisplayerBridge';

const reconnectingTimeout = 45000;

type NativeRoomState = RoomState & NativeDisplayerState;

export class RoomCallbackHandler {
    // RoomCallbacks
    onPhaseChanged = (phase) => {
        dsBridge.call("room.firePhaseChanged", phase);

        const room = window.room;
        if (room && room.phase === RoomPhase.Reconnecting) {
            setTimeout(() => {
                if (room && room.phase === RoomPhase.Reconnecting) {
                    logger(`room start disconnect by reconnecting timeout by bridge`);
                    room.disconnect().then(() => {
                        const timeoutStr = `Reconnect time exceeds ${reconnectingTimeout} milliseconds, sdk call disconnect automatically`;
                        logger(timeoutStr);
                        dsBridge.call("room.fireDisconnectWithError",timeoutStr);
                    });
                }
            }, reconnectingTimeout);
        }
    }

    onCanUndoStepsUpdate = (canUndoSteps: number) => {
        dsBridge.call("room.fireCanUndoStepsUpdate", canUndoSteps);
    }

    onCanRedoStepsUpdate = (canRedoSteps: number)  => {
        dsBridge.call("room.fireCanRedoStepsUpdate", canRedoSteps);
    }
    
    onRoomStateChanged = (modifyState: Partial<NativeRoomState>) => {

        const {sceneState, ...resetState} = modifyState;

        if (window.manager) {
            // sceneState 由 windowManager 触发
            if (Object.keys(resetState).length !== 0) {
                dsBridge.call("room.fireRoomStateChanged", JSON.stringify(resetState));
            }
        } else {
            // 单窗口模式下，如果有 sceneState，则手动生成一个 pageState
            if (sceneState) {
                modifyState = {...resetState, ...createPageState(sceneState)}
            }
            dsBridge.call("room.fireRoomStateChanged", JSON.stringify(modifyState));
        }
    }

    onDisconnectWithError = (error) => {
        dsBridge.call("room.fireDisconnectWithError", error.message);
    }

    onKickedWithReason = (reason: string)  => {
        dsBridge.call("room.fireKickedWithReason", reason);
    }

    onAttributesUpdate = (attributes)  => {
        dsBridge.call("room.fireAttributesUpdate", JSON.stringify(attributes));
    }

    // DisplayerCallbacks
    onCatchErrorWhenAppendFrame = (userId: number, error: Error) => {
        logger("onCatchErrorWhenAppendFrame", [userId, error.message]);
        // TODO: 在初始化 room 过程中，就回调该方法的话，对于 room 的判断会存在问题
        dsBridge.call("room.fireCatchErrorWhenAppendFrame", {userId: userId, error: error.message});
    }

    onCatchErrorWhenRender = (err: Error) => {
        // FIXME: native 端未添加
        // dsBridge.call("room.onCatchErrorWhenRender", {error: err.message});
    }

    onPPTLoadProgress = (uuid: string, progress: number) => {
        // 不推荐用户使用这种预加载，native 端使用 zip 包的形式
    }

    onPPTMediaPlay = (shapeId: string, type: MediaType) => {
        logger("onPPTMediaPlay", shapeId, type);
        dsBridge.call("sdk.onPPTMediaPlay", {shapeId, type});
    }
    
    onPPTMediaPause = (shapeId: string, type: MediaType) => {
        logger("onPPTMediaPause", shapeId, type);
        dsBridge.call("sdk.onPPTMediaPause", {shapeId, type});
    }
}