export const JOURNEY_CUES = Object.freeze([
    Object.freeze({ id: "departure", moodId: "departure", duration: 34, travelScale: 0.9 }),
    Object.freeze({ id: "embers", moodId: "ember", duration: 30, travelScale: 1.08 }),
    Object.freeze({ id: "petals", moodId: "sakura", duration: 32, travelScale: 0.82 }),
    Object.freeze({ id: "weather-front", moodId: "monsoon", duration: 38, travelScale: 0.7 }),
    Object.freeze({ id: "blue-hour", moodId: "blue-hour", duration: 36, travelScale: 0.78 }),
    Object.freeze({ id: "night-rail", moodId: "night-rail", duration: 42, travelScale: 0.66 }),
]);

function normalizeCues(cues) {
    if (!Array.isArray(cues) || cues.length === 0)
        throw new Error("A journey timeline requires at least one cue.");
    return cues.map((cue, index) => ({
        id: String(cue.id || `cue-${index + 1}`),
        moodId: String(cue.moodId || "departure"),
        duration: Math.max(0.1, Number(cue.duration) || 1),
        travelScale: Math.max(0, Number(cue.travelScale) || 1),
    }));
}

export class CueTimeline {
    constructor(cues = JOURNEY_CUES) {
        this.cues = normalizeCues(cues);
        this.enabled = false;
        this.elapsed = 0;
        this.index = 0;
    }

    get totalDuration() {
        return this.cues.reduce((total, cue) => total + cue.duration, 0);
    }

    get current() {
        return this.cues[this.index];
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        return this.current;
    }

    reset() {
        this.elapsed = 0;
        this.index = 0;
        return this.current;
    }

    seek(seconds) {
        const total = this.totalDuration;
        this.elapsed = ((Math.max(0, Number(seconds) || 0) % total) + total) % total;
        let cursor = this.elapsed;
        this.index = 0;
        while (
            this.index < this.cues.length - 1 &&
            cursor >= this.cues[this.index].duration
        ) {
            cursor -= this.cues[this.index].duration;
            this.index += 1;
        }
        return this.current;
    }

    advance(delta, { running = true, speed = 1 } = {}) {
        const previousIndex = this.index;
        if (this.enabled && running) {
            this.seek(this.elapsed + Math.max(0, Number(delta) || 0) * Math.max(0, Number(speed) || 0));
        }
        return {
            cue: this.current,
            changed: this.index !== previousIndex,
            elapsed: this.elapsed,
            progress: this.current.duration <= 0 ? 1 : this.elapsedInCue() / this.current.duration,
        };
    }

    elapsedInCue() {
        let start = 0;
        for (let index = 0; index < this.index; index += 1)
            start += this.cues[index].duration;
        return this.elapsed - start;
    }
}
