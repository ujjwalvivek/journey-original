import { resolveSoundSceneProfile } from "./soundProfiles.js";

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
    const selectedWeatherId = String(snapshot.weatherId || weather.id || "scene");
    const effectiveWeatherId =
        selectedWeatherId === "scene"
            ? String(snapshot.authoredWeatherId || "clear")
            : selectedWeatherId;
    return Object.freeze({
        sceneId: String(snapshot.moodId || snapshot.sceneId || "departure"),
        cueId: String(snapshot.cueId || "departure"),
        journeyTime: Math.max(0, Number(snapshot.travelTime) || 0),
        weatherId: effectiveWeatherId,
        travelRunning:
            snapshot.effectiveTravelRunning ??
            (snapshot.travelRunning !== false && snapshot.dwellActive !== true),
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

export function resolveSoundState(
    snapshot = {},
    { presentationPaused = false, musicLevel = 1 } = {},
) {
    const world = normalizeSoundWorldState(snapshot);
    const speedEnergy =
        Math.sqrt(clamp((world.travelSpeed - 0.1) / 2.4)) *
        world.motionLevel;
    const windEnergy = clamp(world.windSpeed / 2.5);
    const rainEnergy = world.precipitation;
    const obscurity = clamp(
        world.mistDensity * 0.55 + (1 - world.visibility) * 0.45,
    );
    const { ambience: scene, score } = resolveSoundSceneProfile(world.sceneId);
    const dryAir = 1 - rainEnergy;
    const musicWeatherGain = 1 - rainEnergy * 0.08;
    const scorePresence =
        Math.max(score.calm, score.melancholic, score.ominous) *
        musicWeatherGain;
    const audibleScorePresence = scorePresence * clamp(musicLevel);
    const windPan = clamp(world.windDirection * windEnergy * 0.34, -0.34, 0.34);

    const buses = {
        environment: presentationPaused
            ? 0.66
            : 1 - audibleScorePresence * 0.16,
        train: presentationPaused ? 0.12 : 1 - audibleScorePresence * 0.08,
        music: presentationPaused ? 0.42 : 1,
        voice: presentationPaused ? 0 : 1,
    };

    return Object.freeze({
        world,
        buses: Object.freeze(buses),
        layers: Object.freeze({
            ambience: 1,
            "ambience-birds": clamp(
                scene.birds *
                    dryAir *
                    (0.72 + world.visibility * 0.28) *
                    (1 - audibleScorePresence * 0.18),
            ),
            "ambience-melodic": clamp(
                scene.melodic *
                    (1 - rainEnergy * 0.58) *
                    (1 - audibleScorePresence * 0.62),
            ),
            "ambience-ominous": clamp(
                (scene.ominous + rainEnergy * 0.42 + obscurity * 0.18) *
                    (1 - audibleScorePresence * 0.52),
            ),
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
            "weather-transition": 1,
            "music-calm": score.calm * musicWeatherGain,
            "music-melancholic": score.melancholic * musicWeatherGain,
            "music-ominous": score.ominous * musicWeatherGain,
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
        pans: Object.freeze({
            "ambience-birds": windPan * 0.28,
            "ambience-melodic": 0,
            "ambience-ominous": windPan * 0.12,
            "wind-soft": windPan,
            "wind-hard": windPan,
            "rain-distant": windPan * 0.22,
            "rain-heavy": windPan * 0.12,
        }),
    });
}
