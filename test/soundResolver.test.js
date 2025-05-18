import assert from "node:assert/strict";
import test from "node:test";

import {
    normalizeSoundWorldState,
    resolveSoundState,
} from "../src/audio/soundResolver.js";

test("sound world state clamps renderer values", () => {
    const world = normalizeSoundWorldState({
        travelRunning: true,
        travelSpeed: 8,
        weather: {
            precipitation: 4,
            windSpeed: -2,
            windDirection: -4,
            mistDensity: 2,
            visibility: -1,
        },
    });
    assert.equal(world.travelSpeed, 2.5);
    assert.equal(world.precipitation, 1);
    assert.equal(world.windSpeed, 0);
    assert.equal(world.windDirection, -1);
    assert.equal(world.mistDensity, 1);
    assert.equal(world.visibility, 0);
});

test("authored scene weather resolves to its physical weather id", () => {
    const world = normalizeSoundWorldState({
        moodId: "monsoon",
        weatherId: "scene",
        authoredWeatherId: "monsoon",
    });
    assert.equal(world.weatherId, "monsoon");
});

test("stopping travel silences rail energy without freezing environment", () => {
    const sound = resolveSoundState({
        travelRunning: false,
        travelSpeed: 1.8,
        weather: { precipitation: 0.8, windSpeed: 1.5 },
    });
    assert.equal(sound.layers.rail, 0);
    assert.equal(sound.layers["rain-distant"] > 0, true);
    assert.equal(sound.layers["wind-soft"] > 0, true);
    assert.ok(sound.buses.environment > 0.8);
    assert.ok(sound.buses.train > 0.8);
});

test("capture presentation softens journey buses but keeps atmosphere", () => {
    const sound = resolveSoundState(
        { travelRunning: true, travelSpeed: 1 },
        { presentationPaused: true },
    );
    assert.equal(sound.buses.environment, 0.66);
    assert.equal(sound.buses.train, 0.12);
    assert.equal(sound.buses.music, 0.42);
    assert.equal(sound.buses.voice, 0);
});

test("rail energy follows physical coasting rather than the transport boolean", () => {
    const moving = resolveSoundState({
        travelRunning: false,
        travelSpeed: 1,
        motionLevel: 0.7,
    });
    const nearlyStopped = resolveSoundState({
        travelRunning: false,
        travelSpeed: 1,
        motionLevel: 0.1,
    });
    assert.ok(moving.layers.rail > nearlyStopped.layers.rail);
    assert.ok(nearlyStopped.layers.rail > 0);
});

test("authored scenes resolve distinct environmental beds", () => {
    const sakura = resolveSoundState({
        moodId: "sakura",
        weather: { precipitation: 0, visibility: 1 },
    });
    const monsoon = resolveSoundState({
        moodId: "monsoon",
        weatherId: "monsoon",
        weather: { precipitation: 1, visibility: 0.35, mistDensity: 0.7 },
    });

    assert.ok(
        sakura.layers["ambience-birds"] >
            sakura.layers["ambience-ominous"],
    );
    assert.equal(monsoon.layers["ambience-birds"], 0);
    assert.ok(
        monsoon.layers["music-ominous"] >
            monsoon.layers["ambience-ominous"],
    );
});

test("authored scenes select one score and rain restrains its level", () => {
    const departure = resolveSoundState({
        moodId: "departure",
        weather: { precipitation: 0 },
    });
    const wetDeparture = resolveSoundState({
        moodId: "departure",
        weather: { precipitation: 1 },
    });
    const blueHour = resolveSoundState({
        moodId: "blue-hour",
        weather: { precipitation: 0 },
    });

    assert.ok(departure.layers["music-calm"] > 0);
    assert.equal(departure.layers["music-melancholic"], 0);
    assert.ok(
        wetDeparture.layers["music-calm"] < departure.layers["music-calm"],
    );
    assert.ok(blueHour.layers["music-melancholic"] > 0);
    assert.equal(blueHour.layers["music-calm"], 0);
    assert.ok(departure.buses.music > departure.buses.environment);
    assert.ok(
        departure.layers["music-calm"] >
            departure.layers["ambience-melodic"],
    );
});

test("muting the music bus removes score-driven ducking", () => {
    const audible = resolveSoundState(
        { moodId: "departure", weather: { precipitation: 0 } },
        { musicLevel: 1 },
    );
    const silent = resolveSoundState(
        { moodId: "departure", weather: { precipitation: 0 } },
        { musicLevel: 0 },
    );

    assert.equal(silent.buses.environment, 1);
    assert.equal(silent.buses.train, 1);
    assert.ok(
        silent.layers["ambience-melodic"] >
            audible.layers["ambience-melodic"],
    );
});

test("moisture filters distance while signed wind moves directional layers", () => {
    const clear = resolveSoundState({
        moodId: "departure",
        weather: { visibility: 1, mistDensity: 0, windSpeed: 2, windDirection: 1 },
    });
    const obscured = resolveSoundState({
        moodId: "departure",
        weather: { visibility: 0.2, mistDensity: 0.8, windSpeed: 2, windDirection: -1 },
    });

    assert.ok(obscured.filters.distantCutoff < clear.filters.distantCutoff);
    assert.ok(clear.pans["wind-soft"] > 0);
    assert.ok(obscured.pans["wind-soft"] < 0);
});
