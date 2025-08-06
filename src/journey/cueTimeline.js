export const JOURNEY_CUES = Object.freeze([
    Object.freeze({ id: "departure", moodId: "departure", narrationId: "narrative-1", duration: 34, dwellDuration: 0, travelScale: 0.9 }),
    Object.freeze({ id: "embers", moodId: "ember", narrationId: "narrative-2", duration: 30, dwellDuration: 0, travelScale: 1.08 }),
    Object.freeze({ id: "petals", moodId: "sakura", narrationId: "narrative-3", duration: 32, dwellDuration: 0, travelScale: 0.82 }),
    Object.freeze({ id: "weather-front", moodId: "monsoon", narrationId: "narrative-4", duration: 38, dwellDuration: 0, travelScale: 0.7 }),
    Object.freeze({ id: "blue-hour", moodId: "blue-hour", narrationId: "narrative-5", duration: 36, dwellDuration: 5, travelScale: 0.78 }),
    Object.freeze({ id: "night-rail", moodId: "night-rail", narrationId: "narrative-6", duration: 42, dwellDuration: 0, travelScale: 0.66 }),
]);

function normalizeCues(cues) {
    if (!Array.isArray(cues) || cues.length === 0)
        throw new Error("A journey timeline requires at least one cue.");
    return cues.map((cue, index) => ({
        id: String(cue.id || `cue-${index + 1}`),
        moodId: String(cue.moodId || "departure"),
        narrationId: String(cue.narrationId || ""),
        duration: Math.max(0.1, Number(cue.duration) || 1),
        dwellDuration: Math.max(0, Number(cue.dwellDuration) || 0),
        travelScale: Math.max(0, Number(cue.travelScale) || 1),
    }));
}

export class CueTimeline {
    constructor(cues = JOURNEY_CUES) {
        this.cues = normalizeCues(cues);
        this.enabled = false;
        this.elapsed = 0;
        this.index = 0;
        this.narrationDriven = false;
        this.narrationReleased = false;
    }

    get totalDuration() {
        return this.cues.reduce(
            (total, cue) => total + cue.duration + cue.dwellDuration,
            0,
        );
    }

    get current() {
        return this.cues[this.index];
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        return this.current;
    }

    setNarrationDriven(enabled) {
        this.narrationDriven = Boolean(enabled);
        if (!this.narrationDriven) this.narrationReleased = false;
        return this.narrationDriven;
    }

    reset() {
        this.elapsed = 0;
        this.index = 0;
        this.narrationReleased = false;
        return this.current;
    }

    seek(seconds) {
        const total = this.totalDuration;
        this.elapsed = ((Math.max(0, Number(seconds) || 0) % total) + total) % total;
        let cursor = this.elapsed;
        this.index = 0;
        while (
            this.index < this.cues.length - 1 &&
            cursor >= this.cueSpan(this.cues[this.index])
        ) {
            cursor -= this.cueSpan(this.cues[this.index]);
            this.index += 1;
        }
        return this.current;
    }

    cueSpan(cue = this.current) {
        return cue.duration + cue.dwellDuration;
    }

    cueStart(index = this.index) {
        let start = 0;
        for (let cursor = 0; cursor < index; cursor += 1)
            start += this.cueSpan(this.cues[cursor]);
        return start;
    }

    elapsedInCue() {
        let start = 0;
        for (let index = 0; index < this.index; index += 1)
            start += this.cueSpan(this.cues[index]);
        return Math.min(
            this.current.duration,
            Math.max(0, this.elapsed - start),
        );
    }

    isDwelling() {
        const start = this.cueStart();
        const elapsed = this.elapsed - start;
        return elapsed >= this.current.duration &&
            elapsed < this.cueSpan(this.current);
    }

    waitsForNarration() {
        return this.narrationDriven &&
            Boolean(this.current.narrationId) &&
            !this.narrationReleased &&
            !this.isDwelling();
    }

    completeNarration(narrationId = "") {
        if (!this.narrationDriven || this.isDwelling()) return false;
        if (narrationId && narrationId !== this.current.narrationId)
            return false;
        this.elapsed = this.cueStart() + this.current.duration;
        this.narrationReleased = true;
        return true;
    }

    releaseNarration(narrationId = "") {
        if (!this.narrationDriven || this.isDwelling()) return false;
        if (narrationId && narrationId !== this.current.narrationId)
            return false;
        this.narrationReleased = true;
        return true;
    }

    skipNarration(narrationId = "") {
        if (!this.narrationDriven || this.isDwelling()) return false;
        if (narrationId && narrationId !== this.current.narrationId)
            return false;

        const nextIndex = (this.index + 1) % this.cues.length;
        this.index = nextIndex;
        this.elapsed = this.cueStart(nextIndex);
        this.narrationReleased = false;
        return true;
    }

    advance(delta, { running = true, speed = 1 } = {}) {
        const previousIndex = this.index;
        if (this.enabled && running && !this.waitsForNarration()) {
            const safeDelta = Math.max(0, Number(delta) || 0);
            const safeSpeed = Math.max(0, Number(speed) || 0);
            const step = this.isDwelling()
                ? safeDelta
                : safeDelta * safeSpeed;
            this.seek(this.elapsed + step);
        }
        if (this.index !== previousIndex) this.narrationReleased = false;
        const dwelling = this.isDwelling();
        return {
            cue: this.current,
            changed: this.index !== previousIndex,
            dwelling,
            elapsed: this.elapsed,
            progress: this.current.duration <= 0 ? 1 : this.elapsedInCue() / this.current.duration,
        };
    }
}
