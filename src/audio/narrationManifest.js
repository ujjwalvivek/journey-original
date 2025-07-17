const opus = (src) => Object.freeze({
    src,
    type: "audio/ogg; codecs=opus",
});

export const NARRATION_ASSETS = Object.freeze([
    Object.freeze({
        id: "narrative-default",
        title: "The Journey",
        sources: Object.freeze([
            opus("/audio/voice/narrative-default.opus"),
        ]),
        gain: 1,
        fadeIn: 0.28,
        fadeOut: 0.5,
        pauseFade: 0.14,
        ducking: Object.freeze({
            environment: 0.68,
            train: 0.76,
            music: 0.3,
        }),
    }),
]);

const toFinite = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

const clamp = (value, minimum = 0, maximum = 1) =>
    Math.max(minimum, Math.min(maximum, toFinite(value, minimum)));

export function narrationOpus(src) {
    return opus(src);
}

export function normalizeNarrationManifest(entries = NARRATION_ASSETS) {
    if (!Array.isArray(entries))
        throw new TypeError("The narration manifest must be an array.");

    const ids = new Set();
    return entries.map((entry, index) => {
        const id = String(entry?.id || "").trim();
        if (!id)
            throw new Error(`Narration ${index + 1} requires an id.`);
        if (ids.has(id)) throw new Error(`Duplicate narration id: ${id}`);
        ids.add(id);

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
            throw new Error(`Narration ${id} requires at least one source.`);

        return Object.freeze({
            id,
            title: String(entry.title || id),
            sources: Object.freeze(sources),
            gain: clamp(entry.gain ?? 1, 0, 2),
            fadeIn: clamp(entry.fadeIn ?? 0.25, 0, 3),
            fadeOut: clamp(entry.fadeOut ?? 0.4, 0, 4),
            pauseFade: clamp(entry.pauseFade ?? 0.14, 0.04, 0.5),
            ducking: Object.freeze({
                environment: clamp(entry.ducking?.environment ?? 0.68),
                train: clamp(entry.ducking?.train ?? 0.76),
                music: clamp(entry.ducking?.music ?? 0.3),
            }),
        });
    });
}
