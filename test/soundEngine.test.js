import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import {
    AUDIO_ASSETS,
    normalizeAudioManifest,
} from "../src/audio/audioManifest.js";
import {
    AudioAssetLoader,
    selectPlayableSource,
} from "../src/audio/audioLoader.js";
import {
    MASTER_DYNAMICS,
    resolveCueAmbienceGain,
    resolveCueMusicGain,
    SoundEngine,
} from "../src/audio/soundEngine.js";
import { normalizeNarrationManifest } from "../src/audio/narrationManifest.js";

class FakeParam {
    constructor(value = 1) {
        this.value = value;
        this.events = [];
    }

    cancelScheduledValues(time) {
        this.events.push(["cancel", time]);
    }

    setValueAtTime(value, time) {
        this.value = value;
        this.events.push(["set", value, time]);
    }

    linearRampToValueAtTime(value, time) {
        this.value = value;
        this.events.push(["ramp", value, time]);
    }
}

class FakeNode {
    constructor() {
        this.connections = [];
        this.disconnected = false;
    }

    connect(node) {
        this.connections.push(node);
        return node;
    }

    disconnect() {
        this.disconnected = true;
    }
}

class FakeGain extends FakeNode {
    constructor() {
        super();
        this.gain = new FakeParam(1);
    }
}

class FakeCompressor extends FakeNode {
    constructor() {
        super();
        for (const key of ["threshold", "knee", "ratio", "attack", "release"])
            this[key] = new FakeParam();
    }
}

class FakeBiquadFilter extends FakeNode {
    constructor() {
        super();
        this.type = "lowpass";
        this.frequency = new FakeParam(18000);
        this.Q = new FakeParam(1);
    }
}

class FakeStereoPanner extends FakeNode {
    constructor() {
        super();
        this.pan = new FakeParam(0);
    }
}

class FakeSource extends FakeNode {
    constructor() {
        super();
        this.playbackRate = new FakeParam(1);
        this.started = false;
        this.stoppedAt = null;
        this.loop = false;
    }

    start() {
        this.started = true;
    }

    stop(time) {
        this.stoppedAt = time;
        this.onended?.();
    }
}

class FakeMediaElement {
    constructor() {
        this.src = "";
        this.loop = false;
        this.preload = "none";
        this.playsInline = false;
        this.playCount = 0;
        this.pauseCount = 0;
        this.loaded = false;
        this.onended = null;
        this.ontimeupdate = null;
        this.currentTime = 0;
        this.duration = 0;
    }

    async play() {
        this.playCount += 1;
    }

    pause() {
        this.pauseCount += 1;
    }

    removeAttribute(name) {
        if (name === "src") this.src = "";
    }

    load() {
        this.loaded = true;
    }
}

test("narration ducks the mix and preserves position across train pauses", async () => {
    const media = new FakeMediaElement();
    media.duration = 60;
    const engine = new SoundEngine({
        manifest: [],
        AudioContextClass: FakeAudioContext,
        createMediaElement: () => media,
    });
    const [voice] = normalizeNarrationManifest([
        {
            id: "voice-test",
            title: "Voice Test",
            src: "/voice.opus",
            fadeIn: 0.1,
            pauseFade: 0.04,
            ducking: { environment: 0.6, train: 0.72, music: 0.25 },
        },
    ]);

    await engine.unlock();
    await engine.playNarration(voice);
    assert.equal(engine.getNarrationState().state, "playing");
    assert.equal(
        engine.buses.get("music").stateGain.gain.value,
        engine.resolved.buses.music * 0.25,
    );

    media.currentTime = 17.25;
    engine.pauseNarration();
    assert.equal(engine.getNarrationState().state, "paused");
    assert.equal(engine.getNarrationState().currentTime, 17.25);
    assert.equal(
        engine.buses.get("music").stateGain.gain.value,
        engine.resolved.buses.music,
    );

    await engine.resumeNarration();
    assert.equal(engine.getNarrationState().state, "playing");
    assert.equal(engine.getNarrationState().currentTime, 17.25);
    assert.equal(
        engine.buses.get("environment").stateGain.gain.value,
        engine.resolved.buses.environment * 0.6,
    );

    await engine.setPageHidden(true);
    assert.equal(engine.getNarrationState().state, "paused");
    await engine.setPageHidden(false);
    assert.equal(engine.getNarrationState().state, "playing");
    assert.equal(engine.getNarrationState().currentTime, 17.25);

    engine.stopNarration({ fade: 0, skipped: true });
    assert.equal(engine.getNarrationState().state, "skipped");
    await engine.destroy();
});

test("reports natural narration completion separately from manual stops", async () => {
    const media = new FakeMediaElement();
    let completed = null;
    const engine = new SoundEngine({
        manifest: [],
        AudioContextClass: FakeAudioContext,
        createMediaElement: () => media,
        onNarrationComplete: (event) => {
            completed = event;
        },
    });
    const [voice] = normalizeNarrationManifest([
        { id: "voice-complete", title: "Complete", src: "/voice.opus" },
    ]);

    await engine.unlock();
    await engine.playNarration(voice);
    media.onended?.();
    assert.deepEqual(completed, {
        id: "voice-complete",
        title: "Complete",
    });

    completed = null;
    await engine.playNarration(voice);
    engine.stopNarration({ fade: 0 });
    assert.equal(completed, null);
    await engine.destroy();
});

class FakeAudioContext {
    constructor() {
        this.currentTime = 4;
        this.state = "suspended";
        this.destination = new FakeNode();
        this.sources = [];
    }

    createGain() {
        return new FakeGain();
    }

    createDynamicsCompressor() {
        return new FakeCompressor();
    }

    createBiquadFilter() {
        return new FakeBiquadFilter();
    }

    createStereoPanner() {
        return new FakeStereoPanner();
    }

    createBufferSource() {
        const source = new FakeSource();
        this.sources.push(source);
        return source;
    }

    createMediaElementSource() {
        return new FakeNode();
    }

    createMediaStreamDestination() {
        return {
            stream: {
                getAudioTracks: () => [{ kind: "audio" }],
            },
        };
    }

    async decodeAudioData(bytes) {
        return { byteLength: bytes.byteLength };
    }

    async resume() {
        this.state = "running";
    }

    async suspend() {
        this.state = "suspended";
    }

    async close() {
        this.state = "closed";
    }
}

const manifest = [
    {
        id: "rail-test",
        bus: "train",
        role: "rail",
        sources: [{ src: "/rail.ogg", type: "audio/ogg" }],
        gain: 0.7,
        autoplay: true,
    },
];

test("manifest validation rejects duplicate ids and invalid loop ranges", () => {
    assert.throws(
        () => normalizeAudioManifest([...manifest, ...manifest]),
        /Duplicate audio asset id/,
    );
    assert.throws(
        () => normalizeAudioManifest([{ ...manifest[0], loopStart: 4, loopEnd: 2 }]),
        /invalid loop range/,
    );
});

test("weather cue envelope crossfades back into ambience", () => {
    const envelope = {
        startedAt: 10,
        duration: 28,
        fadeIn: 1,
        fadeOut: 5,
        floor: 0.3,
    };
    assert.equal(resolveCueAmbienceGain(envelope, 10), 1);
    assert.equal(resolveCueAmbienceGain(envelope, 11), 0.3);
    assert.equal(resolveCueAmbienceGain(envelope, 33), 0.3);
    assert.ok(resolveCueAmbienceGain(envelope, 35.5) > 0.3);
    assert.equal(resolveCueAmbienceGain(envelope, 38), 1);
    assert.equal(
        resolveCueMusicGain({ ...envelope, musicFloor: 0.45 }, 11),
        0.45,
    );
});

test("production audio manifest points to deployed source files", () => {
    const normalized = normalizeAudioManifest(AUDIO_ASSETS);
    assert.equal(normalized.length, 19);
    for (const asset of normalized) {
        for (const source of asset.sources) {
            const file = new URL(`../public${source.src}`, import.meta.url);
            assert.equal(existsSync(file), true, `${asset.id} source is missing`);
        }
    }
});

test("source selection prefers a probably-supported encoding", () => {
    const sources = [
        { src: "/sound.ogg", type: "audio/ogg" },
        { src: "/sound.mp3", type: "audio/mpeg" },
    ];
    assert.equal(
        selectPlayableSource(sources, (type) =>
            type === "audio/mpeg" ? "probably" : "maybe",
        ).src,
        "/sound.mp3",
    );
});

test("audio loader calls receiver-sensitive fetch with the browser global", async () => {
    let receiver = null;
    const loader = new AudioAssetLoader(new FakeAudioContext(), {
        fetchFn: async function () {
            receiver = this;
            return {
                ok: true,
                arrayBuffer: async () => new ArrayBuffer(4),
            };
        },
    });
    await loader.load(normalizeAudioManifest(manifest)[0]);
    assert.equal(receiver, globalThis);
});

test("Sound Engine unlocks lazily and starts manifest layers", async () => {
    const states = [];
    const engine = new SoundEngine({
        manifest,
        AudioContextClass: FakeAudioContext,
        fetchFn: async () => ({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(8),
        }),
        canPlayType: () => "probably",
        onStateChange: (state) => states.push(state),
    });
    assert.equal(engine.context, null);
    await engine.unlock();
    assert.equal(engine.state, "ready");
    assert.deepEqual(engine.getState().activeLayers, ["rail-test"]);
    assert.equal(engine.context.sources[0].started, true);
    assert.equal(engine.compressor.threshold.value, MASTER_DYNAMICS.threshold);
    assert.equal(engine.compressor.ratio.value, MASTER_DYNAMICS.ratio);

    engine.setBusVolume("music", 0);
    assert.equal(engine.getState().resolved.buses.environment, 1);
    assert.equal(engine.getState().resolved.buses.train, 1);

    engine.setBusMuted("train", true);
    assert.equal(engine.buses.get("train").volumeGain.gain.value, 0);
    engine.setBusMuted("train", false);
    engine.setSoloBus("train");
    assert.equal(engine.buses.get("environment").volumeGain.gain.value, 0);
    assert.equal(engine.buses.get("train").volumeGain.gain.value, 1);
    engine.setSoloBus("");

    const recordingOutput = engine.createRecordingOutput();
    assert.equal(recordingOutput.stream.getAudioTracks().length, 1);
    assert.equal(engine.recordingOutputs.size, 1);
    recordingOutput.release();
    assert.equal(engine.recordingOutputs.size, 0);

    engine.updateWorldState({ travelRunning: false, travelSpeed: 1 });
    assert.equal(engine.getState().resolved.layers.rail, 0);
    assert.equal(engine.layers.get("rail-test").gain.gain.value, 0);

    engine.setMuted(true);
    assert.equal(engine.masterGain.gain.value, 0);
    await engine.setPageHidden(true);
    assert.equal(engine.state, "suspended");
    await engine.setPageHidden(false);
    assert.equal(engine.state, "ready");
    await engine.destroy();
    assert.equal(engine.state, "destroyed");
    assert.deepEqual(states, ["ready", "suspended", "ready", "destroyed"]);
});

test("speed changes update active train loops without restarting them", async () => {
    const engine = new SoundEngine({
        manifest,
        AudioContextClass: FakeAudioContext,
        fetchFn: async () => ({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(8),
        }),
    });
    engine.updateWorldState({ travelRunning: true, travelSpeed: 0.45 });
    await engine.unlock();

    const layer = engine.layers.get("rail-test");
    const source = layer.source;
    const initialRate = source.playbackRate.value;
    const initialSourceCount = engine.context.sources.length;

    engine.updateWorldState({ travelRunning: true, travelSpeed: 2.1 });

    assert.strictEqual(engine.layers.get("rail-test"), layer);
    assert.strictEqual(engine.layers.get("rail-test").source, source);
    assert.equal(engine.context.sources.length, initialSourceCount);
    assert.equal(source.stoppedAt, null);
    assert.ok(source.playbackRate.value > initialRate);
    await engine.destroy();
});

test("reactive weather layers load on demand and train changes fire cues", async () => {
    const reactiveManifest = [
        {
            id: "wind-test",
            bus: "environment",
            role: "wind-soft",
            src: "/wind.ogg",
            reactive: true,
        },
        {
            id: "stop-test",
            bus: "train",
            role: "train-transition",
            src: "/stop.ogg",
            loop: false,
            trigger: "train-stop",
            preload: true,
        },
    ];
    const engine = new SoundEngine({
        manifest: reactiveManifest,
        AudioContextClass: FakeAudioContext,
        fetchFn: async () => ({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(8),
        }),
    });
    engine.updateWorldState({
        travelRunning: true,
        weather: { windSpeed: 1.8, windDirection: 1 },
    });
    await engine.unlock();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(engine.layers.has("wind-test"), true);
    assert.ok(engine.layers.get("wind-test").panner.pan.value > 0);

    engine.updateWorldState({
        travelRunning: true,
        weather: {
            windSpeed: 1.8,
            windDirection: -1,
            mistDensity: 0.8,
            visibility: 0.2,
        },
    });
    assert.ok(engine.layers.get("wind-test").panner.pan.value < 0);
    assert.ok(engine.buses.get("environment").filter.frequency.value < 10000);

    engine.updateWorldState({
        travelRunning: false,
        weather: { windSpeed: 1.8 },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
        [...engine.layers.keys()].some((id) => id.startsWith("stop-test#")),
        true,
    );
    await engine.destroy();
});

test("weather arrival cues do not cancel transport cues", async () => {
    const cueManifest = [
        {
            id: "start-test",
            bus: "train",
            role: "train-transition",
            src: "/start.ogg",
            loop: false,
            trigger: "train-start",
            triggerGroup: "transport",
        },
        {
            id: "storm-test",
            bus: "environment",
            role: "weather-transition",
            src: "/storm.ogg",
            loop: false,
            trigger: "weather-monsoon",
            triggerGroup: "weather",
        },
    ];
    const engine = new SoundEngine({
        manifest: cueManifest,
        AudioContextClass: FakeAudioContext,
        fetchFn: async () => ({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(8),
        }),
    });
    engine.updateWorldState({ travelRunning: false, weatherId: "clear" });
    await engine.unlock();
    engine.updateWorldState({ travelRunning: true, weatherId: "clear" });
    await new Promise((resolve) => setImmediate(resolve));
    const transportKey = [...engine.layers.keys()].find((id) =>
        id.startsWith("start-test#"),
    );
    assert.ok(transportKey);

    engine.updateWorldState({ travelRunning: true, weatherId: "monsoon" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(engine.layers.has(transportKey), true);
    assert.equal(
        [...engine.layers.keys()].some((id) => id.startsWith("storm-test#")),
        true,
    );
    engine.updateWorldState({
        moodId: "departure",
        weatherId: "clear",
        authoredWeatherId: "clear",
    });
    assert.equal(
        [...engine.layers.keys()].some((id) => id.startsWith("storm-test#")),
        false,
    );
    await engine.destroy();
});

test("stopping a weather trigger fades and removes its one-shot", async () => {
    const engine = new SoundEngine({
        manifest: [
            {
                id: "storm-test",
                bus: "music",
                role: "weather-transition",
                src: "/storm.ogg",
                loop: false,
                trigger: "weather-monsoon",
                triggerGroup: "weather",
                duckAmbience: 0.3,
                duckMusic: 0.4,
                fadeOut: 5,
            },
        ],
        AudioContextClass: FakeAudioContext,
        fetchFn: async () => ({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(8),
        }),
    });
    engine.updateWorldState({ weatherId: "clear" });
    await engine.unlock();
    assert.equal(engine.playTrigger("weather-monsoon"), true);
    await new Promise((resolve) => setImmediate(resolve));
    const layerKey = [...engine.layers.keys()].find((id) =>
        id.startsWith("storm-test#"),
    );
    assert.ok(layerKey);
    assert.equal(engine.stopTrigger("weather-monsoon"), true);
    assert.equal(engine.context.sources.at(-1).stoppedAt, 9);
    assert.equal(engine.layers.has(layerKey), false);
    assert.equal(engine.ambienceCueEnvelope, null);
    await engine.destroy();
});

test("trigger cooldowns reject chatter while manual previews remain available", async () => {
    const engine = new SoundEngine({
        manifest: [
            {
                id: "start-test",
                bus: "train",
                role: "train-transition",
                src: "/start.ogg",
                loop: false,
                trigger: "train-start",
                cooldown: 2,
            },
        ],
        AudioContextClass: FakeAudioContext,
        fetchFn: async () => ({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(8),
        }),
    });
    await engine.unlock();
    assert.equal(engine.playTrigger("train-start"), true);
    assert.equal(engine.playTrigger("train-start"), false);
    assert.equal(engine.previewTrigger("train-start"), true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
        [...engine.layers.keys()].filter((id) => id.startsWith("start-test#"))
            .length,
        2,
    );
    await engine.destroy();
});

test("manual cue previews are exclusive even while the previous cue loads", async () => {
    const engine = new SoundEngine({
        manifest: [
            {
                id: "start-test",
                bus: "train",
                role: "train-transition",
                src: "/start.ogg",
                loop: false,
                trigger: "train-start",
            },
            {
                id: "stop-test",
                bus: "train",
                role: "train-transition",
                src: "/stop.ogg",
                loop: false,
                trigger: "train-stop",
            },
        ],
        AudioContextClass: FakeAudioContext,
        fetchFn: async () => ({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(8),
        }),
    });
    await engine.unlock();
    engine.previewTrigger("train-start");
    engine.previewTrigger("train-stop");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
        [...engine.layers.keys()].some((id) => id.startsWith("start-test#")),
        false,
    );
    assert.equal(
        [...engine.layers.keys()].filter((id) => id.startsWith("stop-test#"))
            .length,
        1,
    );
    await engine.destroy();
});

test("failed reactive layers are quarantined until an explicit retry", async () => {
    let requests = 0;
    const failures = [];
    const engine = new SoundEngine({
        manifest: [
            {
                id: "broken-wind",
                bus: "environment",
                role: "wind-soft",
                src: "/broken.ogg",
                reactive: true,
            },
        ],
        AudioContextClass: FakeAudioContext,
        fetchFn: async () => {
            requests += 1;
            throw new Error("network unavailable");
        },
        onLayerError: (failure) => failures.push(failure),
    });
    engine.updateWorldState({ weather: { windSpeed: 2 } });
    await engine.unlock();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(requests, 1);
    assert.equal(engine.getState().failedLayers.length, 1);

    engine.updateWorldState({ weather: { windSpeed: 2 } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(requests, 1);

    engine.retryFailedLayers();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(requests, 2);
    assert.equal(failures.length, 2);
    await engine.destroy();
});

test("authored Monsoon scene fires the storm arrival cue", async () => {
    const engine = new SoundEngine({
        manifest: [
            {
                id: "storm-test",
                bus: "environment",
                role: "weather-transition",
                src: "/storm.ogg",
                loop: false,
                trigger: "weather-monsoon",
                triggerGroup: "weather",
            },
        ],
        AudioContextClass: FakeAudioContext,
        fetchFn: async () => ({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(8),
        }),
    });
    engine.updateWorldState({
        weatherId: "scene",
        authoredWeatherId: "clear",
    });
    await engine.unlock();
    engine.updateWorldState({
        moodId: "monsoon",
        weatherId: "scene",
        authoredWeatherId: "monsoon",
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
        [...engine.layers.keys()].some((id) => id.startsWith("storm-test#")),
        true,
    );
    await engine.destroy();
});

test("Monsoon score begins halfway through its transition cue", async () => {
    const mediaElements = [];
    const engine = new SoundEngine({
        manifest: [
            {
                id: "ominous-test",
                label: "Night Rain",
                bus: "music",
                role: "music-ominous",
                src: "/ominous.opus",
                stream: true,
                reactive: true,
                fade: 6,
            },
            {
                id: "storm-test",
                bus: "environment",
                role: "weather-transition",
                src: "/storm.opus",
                loop: false,
                durationHint: 10,
                fadeOut: 2,
                duckAmbience: 0.3,
                musicEntryFraction: 0.5,
                musicEntryFade: 3,
                trigger: "weather-monsoon",
                triggerGroup: "weather",
            },
        ],
        AudioContextClass: FakeAudioContext,
        fetchFn: async () => ({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(8),
        }),
        createMediaElement: () => {
            const media = new FakeMediaElement();
            mediaElements.push(media);
            return media;
        },
    });
    engine.updateWorldState({ moodId: "departure", weatherId: "clear" });
    await engine.unlock();

    engine.updateWorldState({ moodId: "monsoon", weatherId: "monsoon" });
    await new Promise((resolve) => setImmediate(resolve));
    const score = engine.layers.get("ominous-test");
    assert.ok(score);
    assert.equal(score.waitingForEntry, true);
    assert.equal(mediaElements[0].playCount, 0);

    engine.context.currentTime += 4.9;
    engine.updateWorldState({ moodId: "monsoon", weatherId: "monsoon" });
    assert.equal(mediaElements[0].playCount, 0);

    engine.context.currentTime += 0.2;
    engine.updateWorldState({ moodId: "monsoon", weatherId: "monsoon" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(score.waitingForEntry, false);
    assert.equal(mediaElements[0].playCount, 1);
    assert.deepEqual(score.gain.gain.events.at(-1), ["ramp", 0.9, 12.1]);
    await engine.destroy();
});

test("streamed scores crossfade and revive an interrupted deck", async () => {
    const mediaElements = [];
    const scoreManifest = [
        {
            id: "calm-test",
            label: "Calm",
            bus: "music",
            role: "music-calm",
            src: "/calm.opus",
            stream: true,
            reactive: true,
            fade: 7,
        },
        {
            id: "melancholic-test",
            label: "Melancholic",
            bus: "music",
            role: "music-melancholic",
            src: "/melancholic.opus",
            stream: true,
            reactive: true,
            fade: 7,
        },
    ];
    const engine = new SoundEngine({
        manifest: scoreManifest,
        AudioContextClass: FakeAudioContext,
        fetchFn: async () => {
            throw new Error("streamed scores must not use fetch/decode");
        },
        createMediaElement: () => {
            const media = new FakeMediaElement();
            mediaElements.push(media);
            return media;
        },
    });
    engine.updateWorldState({ moodId: "departure" });
    await engine.unlock();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(engine.layers.has("calm-test"), true);
    assert.equal(mediaElements[0].playCount, 1);
    const scheduledFadeEvents =
        engine.layers.get("calm-test").gain.gain.events.length;
    engine.updateWorldState({ moodId: "departure" });
    assert.equal(
        engine.layers.get("calm-test").gain.gain.events.length,
        scheduledFadeEvents,
    );

    engine.updateWorldState({ moodId: "blue-hour" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(engine.layers.get("calm-test").stopped, true);
    assert.equal(engine.layers.has("melancholic-test"), true);

    engine.updateWorldState({ moodId: "departure" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(engine.layers.get("calm-test").stopped, false);
    assert.equal(mediaElements[0].playCount, 2);
    assert.equal(engine.layers.get("melancholic-test").stopped, true);
    assert.equal(await engine.restartScore(), true);
    assert.equal(mediaElements[0].currentTime, 0);
    assert.equal(mediaElements[0].playCount, 3);
    await engine.destroy();
});

test("streamed scores honor authored loop windows without rewriting media", async () => {
    const media = new FakeMediaElement();
    const engine = new SoundEngine({
        manifest: [
            {
                id: "loop-test",
                bus: "music",
                role: "music-calm",
                src: "/loop.opus",
                loop: true,
                loopStart: 1.25,
                loopEnd: 8.5,
                stream: true,
                reactive: true,
            },
        ],
        AudioContextClass: FakeAudioContext,
        createMediaElement: () => media,
    });
    engine.updateWorldState({ moodId: "departure" });
    await engine.unlock();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(media.loop, false);

    media.currentTime = 8.6;
    media.ontimeupdate();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(media.currentTime, 1.25);
    assert.equal(media.playCount, 2);
    await engine.destroy();
});

test("rewinding the journey restarts the resolved score from its beginning", async () => {
    const media = new FakeMediaElement();
    const engine = new SoundEngine({
        manifest: [
            {
                id: "calm-test",
                label: "Calm",
                bus: "music",
                role: "music-calm",
                src: "/calm.opus",
                stream: true,
                reactive: true,
                fade: 2,
            },
        ],
        AudioContextClass: FakeAudioContext,
        createMediaElement: () => media,
    });
    engine.updateWorldState({ moodId: "departure", travelTime: 12 });
    await engine.unlock();
    await new Promise((resolve) => setImmediate(resolve));
    media.currentTime = 7;

    engine.updateWorldState({ moodId: "departure", travelTime: 0 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(media.currentTime, 0);
    assert.equal(media.playCount, 2);
    await engine.destroy();
});

test("score restart waits for a deck that is still starting", async () => {
    let releaseFirstPlay;
    const media = new FakeMediaElement();
    media.play = function () {
        this.playCount += 1;
        if (this.playCount === 1)
            return new Promise((resolve) => {
                releaseFirstPlay = resolve;
            });
        return Promise.resolve();
    };
    const engine = new SoundEngine({
        manifest: [
            {
                id: "calm-test",
                bus: "music",
                role: "music-calm",
                src: "/calm.opus",
                stream: true,
                reactive: true,
            },
        ],
        AudioContextClass: FakeAudioContext,
        createMediaElement: () => media,
    });
    engine.updateWorldState({ moodId: "departure" });
    await engine.unlock();
    await new Promise((resolve) => setImmediate(resolve));

    const restart = engine.restartScore();
    releaseFirstPlay();
    assert.equal(await restart, true);
    assert.equal(media.currentTime, 0);
    assert.equal(media.playCount, 2);
    await engine.destroy();
});
