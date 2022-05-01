import { SDKBridge } from "./bridge/SDKBridge";
import { setShowLog } from "./utils/Logger";

let appIdentifier = "";
let testRoomUUID = "";
let testRoomToken = "";

export function addExamples() {
    function testRoom() {
        setShowLog(true);
        const sdk = new SDKBridge();
        sdk.newWhiteSdk({log: true, userCursor: true, __platform: "bridge", appIdentifier, useMultiViews: true});
        sdk.joinRoom({uuid: testRoomUUID, uid: "0", roomToken: testRoomToken, userPayload: {
            avatar: "https://white-pan.oss-cn-shanghai.aliyuncs.com/40/image/mask.jpg"
        }}, () => {});
    }

    function testReplay() {
        setShowLog(true);
        const sdk = new SDKBridge();
        sdk.newWhiteSdk({log: true, userCursor: true, __platform: "bridge", appIdentifier, useMultiViews: true});
        sdk.replayRoom({room: testRoomUUID, roomToken: testRoomToken}, () => {});
    }

    window.testRoom = testRoom;
    window.testReplay = testReplay;
}