import { setShowLog } from "./utils/Logger";

let appIdentifier = "";
let testRoomUUID = "";
let testRoomToken = "";

export function addExamples() {
    function testRoom() {
        setShowLog(true);
        const sdkParams = {log: true, userCursor: true, __platform: "bridge", appIdentifier, useMultiViews: true};
        (window as any)._dsaf._obs.sdk.newWhiteSdk(sdkParams, () => {});
        const roomParams = {uuid: testRoomUUID, uid: "0", roomToken: testRoomToken, userPayload: {
            avatar: "https://white-pan.oss-cn-shanghai.aliyuncs.com/40/image/mask.jpg"
        }};
        (window as any)._dsaf._obs.sdk.joinRoom(roomParams, ()=>{});
    }

    function testReplay() {
        setShowLog(true);
        const sdkParams = {log: true, userCursor: true, __platform: "bridge", appIdentifier, useMultiViews: true};
        (window as any)._dsaf._obs.sdk.newWhiteSdk(sdkParams, () => {});
        const replayParams = { room: testRoomUUID, roomToken: testRoomToken };
        (window as any)._dsaf._obs.sdk.replayRoom(replayParams, ()=>{});
    }

    window.testRoom = testRoom;
    window.testReplay = testReplay;
}