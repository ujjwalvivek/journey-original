const MIME_CANDIDATES = Object.freeze([
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
]);

export const SHOWCASE_VIDEO = Object.freeze({
    frameRate: 30,
    videoBitsPerSecond: 24_000_000,
});

export function selectShowcaseMimeType(MediaRecorderClass = globalThis.MediaRecorder) {
    if (!MediaRecorderClass)
        throw new Error("MediaRecorder is unavailable in this browser.");
    return (
        MIME_CANDIDATES.find((type) =>
            MediaRecorderClass.isTypeSupported?.(type),
        ) ?? ""
    );
}

export class ShowcaseRecorder {
    constructor(
        canvas,
        {
            audioStream = null,
            frameRate = SHOWCASE_VIDEO.frameRate,
            videoBitsPerSecond = SHOWCASE_VIDEO.videoBitsPerSecond,
            audioBitsPerSecond = 256_000,
            MediaRecorderClass = globalThis.MediaRecorder,
            MediaStreamClass = globalThis.MediaStream,
        } = {},
    ) {
        if (!canvas?.captureStream)
            throw new Error("A WebGPU canvas is required for recording.");
        if (!MediaStreamClass)
            throw new Error("Media streams are unavailable in this browser.");

        this.canvas = canvas;
        this.MediaRecorderClass = MediaRecorderClass;
        this.mimeType = selectShowcaseMimeType(MediaRecorderClass);
        this.videoStream = canvas.captureStream(frameRate);
        this.stream = new MediaStreamClass([
            ...this.videoStream.getVideoTracks(),
            ...(audioStream?.getAudioTracks?.() ?? []),
        ]);
        this.chunks = [];
        this.stopped = false;
        this.discarded = false;
        this.started = false;
        this.result = new Promise((resolve, reject) => {
            this.resolveResult = resolve;
            this.rejectResult = reject;
        });

        const options = {
            videoBitsPerSecond,
            audioBitsPerSecond,
        };
        if (this.mimeType) options.mimeType = this.mimeType;
        this.recorder = new MediaRecorderClass(this.stream, options);
        this.recorder.ondataavailable = ({ data }) => {
            if (!this.discarded && data?.size > 0) this.chunks.push(data);
        };
        this.recorder.onerror = ({ error }) => {
            this.finishTracks();
            this.rejectResult(error ?? new Error("Showcase recording failed."));
        };
        this.recorder.onstop = () => {
            this.finishTracks();
            this.resolveResult(
                new Blob(this.chunks, {
                    type: this.recorder.mimeType || this.mimeType || "video/webm",
                }),
            );
        };
    }

    start() {
        this.recorder.start(1000);
        this.started = true;
    }

    async stop() {
        if (!this.started) {
            this.stopped = true;
            this.finishTracks();
            this.resolveResult(new Blob([], { type: this.mimeType || "video/webm" }));
            return this.result;
        }
        if (!this.stopped && this.recorder.state !== "inactive") {
            this.stopped = true;
            this.recorder.stop();
        }
        return this.result;
    }

    cancel() {
        this.discarded = true;
        this.chunks = [];
        return this.stop();
    }

    finishTracks() {
        for (const track of this.videoStream.getTracks()) track.stop();
    }
}
