import assert from "node:assert/strict";
import test from "node:test";
import { CueTimeline } from "../src/journey/cueTimeline.js";

const cues = [
    { id: "a", moodId: "departure", duration: 2, travelScale: 1 },
    { id: "b", moodId: "night-rail", duration: 3, travelScale: 0.5 },
];

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
