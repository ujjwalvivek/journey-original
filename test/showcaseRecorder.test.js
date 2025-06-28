import assert from "node:assert/strict";
import test from "node:test";

import {
    selectShowcaseMimeType,
    ShowcaseRecorder,
} from "../src/showcase/showcaseRecorder.js";

class FakeMediaRecorder {
    static isTypeSupported(type) {
        return type.includes("vp8");
    }

    constructor(stream, options) {
        this.stream = stream;
        this.mimeType = options.mimeType;
        this.state = "inactive";
    }

    start(interval) {
        this.interval = interval;
        this.state = "recording";
    }

    stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["frame"]) });
        this.onstop?.();
    }
}

class FakeMediaStream {
    constructor(tracks) {
        this.tracks = tracks;
    }

    getVideoTracks() {
        return this.tracks.filter(({ kind }) => kind === "video");
    }

    getAudioTracks() {
        return this.tracks.filter(({ kind }) => kind === "audio");
    }

    getTracks() {
        return this.tracks;
    }
}

test("showcase recording selects the best supported WebM codec", () => {
    assert.equal(
        selectShowcaseMimeType(FakeMediaRecorder),
        "video/webm;codecs=vp8,opus",
    );
});

test("showcase recording prefers requested VP9 when both codecs exist", () => {
    class FullySupportedRecorder extends FakeMediaRecorder {
        static isTypeSupported() {
            return true;
        }
    }
    assert.equal(
        selectShowcaseMimeType(FullySupportedRecorder),
        "video/webm;codecs=vp9,opus",
    );
});

test("showcase recording accepts VP9 when the browser omits an Opus codec declaration", () => {
    class VideoOnlyCodecRecorder extends FakeMediaRecorder {
        static isTypeSupported(type) {
            return type === "video/webm;codecs=vp9";
        }
    }
    assert.equal(
        selectShowcaseMimeType(VideoOnlyCodecRecorder),
        "video/webm;codecs=vp9",
    );
});

test("showcase recording prefers audio-capable VP8 over video-only VP9", () => {
    class ChromeLikeRecorder extends FakeMediaRecorder {
        static isTypeSupported(type) {
            return (
                type === "video/webm;codecs=vp9" ||
                type === "video/webm;codecs=vp8,opus"
            );
        }
    }
    assert.equal(
        selectShowcaseMimeType(ChromeLikeRecorder),
        "video/webm;codecs=vp8,opus",
    );
});

test("showcase recording combines WebGPU video with final-mix audio", async () => {
    const videoTrack = { kind: "video", stopped: false, stop() { this.stopped = true; } };
    const audioTrack = { kind: "audio" };
    const recordingCanvas = {
        width: 1920,
        height: 1080,
        captureStream(frameRate) {
            assert.equal(frameRate, 30);
            return new FakeMediaStream([videoTrack]);
        },
    };
    const recorder = new ShowcaseRecorder(recordingCanvas, {
        audioStream: new FakeMediaStream([audioTrack]),
        MediaRecorderClass: FakeMediaRecorder,
        MediaStreamClass: FakeMediaStream,
    });

    recorder.start();
    const blob = await recorder.stop();
    assert.equal(recorder.stream.getVideoTracks()[0], videoTrack);
    assert.equal(recorder.stream.getAudioTracks()[0], audioTrack);
    assert.equal(blob.size > 0, true);
    assert.equal(videoTrack.stopped, true);
});
