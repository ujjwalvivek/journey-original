import assert from "node:assert/strict";
import test from "node:test";
import {
    BASE_WEATHER,
    RENDERED_WEATHER_CONTROLS,
    WEATHER_CONTROL_GROUPS,
    WEATHER_PRESETS,
    WEATHER_QUALITY_MODES,
    WEATHER_STATE_KEYS,
    WeatherEngine,
    composeWeather,
    extractSceneWeather,
    resolveAuthoredWeather,
} from "../src/weather/weatherEngine.js";
import {
    MOODS,
    MoodEngine,
    SCENE_DEFAULT_WEATHER,
} from "../src/webgpu/moodEngine.js";

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
        "rainDepthDistribution",
        "rainContrast",
        "foregroundRainAmount",
        "atmosphericDesaturation",
        "mistSpeed",
        "horizonGlow",
        "lightning",
        "snowfall",
        "snowSpeed",
        "snowMeltRate",
        "wetness",
        "lightScatter",
        "dryingRate",
    ]) assert.equal(renderedKeys.has(key), true, key);
});

test("new atmosphere and rain composition controls have neutral authored defaults", () => {
    assert.equal(BASE_WEATHER.atmosphericDesaturation, 0);
    assert.equal(BASE_WEATHER.rainDepthDistribution, 0);
    assert.equal(BASE_WEATHER.rainContrast, 0.5);
    assert.equal(BASE_WEATHER.foregroundRainAmount, 1);
    assert.equal(BASE_WEATHER.horizonGlow, 0);
    assert.equal(BASE_WEATHER.lightning, 0);
    assert.equal(BASE_WEATHER.snowfall, 0);
    assert.equal(BASE_WEATHER.snowMeltRate, 0.035);
});

test("snowfall and distant storm remain physically separate from rain", () => {
    const snowfall = resolveAuthoredWeather("snowfall");
    const distantStorm = resolveAuthoredWeather("distant-storm");
    assert.ok(snowfall.snowfall > 0);
    assert.equal(snowfall.precipitation, 0);
    assert.ok(distantStorm.lightning > 0);
    assert.equal(distantStorm.precipitation, 0);
});

test("new atmosphere and rain composition overrides are clamped", () => {
    const engine = new WeatherEngine(0);
    engine.setOverride("atmosphericDesaturation", 2);
    engine.setOverride("rainDepthDistribution", -2);
    engine.setOverride("rainContrast", 3);
    engine.setOverride("foregroundRainAmount", -1);
    const state = engine.update(0, BASE_WEATHER);
    assert.equal(state.atmosphericDesaturation, 1);
    assert.equal(state.rainDepthDistribution, -1);
    assert.equal(state.rainContrast, 1);
    assert.equal(state.foregroundRainAmount, 0);
});

test("weather lab groups cover every physical control exactly once", () => {
    const groupedKeys = WEATHER_CONTROL_GROUPS.flatMap(({ controls }) =>
        controls.map(({ key }) => key),
    );
    assert.equal(groupedKeys.length, WEATHER_STATE_KEYS.length);
    assert.deepEqual(new Set(groupedKeys), new Set(WEATHER_STATE_KEYS));
});

test("performance modes increase both pixel and rain budgets", () => {
    assert.deepEqual(
        WEATHER_QUALITY_MODES.map(({ value }) => value),
        [0, 1, 2],
    );
    assert.ok(
        WEATHER_QUALITY_MODES[0].maxPixels < WEATHER_QUALITY_MODES[1].maxPixels,
    );
    assert.ok(
        WEATHER_QUALITY_MODES[1].maxPixels < WEATHER_QUALITY_MODES[2].maxPixels,
    );
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

test("authored scenes resolve their explicit physical weather preset", () => {
    const physicalPresetIds = new Set(
        WEATHER_PRESETS.filter(({ state }) => state).map(({ id }) => id),
    );
    for (const scene of MOODS) {
        assert.equal(physicalPresetIds.has(scene.defaultWeatherId), true);
        assert.equal(scene.defaultWeatherId, SCENE_DEFAULT_WEATHER[scene.id]);
        const authored = resolveAuthoredWeather(scene.defaultWeatherId);
        const preset = WEATHER_PRESETS.find(
            ({ id }) => id === scene.defaultWeatherId,
        );
        assert.deepEqual(authored, preset.state);
    }
});

test("changing an authored scene transitions from the resolved weather", () => {
    const engine = new WeatherEngine(0);
    const clear = resolveAuthoredWeather("clear");
    const haze = resolveAuthoredWeather("haze");
    engine.update(0, clear);
    engine.setAuthoredWeather("haze", 0);

    const opening = engine.update(0, haze);
    assert.equal(opening.id, "scene");
    assert.equal(engine.authoredWeatherId, "haze");
    assert.equal(opening.windSpeed, clear.windSpeed);
    assert.equal(opening.horizonHaze, clear.horizonHaze);

    const resolving = engine.update(4, haze);
    assert.ok(resolving.windSpeed < clear.windSpeed);
    assert.ok(resolving.horizonHaze > clear.horizonHaze);
});

test("storm weather unfolds causally across delayed physical groups", () => {
    const engine = new WeatherEngine(0);
    const clear = resolveAuthoredWeather("clear");
    engine.update(0, clear);
    engine.setWeather("monsoon", 0, clear);

    const windStage = engine.update(1, clear);
    assert.ok(windStage.windSpeed > clear.windSpeed);
    assert.equal(windStage.cloudCoverage, clear.cloudCoverage);
    assert.equal(windStage.visibility, clear.visibility);
    assert.equal(windStage.mistDensity, clear.mistDensity);
    assert.equal(windStage.precipitation, clear.precipitation);
    assert.equal(windStage.wetness, clear.wetness);

    const cloudStage = engine.update(3, clear);
    assert.ok(cloudStage.cloudCoverage > clear.cloudCoverage);
    assert.equal(cloudStage.visibility, clear.visibility);
    assert.equal(cloudStage.precipitation, clear.precipitation);

    const visibilityStage = engine.update(5, clear);
    assert.ok(visibilityStage.visibility < clear.visibility);
    assert.equal(visibilityStage.mistDensity, clear.mistDensity);
    assert.equal(visibilityStage.precipitation, clear.precipitation);

    const rainStage = engine.update(8, clear);
    assert.ok(rainStage.mistDensity > clear.mistDensity);
    assert.ok(rainStage.precipitation > 0);
    assert.equal(rainStage.wetness, clear.wetness);

    const surfaceStage = engine.update(12, clear);
    assert.ok(surfaceStage.wetness > clear.wetness);
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

test("authored-scene mode is independent from embedded legacy mood weather", () => {
    for (const preset of MOODS) {
        const moodEngine = new MoodEngine(0);
        moodEngine.setMood(preset.id, 0);
        const scene = moodEngine.update(100);
        const weatherEngine = new WeatherEngine(0);
        weatherEngine.setAuthoredWeather(scene.defaultWeatherId, 0);
        const authored = resolveAuthoredWeather(scene.defaultWeatherId);
        const weather = weatherEngine.update(100, authored);
        const composed = composeWeather(scene, weather);
        for (const key of WEATHER_STATE_KEYS)
            assert.equal(composed[key], authored[key], `${preset.id}: ${key}`);
    }
});
