export const AUDIO_BUS_IDS = Object.freeze([
    "environment",
    "train",
    "music",
    "voice",
]);

export const AUDIO_LAYER_ROLES = Object.freeze([
    "ambience",
    "wind-soft",
    "wind-hard",
    "rain-distant",
    "rain-heavy",
    "rain-metal-light",
    "rain-metal-heavy",
    "engine",
    "rail",
    "train-transition",
    "music",
    "voice",
]);

const opus = (src) => Object.freeze({ src, type: "audio/ogg; codecs=opus" });

export const AUDIO_ASSETS = Object.freeze([
    Object.freeze({
        id: "train-idle",
        bus: "train",
        role: "engine",
        sources: Object.freeze([opus("/audio/train/train-idle-loop.opus")]),
        loop: true,
        gain: 0.38,
        autoplay: true,
    }),
    Object.freeze({
        id: "train-motion-bridge",
        bus: "train",
        role: "rail",
        sources: Object.freeze([
            opus("/audio/train/train-motion-on-bridge-loop.opus"),
        ]),
        loop: true,
        gain: 0.3,
        autoplay: true,
    }),
    Object.freeze({
        id: "train-departure",
        bus: "train",
        role: "train-transition",
        sources: Object.freeze([
            opus("/audio/train/train-departure-one-shot.opus"),
        ]),
        loop: false,
        gain: 0.46,
        trigger: "train-start",
        preload: true,
    }),
    Object.freeze({
        id: "train-halt",
        bus: "train",
        role: "train-transition",
        sources: Object.freeze([
            opus("/audio/train/train-halt-one-shot.opus"),
        ]),
        loop: false,
        gain: 0.5,
        trigger: "train-stop",
        preload: true,
    }),
    Object.freeze({
        id: "wind-soft",
        bus: "environment",
        role: "wind-soft",
        sources: Object.freeze([
            opus("/audio/weather/smooth-wind-blowing.opus"),
        ]),
        loop: true,
        gain: 0.38,
        reactive: true,
    }),
    Object.freeze({
        id: "wind-hard",
        bus: "environment",
        role: "wind-hard",
        sources: Object.freeze([
            opus("/audio/weather/hard-wind-blowing.opus"),
        ]),
        loop: true,
        gain: 0.34,
        reactive: true,
    }),
    Object.freeze({
        id: "rain-distant",
        bus: "environment",
        role: "rain-distant",
        sources: Object.freeze([
            opus("/audio/weather/distant-rain-loop.opus"),
        ]),
        loop: true,
        gain: 1,
        reactive: true,
    }),
    Object.freeze({
        id: "rain-heavy",
        bus: "environment",
        role: "rain-heavy",
        sources: Object.freeze([
            opus("/audio/weather/heavy-rain-loop.opus"),
        ]),
        loop: true,
        gain: 0.42,
        reactive: true,
    }),
    Object.freeze({
        id: "rain-metal-light",
        bus: "environment",
        role: "rain-metal-light",
        sources: Object.freeze([
            opus("/audio/weather/light-rain-on-metal-loop.opus"),
        ]),
        loop: true,
        gain: 0.3,
        reactive: true,
    }),
    Object.freeze({
        id: "rain-metal-heavy",
        bus: "environment",
        role: "rain-metal-heavy",
        sources: Object.freeze([
            opus("/audio/weather/heavy-rain-on-metal-loop.opus"),
        ]),
        loop: true,
        gain: 0.22,
        reactive: true,
    }),
]);

const toFinite = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

export function normalizeAudioManifest(entries = AUDIO_ASSETS) {
    if (!Array.isArray(entries))
        throw new TypeError("The audio manifest must be an array.");

    const ids = new Set();
    return entries.map((entry, index) => {
        const id = String(entry?.id || "").trim();
        if (!id) throw new Error(`Audio asset ${index + 1} requires an id.`);
        if (ids.has(id)) throw new Error(`Duplicate audio asset id: ${id}`);
        ids.add(id);

        const bus = String(entry.bus || "environment");
        if (!AUDIO_BUS_IDS.includes(bus))
            throw new Error(`Unknown audio bus for ${id}: ${bus}`);

        const role = String(entry.role || "ambience");
        if (!AUDIO_LAYER_ROLES.includes(role))
            throw new Error(`Unknown audio role for ${id}: ${role}`);

        const sources = (Array.isArray(entry.sources)
            ? entry.sources
            : entry.src
              ? [{ src: entry.src, type: entry.type }]
              : []
        ).map((source) =>
            typeof source === "string"
                ? Object.freeze({ src: source, type: "" })
                : Object.freeze({
                      src: String(source?.src || ""),
                      type: String(source?.type || ""),
                  }),
        );
        if (sources.length === 0 || sources.some(({ src }) => !src))
            throw new Error(`Audio asset ${id} requires at least one source.`);

        const loopStart = Math.max(0, toFinite(entry.loopStart, 0));
        const loopEnd = Math.max(0, toFinite(entry.loopEnd, 0));
        if (loopEnd > 0 && loopEnd <= loopStart)
            throw new Error(`Audio asset ${id} has an invalid loop range.`);

        return Object.freeze({
            id,
            bus,
            role,
            sources: Object.freeze(sources),
            loop: entry.loop !== false,
            loopStart,
            loopEnd,
            gain: Math.max(0, Math.min(2, toFinite(entry.gain, 1))),
            autoplay: Boolean(entry.autoplay),
            reactive: Boolean(entry.reactive),
            preload: Boolean(entry.preload),
            trigger: entry.trigger ? String(entry.trigger) : "",
        });
    });
}
