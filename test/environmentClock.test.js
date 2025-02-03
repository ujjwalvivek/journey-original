import assert from "node:assert/strict";
import test from "node:test";
import { EnvironmentClock } from "../src/webgpu/environmentClock.js";

test("holding travel does not freeze the wind phase", () => {
    const clock = new EnvironmentClock();
    clock.advance(0.1, {
        travelRunning: false,
        windSpeed: 2,
    });

    assert.equal(clock.travelTime, 0);
    assert.equal(clock.windPhase, 0.2);
    assert.equal(clock.foregroundPhase, 0.012);
});

test("changing rates affects future motion without scrubbing accumulated phases", () => {
    const clock = new EnvironmentClock();
    clock.advance(0.1, { windSpeed: 1 });
    const before = clock.windPhase;

    assert.equal(before, 0.1);
    assert.equal(clock.windPhase, before);

    clock.advance(0.1, { windSpeed: 2 });
    assert.equal(clock.windPhase, 0.30000000000000004);
});

test("reset returns every phase to the baseline", () => {
    const clock = new EnvironmentClock();
    clock.advance(0.1, { travelSpeed: 2, windSpeed: 2 });
    clock.reset();

    assert.deepEqual({
        travelTime: clock.travelTime,
        windPhase: clock.windPhase,
        foregroundPhase: clock.foregroundPhase,
    }, {
        travelTime: 0,
        windPhase: 0,
        foregroundPhase: 0,
    });
});

test("foreground clouds switch from journey motion to distant wind motion", () => {
    const clock = new EnvironmentClock();
    clock.advance(0.1, { travelRunning: true, travelSpeed: 2, windSpeed: 3 });
    assert.equal(clock.foregroundPhase, 0.8);

    clock.advance(0.1, { travelRunning: false, travelSpeed: 2, windSpeed: 3 });
    assert.ok(Math.abs(clock.foregroundPhase - 0.818) < 1e-12);
});
