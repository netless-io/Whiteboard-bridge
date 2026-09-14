import assert from "assert";

import {
    dispatchDocsEventOuter,
    fitOriginSizeAndCameraOuter,
    forwardUnifiedPageStateChange,
    getPageStateOuter,
    UnifiedPageStateChange,
} from "../src/bridge/UnifiedPageControl";

async function main() {
    const calls: unknown[][] = [];
    const manager = {
        fitCount: 0,
        dispatchDocsEvent(event: string, options: object) {
            calls.push([this, event, options]);
            return Promise.resolve({ accepted: true as const });
        },
        getPageState(options: object) {
            calls.push([this, options]);
            return Promise.resolve({ target: "mainView" as const, page: 2, pageCount: 3 });
        },
        fitOriginSizeAndCamera() {
            this.fitCount += 1;
        },
    };

    assert.deepEqual(
        await dispatchDocsEventOuter(manager, "jumpToPage", { target: "mainView", page: 2 }),
        { accepted: true }
    );
    assert.deepEqual(calls[0], [manager, "jumpToPage", { target: "mainView", page: 2 }]);
    assert.deepEqual(
        await dispatchDocsEventOuter(manager, "scalePage", {
            target: "mainView",
            scale: 1.5,
        }),
        { accepted: true }
    );
    assert.deepEqual(calls[1], [manager, "scalePage", { target: "mainView", scale: 1.5 }]);
    assert.deepEqual(await getPageStateOuter(manager, { target: "mainView" }), {
        target: "mainView",
        page: 2,
        pageCount: 3,
    });
    assert.deepEqual(calls[2], [manager, { target: "mainView" }]);
    fitOriginSizeAndCameraOuter(manager);
    assert.equal(manager.fitCount, 1);

    assert.deepEqual(await dispatchDocsEventOuter(undefined, "nextPage"), {
        accepted: false,
        reason: "targetNotSupported",
        message: "window manager does not support dispatchDocsEvent",
    });
    assert.deepEqual(await dispatchDocsEventOuter({}, "nextPage"), {
        accepted: false,
        reason: "targetNotSupported",
        message: "window manager does not support dispatchDocsEvent",
    });

    const unsupportedScale = {
        accepted: false as const,
        reason: "eventNotSupported" as const,
        message: "DocsViewer does not support scalePage",
    };
    manager.dispatchDocsEvent = () => Promise.resolve(unsupportedScale);
    assert.deepEqual(
        await dispatchDocsEventOuter(manager, "scalePage", { target: "DocsViewer-1", scale: 2 }),
        unsupportedScale
    );
    await assert.rejects(getPageStateOuter(undefined), /window manager not existed/);
    await assert.rejects(getPageStateOuter({}), /does not support getPageState/);
    assert.throws(() => fitOriginSizeAndCameraOuter(undefined), /window manager not existed/);
    assert.throws(
        () => fitOriginSizeAndCameraOuter({}),
        /does not support fitOriginSizeAndCamera/
    );

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

    const docsViewerState: UnifiedPageStateChange = {
        target: "DocsViewer",
        appId: "docs-1",
        page: 1,
        pageCount: 2,
        status: "success",
    };
    forwardUnifiedPageStateChange((...args) => notifications.push(args), docsViewerState);
    assert.deepEqual(notifications[1], ["sdk.unifiedPageStateChange", docsViewerState]);

    console.log("unified page control bridge tests passed");
}

void main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
