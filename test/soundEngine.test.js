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
    resolveCueAmbienceGain,
    SoundEngine,
} from "../src/audio/soundEngine.js";

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
});

test("production audio manifest points to deployed source files", () => {
    const normalized = normalizeAudioManifest(AUDIO_ASSETS);
    assert.equal(normalized.length, 14);
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
