import assert from "node:assert/strict";
import test from "node:test";
import {
    BASE_WEATHER,
    RENDERED_WEATHER_CONTROLS,
    WEATHER_PRESETS,
    WEATHER_STATE_KEYS,
    WeatherEngine,
    composeWeather,
    extractSceneWeather,
} from "../src/weather/weatherEngine.js";
import { MOODS, MoodEngine } from "../src/webgpu/moodEngine.js";

test("every physical weather preset resolves a complete state", () => {
    for (const preset of WEATHER_PRESETS.filter(({ state }) => state)) {
        assert.deepEqual(Object.keys(preset.state), WEATHER_STATE_KEYS);
        for (const value of Object.values(preset.state)) assert.equal(Number.isFinite(value), true);
    }
});

test("the weather lab exposes only shader-backed controls", () => {
    const renderedKeys = new Set(
        RENDERED_WEATHER_CONTROLS.map(({ key }) => key),
    );
    for (const key of [
        "windDirection",
        "gustiness",
        "precipitation",
        "rainDensity",
        "rainSpeed",
        "rainLength",
        "rainAngle",
    ]) assert.equal(renderedKeys.has(key), true, key);
    for (const key of ["wetness", "lightScatter", "dryingRate"])
        assert.equal(renderedKeys.has(key), false, key);
});

test("authored-scene weather mode is an exact pass-through", () => {
    const engine = new WeatherEngine(0);
    const authored = {
        ...BASE_WEATHER,
        cloudCoverage: 0.17,
        windSpeed: 1.62,
        fogDensity: 0.48,
    };
    const state = engine.update(4, authored);
    assert.equal(state.id, "scene");
    assert.equal(state.cloudCoverage, 0.17);
    assert.equal(state.windSpeed, 1.62);
    assert.equal(state.fogDensity, 0.48);
});

test("weather groups transition on independent schedules", () => {
    const engine = new WeatherEngine(0);
    engine.update(0, BASE_WEATHER);
    engine.setWeather("monsoon", 0, BASE_WEATHER);
    const state = engine.update(5, BASE_WEATHER);
    assert.ok(state.windSpeed > 1.7);
    assert.ok(state.precipitation > 0 && state.precipitation < 1);
    assert.ok(state.wetness > 0 && state.wetness < 1);
});

test("interrupting weather continues from the resolved state", () => {
    const engine = new WeatherEngine(0);
    engine.update(0, BASE_WEATHER);
    engine.setWeather("monsoon", 0, BASE_WEATHER);
    const interrupted = engine.update(3, BASE_WEATHER);
    engine.setWeather("clear", 3, BASE_WEATHER);
    const resumed = engine.update(3, BASE_WEATHER);
    assert.equal(resumed.cloudCoverage, interrupted.cloudCoverage);
    assert.equal(resumed.precipitation, interrupted.precipitation);
});

test("returning to authored weather transitions and then follows the scene", () => {
    const engine = new WeatherEngine(0);
    engine.update(0, BASE_WEATHER);
    engine.setWeather("drizzle", 0, BASE_WEATHER);
    engine.update(20, BASE_WEATHER);
    engine.setWeather("scene", 20, BASE_WEATHER);
    assert.equal(engine.update(20, BASE_WEATHER).precipitation, 0.34);
    assert.equal(engine.update(40, BASE_WEATHER).precipitation, 0);
    const changedScene = { ...BASE_WEATHER, windSpeed: 2.1 };
    assert.equal(engine.update(41, changedScene).windSpeed, 2.1);
});

test("weather composition overrides only weather-owned channels", () => {
    const scene = { exposure: 0.8, cloudCoverage: -0.1, trainEmphasis: 1 };
    const weather = extractSceneWeather({ cloudCoverage: 0.2, windSpeed: 1.4 });
    const composed = composeWeather(scene, weather);
    assert.equal(composed.exposure, 0.8);
    assert.equal(composed.trainEmphasis, 1);
    assert.equal(composed.cloudCoverage, 0.2);
    assert.equal(composed.windSpeed, 1.4);
});

test("authored-scene mode preserves every legacy mood weather value", () => {
    for (const preset of MOODS) {
        const moodEngine = new MoodEngine(0);
        moodEngine.setMood(preset.id, 0);
        const scene = moodEngine.update(100);
        const weatherEngine = new WeatherEngine(0);
        const weather = weatherEngine.update(100, extractSceneWeather(scene));
        const composed = composeWeather(scene, weather);
        for (const key of [
            "cloudCoverage",
            "cloudHeight",
            "cloudScale",
            "turbulence",
            "windSpeed",
            "smokeAmount",
            "fogDensity",
        ]) assert.equal(composed[key], scene[key], `${preset.id}: ${key}`);
    }
});
