export const SHOWCASE_SEQUENCE = Object.freeze([
    Object.freeze({ id: "departure", duration: 12 }),
    Object.freeze({ id: "monsoon", duration: 30 }),
    Object.freeze({ id: "sakura", duration: 18 }),
    Object.freeze({ id: "departure", duration: 12 }),
]);

export const SHOWCASE_DURATION = SHOWCASE_SEQUENCE.reduce(
    (total, scene) => total + scene.duration,
    0,
);

function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
}

function abortError() {
    return new DOMException("Showcase recording cancelled.", "AbortError");
}

export async function runShowcaseSequence({
    sequence = SHOWCASE_SEQUENCE,
    applyScene,
    onProgress = () => {},
    signal,
    now = () => performance.now(),
    wait = nextFrame,
} = {}) {
    if (typeof applyScene !== "function")
        throw new TypeError("A showcase sequence requires applyScene().");

    const totalDuration = sequence.reduce(
        (total, scene) => total + Math.max(0, Number(scene.duration) || 0),
        0,
    );
    let elapsedBeforeScene = 0;

    for (let index = 0; index < sequence.length; index += 1) {
        if (signal?.aborted) throw abortError();
        const scene = sequence[index];
        const duration = Math.max(0, Number(scene.duration) || 0);
        applyScene(scene, index);
        const startedAt = now();

        while (true) {
            if (signal?.aborted) throw abortError();
            const sceneElapsed = Math.min(duration, (now() - startedAt) / 1000);
            const elapsed = Math.min(
                totalDuration,
                elapsedBeforeScene + sceneElapsed,
            );
            onProgress({
                scene,
                index,
                sceneElapsed,
                elapsed,
                duration: totalDuration,
                progress: totalDuration > 0 ? elapsed / totalDuration : 1,
            });
            if (sceneElapsed >= duration) break;
            await wait();
        }
        elapsedBeforeScene += duration;
    }

    return totalDuration;
}
