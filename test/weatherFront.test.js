import assert from "node:assert/strict";
import test from "node:test";
import { WEATHER_FRONTS, WeatherFront } from "../src/weather/weatherFront.js";
import { WEATHER_PRESETS } from "../src/weather/weatherEngine.js";

test("weather fronts reference authored stages with positive durations", () => {
    const presetIds = new Set(WEATHER_PRESETS.map(({ id }) => id));
    for (const front of WEATHER_FRONTS) {
        assert.ok(front.stages.length >= 3);
        for (const stage of front.stages) {
            assert.equal(typeof stage.weatherId, "string");
            assert.equal(presetIds.has(stage.weatherId), true);
            assert.ok(stage.duration > 0);
        }
    }
});

test("enabling a front emits its first stage exactly once", () => {
    const front = new WeatherFront("passing-shower");
    front.setEnabled(true);
    assert.equal(front.advance(0).changed, true);
    assert.equal(front.advance(0).changed, false);
});

test("front timing advances independently and wraps", () => {
    const front = new WeatherFront("quiet-air");
    front.setEnabled(true);
    front.advance(0);
    const first = front.current;
    for (let elapsed = 0; elapsed < first.duration + 0.1; elapsed += 0.1)
        front.advance(0.1);
    assert.equal(front.stageIndex, 1);
    assert.equal(front.getState().weatherId, "haze");
});

test("disabled fronts preserve their stage and progress", () => {
    const front = new WeatherFront();
    const before = front.getState();
    front.advance(10);
    assert.deepEqual(front.getState(), before);
});

test("front stages can be advanced deterministically for authoring", () => {
    const front = new WeatherFront("passing-shower");
    assert.equal(front.next(), "drizzle");
    front.setEnabled(true);
    const update = front.advance(0);
    assert.equal(update.changed, true);
    assert.equal(update.stage.weatherId, "drizzle");
});
