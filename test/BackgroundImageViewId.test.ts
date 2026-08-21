import assert from "assert";

import {
    aggregateBackgroundImageQueryResults,
    aggregateBackgroundImageReloadResults,
    assertBackgroundImageCapability,
    backgroundImageProviderParams,
    resolveBackgroundImageEventViewId,
    shouldQueryApplianceBackgroundImage,
    validateHasBackgroundImageParams,
} from "../src/bridge/BackgroundImageViewId";

assert.equal(resolveBackgroundImageEventViewId("app-a", false), "mainView");
assert.equal(resolveBackgroundImageEventViewId("app-a", true), "app-a");
assert.equal(aggregateBackgroundImageQueryResults([]), false);
assert.equal(aggregateBackgroundImageQueryResults([false, false]), false);
assert.equal(aggregateBackgroundImageQueryResults([false, true]), true);
assert.doesNotThrow(() => assertBackgroundImageCapability(true, true, () => undefined));
assert.throws(() => assertBackgroundImageCapability(false, true, () => undefined), /capability requires/);
assert.throws(() => assertBackgroundImageCapability(true, false, () => undefined), /capability requires/);
assert.throws(() => assertBackgroundImageCapability(true, true, undefined), /capability requires/);
assert.equal(shouldQueryApplianceBackgroundImage(["whiteSdk"]), false);
assert.equal(shouldQueryApplianceBackgroundImage(["appliance"]), true);
assert.equal(shouldQueryApplianceBackgroundImage(["appliance", "whiteSdk"]), true);

const query = {
    viewId: "mainView",
    scenePath: "/scene-1",
    imageUrl: "https://example.com/background.webp?token=value#fragment",
    sources: ["appliance", "whiteSdk"] as const,
};
validateHasBackgroundImageParams(query);
assert.deepEqual(backgroundImageProviderParams(query), {
    ...query,
    sources: ["appliance"],
});
assert.throws(() => validateHasBackgroundImageParams({ ...query, sources: [] }));
assert.doesNotThrow(() => validateHasBackgroundImageParams({ ...query, sources: ["whiteSdk"] }));
assert.throws(() => validateHasBackgroundImageParams({ ...query, sources: ["unknown"] as never }));
assert.throws(() => validateHasBackgroundImageParams({ ...query, imageUrl: "" }));

assert.deepEqual(aggregateBackgroundImageReloadResults([
    { accepted: true, reloadedCount: 1 },
    { accepted: false, reloadedCount: 0, reason: "resourceNotFound" },
]), { accepted: true, reloadedCount: 1 });
assert.deepEqual(aggregateBackgroundImageReloadResults([
    { accepted: false, reloadedCount: 0, reason: "sceneNotFocused" },
    { accepted: false, reloadedCount: 0, reason: "resourceNotFound" },
]), { accepted: false, reloadedCount: 0, reason: "sceneNotFocused" });
assert.deepEqual(aggregateBackgroundImageReloadResults([]), {
    accepted: false,
    reloadedCount: 0,
    reason: "viewNotFound",
});

console.log("background image view id tests passed");
