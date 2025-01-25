import assert from "node:assert/strict";
import test from "node:test";
import {
    DEFAULT_MAX_RENDER_PIXELS,
    fitRenderSize,
} from "../src/webgpu/renderBudget.js";

test("keeps ordinary one-times displays at native resolution", () => {
    const size = fitRenderSize({ cssWidth: 1280, cssHeight: 720 });
    assert.deepEqual(size, {
        width: 1280,
        height: 720,
        devicePixelRatio: 1,
        budgetScale: 1,
    });
});

test("caps high-DPI output by pixel budget while preserving aspect ratio", () => {
    const size = fitRenderSize({
        cssWidth: 3840,
        cssHeight: 2160,
        devicePixelRatio: 2,
    });

    assert.ok(size.width * size.height <= DEFAULT_MAX_RENDER_PIXELS);
    assert.ok(Math.abs(size.width / size.height - 16 / 9) < 0.002);
    assert.ok(size.budgetScale < 1);
});

test("respects the GPU maximum texture dimension", () => {
    const size = fitRenderSize({
        cssWidth: 12000,
        cssHeight: 1000,
        maxDimension: 4096,
        maxPixels: Number.MAX_SAFE_INTEGER,
    });

    assert.equal(size.width, 4096);
    assert.ok(size.height <= 342);
});
