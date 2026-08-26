import assert from "assert";

import {
    dispatchPageEventOuter,
    forwardUnifiedPageStateChange,
    getPageStateOuter,
    UnifiedPageStateChange,
} from "../src/bridge/UnifiedPageControl";

async function main() {
    const calls: unknown[][] = [];
    const manager = {
        dispatchPageEvent(event: string, options: object) {
            calls.push([this, event, options]);
            return Promise.resolve(true);
        },
        getPageState(options: object) {
            calls.push([this, options]);
            return Promise.resolve({ target: "mainView" as const, page: 2, pageCount: 3 });
        },
    };

    assert.equal(
        await dispatchPageEventOuter(manager, "jumpToPage", { target: "mainView", page: 2 }),
        true
    );
    assert.deepEqual(calls[0], [manager, "jumpToPage", { target: "mainView", page: 2 }]);
    assert.deepEqual(await getPageStateOuter(manager, { target: "mainView" }), {
        target: "mainView",
        page: 2,
        pageCount: 3,
    });
    assert.deepEqual(calls[1], [manager, { target: "mainView" }]);

    assert.equal(await dispatchPageEventOuter(undefined, "nextPage"), false);
    assert.equal(await dispatchPageEventOuter({}, "nextPage"), false);
    await assert.rejects(getPageStateOuter(undefined), /window manager not existed/);
    await assert.rejects(getPageStateOuter({}), /does not support getPageState/);

    const notifications: unknown[][] = [];
    const state: UnifiedPageStateChange = {
        target: "Slide",
        appId: "slide-1",
        page: 2,
        pageCount: 3,
        status: "pending",
        view: 1,
        slide: 2,
    };
    forwardUnifiedPageStateChange((...args) => notifications.push(args), state);
    assert.deepEqual(notifications, [["sdk.unifiedPageStateChange", state]]);

    console.log("unified page control bridge tests passed");
}

void main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
