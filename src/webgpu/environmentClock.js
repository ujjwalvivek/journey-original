export class EnvironmentClock {
    constructor() {
        this.travelTime = 0;
        this.windPhase = 0;
        this.foregroundPhase = 0;
        this.smokeLevel = 0;
        this.smokeAge = 0;
        this.motionLevel = 0;
        this.motionInitialized = false;
    }

    advance(
        delta,
        {
            travelRunning = true,
            travelSpeed = 1,
            windSpeed = 1,
            windDirection = 1,
            gust = 0,
        } = {},
    ) {
        const safeDelta = Math.max(0, Math.min(0.1, Number(delta) || 0));
        const safeWindDirection = Math.max(
            -1,
            Math.min(1, Number(windDirection) || 0),
        );
        const safeGust = Math.max(0, Math.min(1, Number(gust) || 0));
        const motionTarget = travelRunning ? 1 : 0;
        if (!this.motionInitialized) {
            // Preserve the authored initial state. Only subsequent transport
            // changes receive acceleration and coasting envelopes.
            this.motionLevel = motionTarget;
            this.motionInitialized = true;
        } else {
            const response = travelRunning ? 1.8 : 1.35;
            const blend = 1 - Math.exp(-response * safeDelta);
            this.motionLevel += (motionTarget - this.motionLevel) * blend;
            if (Math.abs(this.motionLevel - motionTarget) < 0.001)
                this.motionLevel = motionTarget;
        }
        const windRate = Math.max(0, Number(windSpeed) || 0)
            * safeWindDirection
            * (1 + safeGust * 0.65);
        const effectiveTravelSpeed =
            Math.max(0, travelSpeed) * this.motionLevel;
        this.travelTime += safeDelta * effectiveTravelSpeed;
        this.foregroundPhase += safeDelta * effectiveTravelSpeed * 4;
        // Wind remains additive to foreground parallax while travelling and
        // becomes its only motion while holding. Accumulating the signed rate
        // prevents a direction change from scrubbing the cloud field.
        this.foregroundPhase += safeDelta * windRate * 0.06;
        this.windPhase += safeDelta * windRate;
        // Throttle builds with physical acceleration rather than jumping to
        // full smoke on the start command. Squaring the motion envelope keeps
        // the first puffs restrained; stopping still begins the authored fade
        // immediately even while the train finishes coasting.
        const smokeTarget = travelRunning
            ? this.motionLevel * this.motionLevel
            : 0;
        const smokeRate = travelRunning ? 0.7 : 0.42;
        const smokeStep = safeDelta * smokeRate;
        if (this.smokeLevel < smokeTarget) {
            this.smokeLevel = Math.min(smokeTarget, this.smokeLevel + smokeStep);
        } else {
            this.smokeLevel = Math.max(smokeTarget, this.smokeLevel - smokeStep);
        }
        // A fresh plume must grow away from the chimney instead of revealing
        // an already mature procedural field across the sky. Keep its age
        // while stopping so the remaining smoke fades in place; reset only
        // after the plume has fully disappeared.
        if (travelRunning) {
            this.smokeAge = Math.min(1, this.smokeAge + safeDelta * 0.5);
        } else if (this.smokeLevel <= 0.001) {
            this.smokeAge = 0;
        }
        return safeDelta;
    }

    reset({ travelRunning } = {}) {
        this.travelTime = 0;
        this.windPhase = 0;
        this.foregroundPhase = 0;
        this.smokeLevel = 0;
        this.smokeAge = 0;
        this.motionLevel = typeof travelRunning === "boolean"
            ? travelRunning
                ? 1
                : 0
            : 0;
        this.motionInitialized = typeof travelRunning === "boolean";
    }

}
