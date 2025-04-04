import assert from "node:assert/strict";
import test from "node:test";
import {
    WeatherClock,
    resolveGust,
} from "../src/weather/weatherClock.js";

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
    assert.equal(clock.gustValue, resolveGust(0.25, 0.5));
    const expectedMist = 0.1 * 0.8 * 0.56 *
        (1 + clock.gustValue * 0.65);
    assert.ok(Math.abs(clock.mistTime - expectedMist) < 1e-12);
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

test("mist speed scales future mist motion without scrubbing its phase", () => {
    const clock = new WeatherClock();
    clock.advance(0.1, { windSpeed: 1, mistSpeed: 0.5 });
    const slowAdvance = clock.mistTime;
    clock.advance(0.1, { windSpeed: 1, mistSpeed: 2 });
    const fastAdvance = clock.mistTime - slowAdvance;
    assert.ok(Math.abs(fastAdvance / slowAdvance - 4) < Number.EPSILON);
});

test("surfaces absorb precipitation and dry at the authored rate", () => {
    const clock = new WeatherClock();
    for (let frame = 0; frame < 20; frame += 1)
        clock.advance(0.1, { precipitation: 1, wetness: 0 });
    const soaked = clock.surfaceWetness;
    assert.ok(soaked > 0.8 && soaked <= 0.92);
    for (let frame = 0; frame < 10; frame += 1)
        clock.advance(0.1, {
            precipitation: 0,
            wetness: 0,
            dryingRate: 0.2,
        });
    assert.ok(Math.abs(clock.surfaceWetness - (soaked - 0.2)) < 1e-12);
});

test("authored residual wetness is a drying floor", () => {
    const clock = new WeatherClock();
    clock.surfaceWetness = 0.8;
    for (let frame = 0; frame < 20; frame += 1)
        clock.advance(0.1, {
            precipitation: 0,
            wetness: 0.62,
            dryingRate: 0.5,
        });
    assert.equal(clock.surfaceWetness, 0.62);
});
