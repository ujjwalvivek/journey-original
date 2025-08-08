import assert from "node:assert/strict";
import test from "node:test";
import { CueTimeline, JOURNEY_CUES } from "../src/journey/cueTimeline.js";

const cues = [
    { id: "a", moodId: "departure", narrationId: "voice-a", duration: 2, travelScale: 1 },
    { id: "b", moodId: "night-rail", narrationId: "voice-b", duration: 3, travelScale: 0.5 },
];

test("authored journey cues map every scene to a narration", () => {
    assert.deepEqual(
        JOURNEY_CUES.map(({ moodId, narrationId, dwellDuration }) => [
            moodId,
            narrationId,
            dwellDuration,
        ]),
        [
            ["departure", "narrative-1", 0],
            ["ember", "narrative-2", 0],
            ["sakura", "narrative-3", 0],
            ["monsoon", "narrative-4", 0],
            ["blue-hour", "narrative-5", 5],
            ["night-rail", "narrative-6", 0],
        ],
    );
});

test("cue dwell holds the authored scene before advancing", () => {
    const timeline = new CueTimeline([
        { id: "a", moodId: "departure", duration: 2, dwellDuration: 5 },
        { id: "b", moodId: "night-rail", duration: 3 },
    ]);
    timeline.setEnabled(true);

    assert.equal(timeline.advance(2).cue.id, "a");
    assert.equal(timeline.advance(0).dwelling, true);
    assert.equal(timeline.advance(4).cue.id, "a");
    assert.equal(timeline.advance(1).cue.id, "b");
    assert.equal(timeline.advance(0).dwelling, false);
});

test("narration-driven cues wait for voice completion", () => {
    const timeline = new CueTimeline([
        {
            id: "a",
            moodId: "departure",
            narrationId: "voice-a",
            duration: 2,
            dwellDuration: 1,
        },
        { id: "b", moodId: "night-rail", narrationId: "voice-b", duration: 3 },
    ]);
    timeline.setEnabled(true);
    timeline.setNarrationDriven(true);

    assert.equal(timeline.advance(20).cue.id, "a");
    assert.equal(timeline.completeNarration("voice-a"), true);
    assert.equal(timeline.advance(0).dwelling, true);
    assert.equal(timeline.advance(1).cue.id, "b");
    assert.equal(timeline.completeNarration("wrong-voice"), false);
});

test("skipping narration advances directly to the next authored cue", () => {
    const timeline = new CueTimeline([
        {
            id: "a",
            moodId: "departure",
            narrationId: "voice-a",
            duration: 2,
            dwellDuration: 5,
        },
        { id: "b", moodId: "night-rail", narrationId: "voice-b", duration: 3 },
    ]);
    timeline.setEnabled(true);
    timeline.setNarrationDriven(true);

    assert.equal(timeline.skipNarration("voice-a"), true);
    assert.equal(timeline.current.id, "b");
    assert.equal(timeline.elapsed, 7);
    assert.equal(timeline.isDwelling(), false);
});

test("disabled cue timeline remains at its opening cue", () => {
    const timeline = new CueTimeline(cues);
    timeline.advance(4, { running: true });
    assert.equal(timeline.current.id, "a");
    assert.equal(timeline.elapsed, 0);
});

test("cue timeline advances, pauses, and loops deterministically", () => {
    const timeline = new CueTimeline(cues);
    timeline.setEnabled(true);
    assert.equal(timeline.advance(2.5).cue.id, "b");
    assert.equal(timeline.advance(1, { running: false }).elapsed, 2.5);
    assert.equal(timeline.advance(3).cue.id, "a");
    assert.equal(timeline.elapsed, 0.5);
});

test("cue timeline respects journey speed", () => {
    const timeline = new CueTimeline(cues);
    timeline.setEnabled(true);
    timeline.advance(0.75, { speed: 2 });
    assert.equal(timeline.elapsed, 1.5);
});
