import assert from "node:assert/strict";
import test from "node:test";

import { MOODS } from "../src/webgpu/moodEngine.js";
import {
    resolveSoundSceneProfile,
    SOUND_SCENE_PROFILES,
} from "../src/audio/soundProfiles.js";

test("every authored scene owns an explicit sound profile", () => {
    assert.deepEqual(
        Object.keys(SOUND_SCENE_PROFILES).sort(),
        MOODS.map(({ id }) => id).sort(),
    );
    for (const profile of Object.values(SOUND_SCENE_PROFILES)) {
        assert.equal(Object.values(profile.score).filter((value) => value > 0).length, 1);
    }
});

test("unknown scenes resolve to the departure sound profile", () => {
    assert.equal(
        resolveSoundSceneProfile("unknown"),
        SOUND_SCENE_PROFILES.departure,
    );
});
