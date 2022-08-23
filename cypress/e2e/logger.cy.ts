describe('Test hook logger', () => {

    it('loop room namespace', () => {
        // 只读token
        const appIdentifier = 'ss4WoMf/EeqfCXcv33LmiA';
        const testRoomUUID = '5a8b1370e60d11ec91ccd3dac889004d';
        const testRoomToken = 'NETLESSROOM_YWs9VWtNUk92M1JIN2I2Z284dCZub25jZT0xNjU0NTcwNTg1ODIzMDAmcm9sZT0yJnNpZz04MmU3NTFlNTQ0NTFjMjY4MWI4NmVjZDc3NWMzNjRkNmNkYjcwMDA1MWQ3N2Q2ZDYwNWY3NTkwNTEwN2M1OWZmJnV1aWQ9NWE4YjEzNzBlNjBkMTFlYzkxY2NkM2RhYzg4OTAwNGQ';

        // 只读replayToken
        const testReplayUUID = 'e850f5f0afc911eca0e78fb1a23bd79a';
        const testReplayToken = 'NETLESSROOM_YWs9VWtNUk92M1JIN2I2Z284dCZub25jZT0xNjQ4NjA0MjM3NzUxMDAmcm9sZT0xJnNpZz1mMzRhYWY0Mjg4OGJiNTM1MWFlZTU1ZTQ3MTVjODU5OGQzMzFiYjYxM2M5NGRjMDYwOWNhMzFhNmViZGNlMjE3JnV1aWQ9ZTg1MGY1ZjBhZmM5MTFlY2EwZTc4ZmIxYTIzYmQ3OWE';

        const names = ['sdk', 'room', 'displayer', 'displayerAsync', 'player', 'player.state', 'ppt', 'room.sync', 'room.state'];

        // 这里列举所有的namespace，每调用一个方法，那么要出现一条对应的日志
        // 会依赖加入房间和回放房间，同时关闭了report

        // 这里由于参数没有填对，所有有些调用会触发 error, 这个时候要忽略这些错误。
        cy.on(`uncaught:exception`, (err, runnable) => {
            return false;
        });

        // test joinRoom
        cy
            .visit('http://localhost:8760')
            .then(win => {
                const sdkParams = { 
                    log: false, 
                    userCursor: true, 
                    __platform: "bridgeTest", 
                    appIdentifier, 
                    useMultiViews: true,
                    loggerOptions: {reportDebugLogMode: 'banReport',reportQualityMode: 'banReport'}};
                win.bridge.registerMap.async.sdk.newWhiteSdk(sdkParams, () => { });
                const roomParams = {
                    uuid: testRoomUUID, uid: "0", roomToken: testRoomToken, isWritable: false, userPayload: {
                        avatar: "https://white-pan.oss-cn-shanghai.aliyuncs.com/40/image/mask.jpg"
                    }
                };
                try { win.bridge.registerMap.async.sdk.joinRoom(roomParams, () => { }) }
                catch (error) { throw error };
            })
            .wait(5000)
            .then(window => {
                const spy = cy.spy(window.console, 'log');
                loopObj(window.bridge.registerMap.async, spy);
                loopObj(window.bridge.registerMap.normal, spy);
            })

            // test replayRoom
            cy
            .visit('http://localhost:8760')
            .then(win => {
                const sdkParams = { 
                    log: false, 
                    userCursor: true, 
                    __platform: "bridgeTest", 
                    appIdentifier, 
                    useMultiViews: true,
                    loggerOptions: {reportDebugLogMode: 'banReport',reportQualityMode: 'banReport'}};
                win.bridge.registerMap.async.sdk.newWhiteSdk(sdkParams, () => { });
                const replayParams = { room: testReplayUUID, roomToken: testReplayToken };
                try { win.bridge.registerMap.async.sdk.replayRoom(replayParams, ()=>{}) }
                catch (error) { throw error };
            })
            .wait(5000)
            .then(window => {
                const spy = cy.spy(window.console, 'log');
                loopObj(window.bridge.registerMap.async, spy);
                loopObj(window.bridge.registerMap.normal, spy);
            })


        function loopObj(obj: Object, spy: any) {
            for (const name of Object.getOwnPropertyNames(obj)) {
                if (!names.includes(name)) { continue; }
                const namespace = obj[name];
                for (const funName of Object.getOwnPropertyNames(namespace)) {
                    const type = typeof obj[name][funName];
                    if (type !== 'function') { continue; }
                    try {
                        obj[name][funName].call();
                    }
                    catch (error) { }
                    const funNameSpy = spy.withArgs(funName);
                    expect(funNameSpy).to.have.been.calledWith(funName).callCount(1);
                    spy.resetHistory();
                }
            }
        }
    })
});

