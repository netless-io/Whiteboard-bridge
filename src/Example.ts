import { setShowLog } from "./utils/Logger";
import dsBridge from "dsbridge";
import { sdkNameSpace } from "./bridge/SDKBridge";

let appIdentifier = "";
let testRoomUUID = "";
let testRoomToken = "";

export function addExamples() {
    function testRoom() {
        setShowLog(true);
        dsBridge.call(`${sdkNameSpace}.newWhiteSdk`, {
            log: true, userCursor: true, __platform: "bridge", appIdentifier, useMultiViews: true
        }, () => {
            dsBridge.call(`${sdkNameSpace}.joinRoom`, {
                uuid: testRoomUUID, uid: "0", roomToken: testRoomToken, userPayload: {
                    avatar: "https://white-pan.oss-cn-shanghai.aliyuncs.com/40/image/mask.jpg"
                }
            }, () => { });
        });
    }

    function testReplay() {
        setShowLog(true);
        dsBridge.call(`${sdkNameSpace}.newWhiteSdk`, {
            log: true, userCursor: true, __platform: "bridge", appIdentifier, useMultiViews: true
        }, () => {
            dsBridge.call(`${sdkNameSpace}.replayRoom`, { room: testRoomUUID, roomToken: testRoomToken }, () => { });
        });
    }

    window.testRoom = testRoom;
    window.testReplay = testReplay;
}