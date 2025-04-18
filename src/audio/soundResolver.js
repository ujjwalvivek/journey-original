const clamp = (value, minimum = 0, maximum = 1) => {
    const number = Number(value);
    return Math.max(
        minimum,
        Math.min(maximum, Number.isFinite(number) ? number : 0),
    );
};

const smoothstep = (minimum, maximum, value) => {
    const amount = clamp((value - minimum) / (maximum - minimum));
    return amount * amount * (3 - 2 * amount);
};

export function normalizeSoundWorldState(snapshot = {}) {
    const weather = snapshot.weather ?? {};
    return Object.freeze({
        sceneId: String(snapshot.moodId || snapshot.sceneId || "departure"),
        cueId: String(snapshot.cueId || "departure"),
        travelRunning: snapshot.travelRunning !== false,
        travelSpeed: clamp(snapshot.travelSpeed || 1, 0.1, 2.5),
        motionLevel: clamp(
            snapshot.motionLevel ?? (snapshot.travelRunning === false ? 0 : 1),
        ),
        precipitation: clamp(weather.precipitation),
        windSpeed: clamp(weather.windSpeed, 0, 2.5),
        windDirection: clamp(weather.windDirection, -1, 1),
        gust: clamp(snapshot.gust ?? weather.gust ?? weather.gustiness),
        mistDensity: clamp(weather.mistDensity),
        visibility: clamp(weather.visibility ?? 1),
        wetness: clamp(snapshot.surfaceWetness ?? weather.wetness),
    });
}

export function resolveSoundState(snapshot = {}, { presentationPaused = false } = {}) {
    const world = normalizeSoundWorldState(snapshot);
    const speedEnergy =
        Math.sqrt(clamp((world.travelSpeed - 0.1) / 2.4)) *
        world.motionLevel;
    const windEnergy = clamp(world.windSpeed / 2.5);
    const rainEnergy = world.precipitation;
    const obscurity = clamp(
        world.mistDensity * 0.55 + (1 - world.visibility) * 0.45,
    );

    const buses = {
        environment: presentationPaused ? 0.66 : 1,
        train: presentationPaused ? 0.12 : 1,
        music: presentationPaused ? 0.42 : 1,
        voice: presentationPaused ? 0 : 1,
    };

    return Object.freeze({
        world,
        buses: Object.freeze(buses),
        layers: Object.freeze({
            ambience: 1,
            "wind-soft": clamp(
                windEnergy *
                    (1 - smoothstep(0.45, 1, windEnergy) * 0.58) *
                    (0.78 + world.gust * 0.22),
            ),
            "wind-hard": clamp(
                windEnergy * smoothstep(0.28, 0.9, windEnergy) *
                    (0.7 + world.gust * 0.3),
            ),
            "rain-distant": clamp(rainEnergy * (1 - rainEnergy * 0.22)),
            "rain-heavy": smoothstep(0.3, 0.82, rainEnergy),
            "rain-metal-light": clamp(
                rainEnergy * (1 - smoothstep(0.58, 0.96, rainEnergy) * 0.7),
            ),
            "rain-metal-heavy": smoothstep(0.5, 0.95, rainEnergy),
            engine: 0.55 + speedEnergy * 0.45,
            rail: speedEnergy,
            "train-transition": 1,
            music: 1,
            voice: 1,
        }),
        playbackRates: Object.freeze({
            engine: 0.9 + speedEnergy * 0.16,
            rail: 0.82 + speedEnergy * 0.3,
        }),
        filters: Object.freeze({
            distantCutoff: 18000 - obscurity * 12000,
        }),
    });
}
