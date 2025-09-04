export const AUDIO_BUS_IDS = Object.freeze([
    "environment",
    "train",
    "music",
    "voice",
]);

export const AUDIO_LAYER_ROLES = Object.freeze([
    "ambience",
    "ambience-birds",
    "ambience-melodic",
    "ambience-ominous",
    "wind-soft",
    "wind-hard",
    "rain-distant",
    "rain-heavy",
    "rain-metal-light",
    "rain-metal-heavy",
    "engine",
    "rail",
    "train-transition",
    "weather-transition",
    "thunder",
    "interface",
    "music-calm",
    "music-melancholic",
    "music-ominous",
    "music",
    "voice",
]);

const opus = (src) => Object.freeze({ src, type: "audio/ogg; codecs=opus" });

export const AUDIO_ASSETS = Object.freeze([
    Object.freeze({
        id: "ambience-birds",
        bus: "environment",
        role: "ambience-birds",
        sources: Object.freeze([
            opus("/audio/ambience/birds-nature-ambience.opus"),
        ]),
        loop: true,
        gain: 0.28,
        fade: 2.4,
        reactive: true,
    }),
    Object.freeze({
        id: "ambience-melodic",
        bus: "environment",
        role: "ambience-melodic",
        sources: Object.freeze([
            opus("/audio/ambience/melodious-ambience.opus"),
        ]),
        loop: true,
        gain: 0.42,
        fade: 2.8,
        reactive: true,
    }),
    Object.freeze({
        id: "ambience-ominous",
        bus: "environment",
        role: "ambience-ominous",
        sources: Object.freeze([
            opus("/audio/ambience/valley-ominous-sound-loop.opus"),
        ]),
        loop: true,
        gain: 0.4,
        fade: 3.2,
        reactive: true,
    }),
    Object.freeze({
        id: "score-calm-before-storm",
        label: "Calm Before Storm",
        bus: "music",
        role: "music-calm",
        sources: Object.freeze([
            opus("/audio/music/calm-before-storm-musical-score.opus"),
        ]),
        loop: true,
        loopEnd: 110.8,
        stream: true,
        gain: 0.9,
        fade: 7,
        reactive: true,
    }),
    Object.freeze({
        id: "score-melancholic",
        label: "Melancholic",
        bus: "music",
        role: "music-melancholic",
        sources: Object.freeze([
            opus("/audio/music/melancholic-musical-score.opus"),
        ]),
        loop: true,
        loopEnd: 139.45,
        stream: true,
        gain: 1.15,
        fade: 7,
        reactive: true,
    }),
    Object.freeze({
        id: "score-ominous-guitar",
        label: "Ominous Guitar",
        bus: "music",
        role: "music-ominous",
        sources: Object.freeze([
            opus("/audio/music/ominous-guitar-loop.opus"),
        ]),
        loop: true,
        stream: true,
        gain: 0.98,
        fade: 6,
        reactive: true,
    }),
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
        gain: 0.65,
        cooldown: 0.8,
        trigger: "train-start",
        triggerGroup: "transport",
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
        gain: 0.68,
        cooldown: 0.8,
        trigger: "train-stop",
        triggerGroup: "transport",
        preload: true,
    }),
    Object.freeze({
        id: "capture-shutter",
        label: "Camera Shutter",
        bus: "environment",
        role: "interface",
        sources: Object.freeze([opus("/audio/interface/shutter-click.opus")]),
        loop: false,
        gain: 0.72,
        cooldown: 0.2,
        trigger: "capture-shutter",
        triggerGroup: "interface",
        preload: true,
    }),
    Object.freeze({
        id: "capture-record",
        label: "Recording Start",
        bus: "environment",
        role: "interface",
        sources: Object.freeze([opus("/audio/interface/record-click.opus")]),
        loop: false,
        gain: 1.35,
        durationHint: 0.329,
        cooldown: 0.2,
        trigger: "capture-record",
        triggerGroup: "interface",
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
    Object.freeze({
        id: "distant-thunder",
        label: "Distant Thunder",
        bus: "environment",
        role: "thunder",
        sources: Object.freeze([
            opus("/audio/weather/loud-thunder-one-shot.opus"),
        ]),
        loop: false,
        gain: 0.48,
        durationHint: 4.12,
        fadeIn: 0.04,
        fadeOut: 0.7,
        cooldown: 8,
        trigger: "weather-thunder",
        triggerGroup: "atmosphere-event",
        preload: true,
    }),
    Object.freeze({
        id: "rain-front-arrival",
        bus: "music",
        role: "weather-transition",
        sources: Object.freeze([
            opus("/audio/weather/night-heavy-rain-transition-one-shot.opus"),
        ]),
        loop: false,
        gain: 0.75,
        durationHint: 27.9665,
        fadeIn: 0.45,
        fadeOut: 5,
        duckAmbience: 0.32,
        musicEntryFraction: 0.5,
        musicEntryFade: 3,
        cooldown: 10,
        trigger: "weather-monsoon",
        triggerGroup: "weather",
        preload: true,
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
            label: String(entry.label || id),
            bus,
            role,
            sources: Object.freeze(sources),
            loop: entry.loop !== false,
            stream: Boolean(entry.stream),
            loopStart,
            loopEnd,
            gain: Math.max(0, Math.min(2, toFinite(entry.gain, 1))),
            fade: Math.max(0.02, Math.min(10, toFinite(entry.fade, 0.35))),
            durationHint: Math.max(0, toFinite(entry.durationHint, 0)),
            fadeIn: Math.max(0, Math.min(10, toFinite(entry.fadeIn, 0))),
            fadeOut: Math.max(0, Math.min(15, toFinite(entry.fadeOut, 0))),
            duckAmbience: Math.max(
                0,
                Math.min(1, toFinite(entry.duckAmbience, 1)),
            ),
            duckMusic: Math.max(
                0,
                Math.min(1, toFinite(entry.duckMusic, 1)),
            ),
            musicEntryFraction: Math.max(
                0,
                Math.min(1, toFinite(entry.musicEntryFraction, 0)),
            ),
            musicEntryFade: Math.max(0, toFinite(entry.musicEntryFade, 0)),
            cooldown: Math.max(0, toFinite(entry.cooldown, 0)),
            autoplay: Boolean(entry.autoplay),
            reactive: Boolean(entry.reactive),
            preload: Boolean(entry.preload),
            trigger: entry.trigger ? String(entry.trigger) : "",
            triggerGroup: entry.triggerGroup
                ? String(entry.triggerGroup)
                : "default",
        });
    });
}
