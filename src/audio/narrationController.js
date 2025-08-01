import {
    NARRATION_ASSETS,
    normalizeNarrationManifest,
} from "./narrationManifest.js";

export class NarrationController {
    constructor({ manifest = NARRATION_ASSETS, player } = {}) {
        if (!player) throw new TypeError("Narration requires an audio player.");
        this.manifest = normalizeNarrationManifest(manifest);
        this.assets = new Map(this.manifest.map((asset) => [asset.id, asset]));
        this.player = player;
        this.enabled = true;
        this.selectedId = this.manifest[0]?.id ?? "";
        this.travelRunning = true;
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        if (!this.enabled) this.player.stopNarration({ fade: 0.18 });
        return this.enabled;
    }

    async play(id = this.selectedId) {
        if (!this.enabled) return false;
        const asset = this.assets.get(String(id || ""));
        if (!asset) return false;
        this.selectedId = asset.id;
        await this.player.playNarration(asset);
        if (!this.travelRunning) this.player.pauseNarration();
        return true;
    }

    async replay() {
        const state = this.player.getNarrationState();
        if (!state.id) return this.play();
        await this.player.replayNarration();
        if (!this.travelRunning) this.player.pauseNarration();
        return true;
    }

    skip() {
        return this.player.stopNarration({ fade: 0.22, skipped: true });
    }

    async reset({ restart = false } = {}) {
        this.player.stopNarration({ fade: 0 });
        this.travelRunning = true;
        if (restart && this.enabled) return this.play();
        return false;
    }

    updateWorldState(snapshot = {}) {
        const running = snapshot.travelRunning !== false;
        if (running === this.travelRunning) return this.getState();
        this.travelRunning = running;
        const narration = this.player.getNarrationState();
        if (!running && narration.state === "playing")
            this.player.pauseNarration();
        else if (running && narration.state === "paused")
            this.player.resumeNarration();
        return this.getState();
    }

    getState() {
        return Object.freeze({
            enabled: this.enabled,
            available: this.manifest.length > 0,
            count: this.manifest.length,
            selectedId: this.selectedId,
            ...this.player.getNarrationState(),
        });
    }

    destroy() {
        this.player.stopNarration({ fade: 0 });
    }
}
