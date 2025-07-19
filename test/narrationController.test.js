import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import { NarrationController } from "../src/audio/narrationController.js";
import {
    NARRATION_ASSETS,
    normalizeNarrationManifest,
} from "../src/audio/narrationManifest.js";

const narration = {
    id: "test-voice",
    title: "Test Voice",
    src: "/voice.opus",
};

class FakeNarrationPlayer {
    constructor() {
        this.calls = [];
        this.state = {
            state: "idle",
            id: "",
            title: "",
            currentTime: 0,
            duration: 0,
            progress: 0,
        };
    }

    async playNarration(asset) {
        this.calls.push(["play", asset.id]);
        this.state = { ...this.state, state: "playing", id: asset.id };
    }

    pauseNarration() {
        this.calls.push(["pause"]);
        this.state = { ...this.state, state: "paused" };
    }

    async resumeNarration() {
        this.calls.push(["resume"]);
        this.state = { ...this.state, state: "playing" };
    }

    async replayNarration() {
        this.calls.push(["replay"]);
        this.state = { ...this.state, state: "playing" };
    }

    stopNarration(options) {
        this.calls.push(["stop", options]);
        this.state = {
            ...this.state,
            state: options?.skipped ? "skipped" : "idle",
        };
        return true;
    }

    getNarrationState() {
        return this.state;
    }
}

test("narration manifest validates identity, sources, and ducking", () => {
    const normalized = normalizeNarrationManifest([
        {
            ...narration,
            ducking: { environment: 0.6, train: 0.7, music: 0.2 },
        },
    ]);
    assert.equal(normalized[0].sources[0].src, "/voice.opus");
    assert.deepEqual(normalized[0].ducking, {
        environment: 0.6,
        train: 0.7,
        music: 0.2,
    });
    assert.throws(
        () => normalizeNarrationManifest([narration, narration]),
        /Duplicate narration id/,
    );
    assert.throws(
        () => normalizeNarrationManifest([{ id: "missing-source" }]),
        /requires at least one source/,
    );
});

test("production narration manifest points to a deployed voice recording", () => {
    const normalized = normalizeNarrationManifest(NARRATION_ASSETS);
    assert.equal(normalized.length, 1);
    for (const asset of normalized)
        for (const source of asset.sources)
            assert.equal(
                existsSync(`public${source.src}`),
                true,
                `Missing narration source: public${source.src}`,
            );
});

test("train state pauses and resumes narration at the player layer", async () => {
    const player = new FakeNarrationPlayer();
    const controller = new NarrationController({
        manifest: [narration],
        player,
    });

    assert.equal(await controller.play(), true);
    controller.updateWorldState({ travelRunning: false });
    assert.equal(controller.getState().state, "paused");
    controller.updateWorldState({ travelRunning: false });
    controller.updateWorldState({ travelRunning: true });
    assert.equal(controller.getState().state, "playing");
    assert.deepEqual(
        player.calls.map(([name]) => name),
        ["play", "pause", "resume"],
    );
});

test("disabled narration stops playback and cannot be started", async () => {
    const player = new FakeNarrationPlayer();
    const controller = new NarrationController({
        manifest: [narration],
        player,
    });
    await controller.play();
    assert.equal(controller.setEnabled(false), false);
    assert.equal(await controller.play(), false);
    assert.equal(controller.getState().state, "idle");
});
