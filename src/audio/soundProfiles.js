const profile = (ambience, score) =>
    Object.freeze({
        ambience: Object.freeze(ambience),
        score: Object.freeze(score),
    });

export const SOUND_SCENE_PROFILES = Object.freeze({
    departure: profile(
        { birds: 0.22, melodic: 0.62, ominous: 0.02 },
        { calm: 1, melancholic: 0, ominous: 0 },
    ),
    ember: profile(
        { birds: 0.04, melodic: 0.38, ominous: 0.2 },
        { calm: 0, melancholic: 0, ominous: 1 },
    ),
    "blue-hour": profile(
        { birds: 0.08, melodic: 0.56, ominous: 0.18 },
        { calm: 0, melancholic: 1, ominous: 0 },
    ),
    sakura: profile(
        { birds: 0.82, melodic: 0.38, ominous: 0 },
        { calm: 0.72, melancholic: 0, ominous: 0 },
    ),
    monsoon: profile(
        { birds: 0, melodic: 0.08, ominous: 0.78 },
        { calm: 0, melancholic: 0, ominous: 0.9 },
    ),
    "night-rail": profile(
        { birds: 0, melodic: 0.16, ominous: 0.72 },
        { calm: 0, melancholic: 1, ominous: 0 },
    ),
});

export function resolveSoundSceneProfile(sceneId) {
    return SOUND_SCENE_PROFILES[sceneId] ?? SOUND_SCENE_PROFILES.departure;
}
