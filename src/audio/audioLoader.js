export function selectPlayableSource(sources, canPlayType = null) {
    if (!Array.isArray(sources) || sources.length === 0) return null;
    if (typeof canPlayType !== "function") return sources[0];
    return (
        sources.find(
            ({ type }) => !type || canPlayType(type) === "probably",
        ) ??
        sources.find(({ type }) => !type || canPlayType(type) === "maybe") ??
        sources[0]
    );
}

export class AudioAssetLoader {
    constructor(context, { fetchFn = globalThis.fetch, canPlayType = null } = {}) {
        if (!context) throw new Error("AudioAssetLoader requires an AudioContext.");
        if (typeof fetchFn !== "function")
            throw new Error("AudioAssetLoader requires fetch support.");
        this.context = context;
        this.fetchFn = fetchFn;
        this.canPlayType = canPlayType;
        this.cache = new Map();
    }

    load(asset) {
        if (this.cache.has(asset.id)) return this.cache.get(asset.id);
        const promise = this.fetchAndDecode(asset).catch((error) => {
            this.cache.delete(asset.id);
            throw error;
        });
        this.cache.set(asset.id, promise);
        return promise;
    }

    async fetchAndDecode(asset) {
        const source = selectPlayableSource(asset.sources, this.canPlayType);
        if (!source) throw new Error(`No source is available for ${asset.id}.`);
        // Some browser implementations still validate the native fetch
        // receiver. Calling it as `this.fetchFn()` binds AudioAssetLoader as
        // `this`, which fails there even though ordinary arrow-function test
        // doubles tolerate it.
        const response = await this.fetchFn.call(globalThis, source.src);
        if (!response.ok)
            throw new Error(
                `Could not load ${asset.id} (${response.status} ${response.statusText}).`,
            );
        const bytes = await response.arrayBuffer();
        return this.context.decodeAudioData(bytes.slice(0));
    }

    clear() {
        this.cache.clear();
    }
}
