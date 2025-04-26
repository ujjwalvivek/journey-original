import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EnvironmentClock } from "../src/webgpu/environmentClock.js";
import { WeatherClock } from "../src/weather/weatherClock.js";
import { advanceSimulationClocks } from "../src/weather/weatherSimulation.js";

const storm = {
    windSpeed: 2,
    windDirection: -1,
    gustiness: 0.7,
    precipitation: 1,
    rainSpeed: 1.5,
    mistSpeed: 1.2,
    wetness: 0,
    dryingRate: 0.12,
};

test("stopping travel leaves the physical weather system alive", () => {
    const environmentClock = new EnvironmentClock();
    const weatherClock = new WeatherClock();
    const state = advanceSimulationClocks(
        environmentClock,
        weatherClock,
        0.1,
        {
            travelRunning: false,
            travelSpeed: 1,
            weather: storm,
        },
    );

    assert.equal(state.travelTime, 0);
    assert.ok(state.windPhase < 0);
    assert.ok(state.foregroundPhase < 0);
    assert.equal(state.weatherTime, 0.1);
    assert.equal(state.precipitationTime, 0.15000000000000002);
    assert.ok(state.gustTime > 0);
    assert.ok(state.gustValue > 0);
    assert.ok(state.mistTime < 0);
    assert.equal(state.smokeLevel, 0);
});

test("stopped-train smoke fades while rain, mist, and gusts continue", () => {
    const environmentClock = new EnvironmentClock();
    const weatherClock = new WeatherClock();
    advanceSimulationClocks(environmentClock, weatherClock, 0.1, {
        travelRunning: true,
        weather: storm,
    });
    const smokeBeforeStop = environmentClock.smokeLevel;
    const weatherBeforeStop = weatherClock.weatherTime;

    for (let frame = 0; frame < 3; frame += 1)
        advanceSimulationClocks(environmentClock, weatherClock, 0.1, {
            travelRunning: false,
            weather: storm,
        });

    assert.ok(environmentClock.travelTime > 0.1);
    assert.ok(environmentClock.travelTime < 0.4);
    assert.ok(environmentClock.smokeLevel < smokeBeforeStop);
    assert.ok(weatherClock.weatherTime > weatherBeforeStop);
    assert.ok(weatherClock.precipitationTime > 0.15);
    assert.ok(weatherClock.gustTime > 0);
    assert.ok(weatherClock.mistTime < 0);
});

test("all shader media consume the shared living gust field", () => {
    const shader = readFileSync(
        new URL("../src/shaders/bufferA.wgsl", import.meta.url),
        "utf8",
    );
    assert.match(shader, /fn livingGust\(uv: vec2f\)/);
    assert.match(shader, /fn cloudCoordinates[\s\S]*?livingGust\(uv\)/);
    assert.match(shader, /let gustStrength = livingGust\(uv\)/);
    assert.match(shader, /let smokeGust = livingGust\(trainUv\)/);
    assert.match(shader, /let mistGust = livingGust\(uv\)/);
    assert.match(shader, /uniforms\.weatherTimes\.z/);
});
