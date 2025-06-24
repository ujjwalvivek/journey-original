import assert from "node:assert/strict";
import test from "node:test";

import {
    runShowcaseSequence,
    SHOWCASE_DURATION,
    SHOWCASE_SEQUENCE,
} from "../src/showcase/showcaseSequence.js";

test("the authored showcase follows the release sequence", () => {
    assert.deepEqual(
        SHOWCASE_SEQUENCE.map(({ id }) => id),
        ["departure", "monsoon", "sakura", "departure"],
    );
    assert.equal(SHOWCASE_DURATION, 72);
});

test("showcase progress spans every authored scene", async () => {
    let clock = 0;
    const scenes = [];
    let finalProgress = null;
    await runShowcaseSequence({
        sequence: [
            { id: "one", duration: 1 },
            { id: "two", duration: 2 },
        ],
        applyScene: ({ id }) => scenes.push(id),
        onProgress: (state) => {
            finalProgress = state;
        },
        now: () => clock,
        wait: async () => {
            clock += 1000;
        },
    });

    assert.deepEqual(scenes, ["one", "two"]);
    assert.equal(finalProgress.scene.id, "two");
    assert.equal(finalProgress.sceneElapsed, 2);
    assert.equal(finalProgress.elapsed, 3);
    assert.equal(finalProgress.progress, 1);
});

test("showcase sequences can be cancelled", async () => {
    const controller = new AbortController();
    let clock = 0;
    await assert.rejects(
        runShowcaseSequence({
            sequence: [{ id: "one", duration: 3 }],
            signal: controller.signal,
            applyScene: () => {},
            now: () => clock,
            wait: async () => {
                clock += 1000;
                controller.abort();
            },
        }),
        { name: "AbortError" },
    );
});
