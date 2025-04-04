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
        smokeLevel: clock.smokeLevel,
    }, {
        travelTime: 0,
        windPhase: 0,
        foregroundPhase: 0,
        smokeLevel: 0,
    });
});

test("smoke ramps up and down instead of switching abruptly", () => {
    const clock = new EnvironmentClock();

    clock.advance(0.1, { travelRunning: true });
    assert.ok(Math.abs(clock.smokeLevel - 0.07) < 1e-12);

    clock.advance(0.1, { travelRunning: false });
    assert.ok(Math.abs(clock.smokeLevel - 0.028) < 1e-12);

    clock.advance(0.1, { travelRunning: false });
    assert.equal(clock.smokeLevel, 0);
});

test("foreground clouds combine journey parallax with continuous wind motion", () => {
    const clock = new EnvironmentClock();
    clock.advance(0.1, { travelRunning: true, travelSpeed: 2, windSpeed: 3 });
    assert.ok(Math.abs(clock.foregroundPhase - 0.818) < 1e-12);

    clock.advance(0.1, { travelRunning: false, travelSpeed: 2, windSpeed: 3 });
    assert.ok(Math.abs(clock.foregroundPhase - 0.836) < 1e-12);
});

test("wind direction changes future displacement without scrubbing", () => {
    const clock = new EnvironmentClock();
    clock.advance(0.1, { windSpeed: 2, windDirection: 1 });
    const beforeReversal = clock.windPhase;
    assert.equal(beforeReversal, 0.2);

    clock.advance(0, { windSpeed: 2, windDirection: -1 });
    assert.equal(clock.windPhase, beforeReversal);
    clock.advance(0.1, { windSpeed: 2, windDirection: -1 });
    assert.equal(clock.windPhase, 0);
});

test("gusts accelerate wind without changing its authored direction", () => {
    const calm = new EnvironmentClock();
    const gusting = new EnvironmentClock();
    calm.advance(0.1, { windSpeed: 1, windDirection: -1, gust: 0 });
    gusting.advance(0.1, { windSpeed: 1, windDirection: -1, gust: 1 });
    assert.ok(gusting.windPhase < calm.windPhase);
    assert.ok(gusting.foregroundPhase < calm.foregroundPhase);
});
