import { enableReport } from "./utils/Logger";

let appIdentifier = "";
let testRoomUUID = "";
let testRoomToken = "";

export function addDebugFunctions() {
    function testRoom() {
        enableReport(true);
        const sdkParams = {log: true, userCursor: true, __platform: "bridge", appIdentifier, useMultiViews: true};
        (window as any).newWhiteSdk(sdkParams, () => {});

        const roomParams = {
            uuid: testRoomUUID,
            uid: "0",
            roomToken: testRoomToken,
            windowParams: {
                containerSizeRatio: 3 / 4,
                fullscreen: false
            },
            userPayload: {
                avatar: "https://white-pan.oss-cn-shanghai.aliyuncs.com/40/image/mask.jpg"
            },
        };
        (window as any).joinRoom(roomParams, ()=>{
            // ref bridge call room instance
            (window as any).bridgeRoom = window.bridge.registerMap.async.room
        });
    }

    function testReplay() {
        enableReport(true);
        const sdkParams = {log: true, userCursor: true, __platform: "bridge", appIdentifier, useMultiViews: true};
        (window as any).newWhiteSdk(sdkParams, () => {});
        const replayParams = { room: testRoomUUID, roomToken: testRoomToken };
        (window as any).replayRoom(replayParams, ()=>{});
    }

    window.testRoom = testRoom;
    window.testReplay = testReplay;
}