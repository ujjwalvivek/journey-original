import assert from "node:assert/strict";
import test from "node:test";
import { WeatherClock } from "../src/weather/weatherClock.js";

test("weather phases advance independently from journey travel", () => {
    const clock = new WeatherClock();
    clock.advance(0.1, {
        windSpeed: 2,
        gustiness: 0.5,
        precipitation: 1,
        rainSpeed: 1.5,
        mistSpeed: 0.8,
    });
    assert.equal(clock.weatherTime, 0.1);
    assert.equal(clock.precipitationTime, 0.15000000000000002);
    assert.equal(clock.gustTime, 0.25);
    assert.ok(Math.abs(clock.mistTime - 0.0448) < Number.EPSILON);
});

test("weather clock clamps unsafe frame deltas and resets", () => {
    const clock = new WeatherClock();
    clock.advance(4, { weatherSpeed: 2 });
    assert.equal(clock.weatherTime, 0.2);
    clock.reset();
    assert.deepEqual(clock, new WeatherClock());
});

test("precipitation amount never changes rain velocity", () => {
    const dryClock = new WeatherClock();
    const stormClock = new WeatherClock();
    dryClock.advance(0.1, { precipitation: 0, rainSpeed: 1.7 });
    stormClock.advance(0.1, { precipitation: 1, rainSpeed: 1.7 });
    assert.equal(dryClock.precipitationTime, stormClock.precipitationTime);
});
