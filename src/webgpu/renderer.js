import fullscreenSource from "../shaders/fullscreen.wgsl?raw";
import bufferASource from "../shaders/bufferA.wgsl?raw";
import imageSource from "../shaders/image.wgsl?raw";
import { loadExactNoiseTexture } from "./textures.js";
import { MoodEngine } from "./moodEngine.js";
import { fitRenderSize } from "./renderBudget.js";
import { EnvironmentClock } from "./environmentClock.js";
import { CueTimeline } from "../journey/cueTimeline.js";

const BUFFER_FORMAT = "rgba16float";
const UNIFORM_FLOATS = 80;
const UNIFORM_BYTES = UNIFORM_FLOATS * 4;

export class JourneyRenderer {
    constructor(canvas, { onFatalError = () => {} } = {}) {
        this.canvas = canvas;
        this.onFatalError = onFatalError;
        this.destroyed = false;
        this.context = null;
        this.adapter = null;
        this.device = null;
        this.format = null;

        this.uniformBuffer = null;
        this.uniformData = new Float32Array(UNIFORM_FLOATS);

        this.noiseTexture = null;
        this.feedbackTextures = [];
        this.feedbackBindGroups = [];
        this.imageBindGroups = [];
        this.readIndex = 0;

        this.bufferPipeline = null;
        this.imagePipeline = null;
        this.noiseSampler = null;
        this.feedbackSampler = null;
        this.sourceSampler = null;

        this.moodEngine = new MoodEngine();
        this.clock = new EnvironmentClock();
        this.cueTimeline = new CueTimeline();
        this.resolvedMood = this.moodEngine.update(performance.now() / 1000);
        this.travelRunning = true;
        this.travelSpeed = 1;
        this.feedbackAmount = 0.3;
        this.vignetteStrength = 1;

        this.frameHandle = 0;
        this.running = false;
        this.lastFrameAt = 0;
        this.fps = 0;
        this.fpsAccumulator = 0;
        this.fpsFrames = 0;
        this.fpsWindowStart = 0;
        this.renderBudgetScale = 1;
        this.sceneAge = 0;

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.render = this.render.bind(this);
    }

    async init() {
        this.adapter = await navigator.gpu.requestAdapter({
            powerPreference: "high-performance",
        });
        if (!this.adapter)
            throw new Error("No compatible WebGPU adapter was found.");

        this.device = await this.adapter.requestDevice();
        this.device.lost.then((info) => {
            if (this.destroyed) return;
            const error = new Error(
                `WebGPU device lost (${info.reason || "unknown"}): ${info.message || "no details"}`,
            );
            console.error(error);
            this.stopRenderer();
            this.onFatalError(error);
        });
        this.device.addEventListener("uncapturederror", (event) => {
            if (this.destroyed) return;
            console.error("Uncaptured WebGPU error:", event.error);
            this.stopRenderer();
            this.onFatalError(event.error);
        });

        this.context = this.canvas.getContext("webgpu");
        if (!this.context)
            throw new Error("Could not create a WebGPU canvas context.");

        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: "opaque",
            colorSpace: "srgb",
        });

        this.uniformBuffer = this.device.createBuffer({
            label: "journey-uniforms",
            size: UNIFORM_BYTES,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.noiseTexture = await loadExactNoiseTexture(this.device);

        this.noiseSampler = this.device.createSampler({
            label: "buffer-a-channel0-linear-repeat",
            addressModeU: "repeat",
            addressModeV: "repeat",
            magFilter: "linear",
            minFilter: "linear",
        });

        this.feedbackSampler = this.device.createSampler({
            label: "buffer-a-channel1-linear-clamp",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            magFilter: "linear",
            minFilter: "linear",
        });

        this.sourceSampler = this.device.createSampler({
            label: "image-channel0-linear-clamp",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            magFilter: "linear",
            minFilter: "linear",
        });

        const bufferModule = this.device.createShaderModule({
            label: "buffer-a-wgsl",
            code: `${fullscreenSource}\n${bufferASource}`,
        });

        const imageModule = this.device.createShaderModule({
            label: "image-wgsl",
            code: `${fullscreenSource}\n${imageSource}`,
        });

        await this.assertShaderModule(bufferModule, "Buffer A");
        await this.assertShaderModule(imageModule, "Image");

        this.bufferPipeline = this.device.createRenderPipeline({
            label: "buffer-a-pipeline",
            layout: "auto",
            vertex: { module: bufferModule, entryPoint: "vs_main" },
            fragment: {
                module: bufferModule,
                entryPoint: "fs_main",
                targets: [{ format: BUFFER_FORMAT }],
            },
            primitive: { topology: "triangle-list" },
        });

        this.imagePipeline = this.device.createRenderPipeline({
            label: "image-pipeline",
            layout: "auto",
            vertex: { module: imageModule, entryPoint: "vs_main" },
            fragment: {
                module: imageModule,
                entryPoint: "fs_main",
                targets: [{ format: this.format }],
            },
            primitive: { topology: "triangle-list" },
        });

        this.resizeObserver.observe(this.canvas);
        this.resize(true);
    }

    async assertShaderModule(module, label) {
        const info = await module.getCompilationInfo();
        const errors = info.messages.filter(
            (message) => message.type === "error",
        );
        if (errors.length === 0) return;
        const details = errors
            .map(
                (message) =>
                    `${message.lineNum}:${message.linePos} ${message.message}`,
            )
            .join("\n");
        throw new Error(`${label} WGSL did not compile:\n${details}`);
    }

    resize(force = false) {
        if (
            !this.device ||
            !this.context ||
            !this.bufferPipeline ||
            !this.imagePipeline
        )
            return;

        const renderSize = fitRenderSize({
            cssWidth: this.canvas.clientWidth,
            cssHeight: this.canvas.clientHeight,
            devicePixelRatio: window.devicePixelRatio || 1,
            maxDimension: this.device.limits.maxTextureDimension2D,
        });
        const { width, height } = renderSize;
        this.renderBudgetScale = renderSize.budgetScale;

        if (
            !force &&
            this.canvas.width === width &&
            this.canvas.height === height &&
            this.feedbackTextures.length === 2
        )
            return;

        this.canvas.width = width;
        this.canvas.height = height;
        this.createFeedbackTargets(width, height);
    }

    createFeedbackTargets(width, height) {
        this.feedbackTextures.forEach((texture) => texture.destroy());
        this.feedbackTextures = [0, 1].map((index) =>
            this.device.createTexture({
                label: `buffer-a-feedback-${index}`,
                size: [width, height, 1],
                format: BUFFER_FORMAT,
                usage:
                    GPUTextureUsage.RENDER_ATTACHMENT |
                    GPUTextureUsage.TEXTURE_BINDING,
            }),
        );

        this.feedbackBindGroups = this.feedbackTextures.map((texture) =>
            this.device.createBindGroup({
                label: "buffer-a-bind-group",
                layout: this.bufferPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: this.uniformBuffer } },
                    { binding: 1, resource: this.noiseSampler },
                    { binding: 2, resource: this.noiseTexture.createView() },
                    { binding: 3, resource: this.feedbackSampler },
                    { binding: 4, resource: texture.createView() },
                ],
            }),
        );

        this.imageBindGroups = this.feedbackTextures.map((texture) =>
            this.device.createBindGroup({
                label: "image-bind-group",
                layout: this.imagePipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: this.uniformBuffer } },
                    { binding: 1, resource: this.sourceSampler },
                    { binding: 2, resource: texture.createView() },
                ],
            }),
        );

        this.readIndex = 0;
        this.clearFeedback();
    }

    clearFeedback() {
        if (!this.device || this.feedbackTextures.length !== 2) return;
        const encoder = this.device.createCommandEncoder({
            label: "clear-feedback",
        });
        for (const texture of this.feedbackTextures) {
            const pass = encoder.beginRenderPass({
                colorAttachments: [
                    {
                        view: texture.createView(),
                        clearValue: { r: 0, g: 0, b: 0, a: 1 },
                        loadOp: "clear",
                        storeOp: "store",
                    },
                ],
            });
            pass.end();
        }
        this.device.queue.submit([encoder.finish()]);
    }

    startRenderer() {
        if (this.running) return;
        this.running = true;
        this.lastFrameAt = 0;
        this.fpsWindowStart = performance.now();
        this.frameHandle = requestAnimationFrame(this.render);
    }

    stopRenderer() {
        this.running = false;
        cancelAnimationFrame(this.frameHandle);
    }

    setTravelRunning(value) {
        this.travelRunning = Boolean(value);
    }

    toggleTravel() {
        this.travelRunning = !this.travelRunning;
        return this.travelRunning;
    }

    setTravelSpeed(value) {
        this.travelSpeed = Math.max(0.1, Math.min(2.5, Number(value) || 1));
    }

    setFeedbackAmount(value) {
        this.feedbackAmount = Math.max(0, Math.min(0.65, Number(value) || 0));
    }

    setVignetteStrength(value) {
        this.vignetteStrength = Math.max(0, Math.min(1, Number(value) || 0));
    }

    setMood(id) {
        this.moodEngine.setMood(id);
    }

    setMoodIntensity(value) {
        this.moodEngine.setIntensity(value);
    }

    setAutoMood(enabled) {
        this.moodEngine.setAutoCycle(false);
        const cue = this.cueTimeline.setEnabled(enabled);
        if (enabled) this.moodEngine.setMood(cue.moodId);
    }

    setMoodCycleSeconds(value) {
        this.moodEngine.setCycleSeconds(value);
    }

    setMoodOverride(key, value) {
        return this.moodEngine.setOverride(key, value);
    }

    clearMoodOverrides() {
        this.moodEngine.clearOverrides();
    }

    nextMood() {
        return this.moodEngine.next();
    }

    resetJourney() {
        this.clock.reset();
        const cue = this.cueTimeline.reset();
        if (this.cueTimeline.enabled) this.moodEngine.setMood(cue.moodId);
        this.clearFeedback();
    }

    getStats() {
        return {
            fps: this.fps,
            width: this.canvas.width,
            height: this.canvas.height,
            renderBudgetScale: this.renderBudgetScale,
            travelRunning: this.travelRunning,
            travelTime: this.clock.travelTime,
            windTime: this.clock.windPhase,
            smokeLevel: this.clock.smokeLevel,
            cueId: this.cueTimeline.current.id,
            cueProgress: this.cueTimeline.elapsedInCue() / this.cueTimeline.current.duration,
            moodId: this.moodEngine.currentId,
            mood: this.resolvedMood,
        };
    }

    capturePng() {
        return new Promise((resolve, reject) => {
            this.canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Could not capture canvas."));
            }, "image/png");
        });
    }

    destroy() {
        this.destroyed = true;
        this.stopRenderer();
        this.resizeObserver.disconnect();
        this.feedbackTextures.forEach((texture) => texture.destroy());
        this.noiseTexture?.destroy();
        this.uniformBuffer?.destroy();
    }

    writeUniforms(mood) {
        this.resolvedMood = mood;

        const writeColor = (offset, color) => {
            this.uniformData[offset] = color[0];
            this.uniformData[offset + 1] = color[1];
            this.uniformData[offset + 2] = color[2];
            this.uniformData[offset + 3] = 1;
        };

        this.uniformData[0] = this.canvas.width;
        this.uniformData[1] = this.canvas.height;
        this.uniformData[2] = this.clock.travelTime;
        this.uniformData[3] = this.clock.foregroundPhase;

        this.uniformData[4] = mood.low[0];
        this.uniformData[5] = mood.low[1];
        this.uniformData[6] = mood.low[2];
        this.uniformData[7] = 1;

        this.uniformData[8] = mood.high[0];
        this.uniformData[9] = mood.high[1];
        this.uniformData[10] = mood.high[2];
        this.uniformData[11] = 1;

        this.uniformData[12] = mood.intensity;
        this.uniformData[13] = this.vignetteStrength;
        this.uniformData[14] = this.feedbackAmount;
        this.uniformData[15] = mood.exposure;

        this.uniformData[16] = mood.cloudCoverage;
        this.uniformData[17] = mood.cloudHeight;
        this.uniformData[18] = mood.cloudScale;
        this.uniformData[19] = mood.turbulence;

        this.uniformData[20] = mood.windSpeed;
        this.uniformData[21] = mood.smokeAmount * this.clock.smokeLevel;
        this.uniformData[22] = mood.fogDensity;
        this.uniformData[23] = mood.contrast;

        this.uniformData[24] = mood.trainEmphasis;
        this.uniformData[25] = mood.bridgeEmphasis;
        this.uniformData[26] = this.sceneAge;
        this.uniformData[27] = this.clock.windPhase;

        writeColor(28, mood.skyColor);
        writeColor(32, mood.cloudShadow);
        writeColor(36, mood.cloudMid);
        writeColor(40, mood.cloudWarm);
        writeColor(44, mood.cloudLight);
        writeColor(48, mood.smokeLight);
        writeColor(52, mood.smokeShadow);
        writeColor(56, mood.trainDarkColor);
        writeColor(60, mood.trainBodyColor);
        writeColor(64, mood.locomotiveColor);
        writeColor(68, mood.bridgeColor);
        writeColor(72, mood.practicalLightColor);
        writeColor(76, mood.fogColor);

        this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);
    }

    frameDelta(now) {
        if (!this.lastFrameAt) this.lastFrameAt = now;
        const delta = Math.min(
            0.1,
            Math.max(0, (now - this.lastFrameAt) / 1000),
        );
        this.lastFrameAt = now;

        this.fpsAccumulator += delta;
        this.fpsFrames += 1;
        if (this.fpsAccumulator >= 0.5) {
            this.fps = Math.round(this.fpsFrames / this.fpsAccumulator);
            this.fpsAccumulator = 0;
            this.fpsFrames = 0;
        }
        return delta;
    }

    render(now) {
        if (!this.running || !this.device || this.feedbackTextures.length !== 2)
            return;

        const delta = this.frameDelta(now);
        this.sceneAge += delta;
        const cueState = this.cueTimeline.advance(delta, {
            running: this.travelRunning,
            speed: this.travelSpeed,
        });
        if (cueState.changed) this.moodEngine.setMood(cueState.cue.moodId, now / 1000);
        const mood = this.moodEngine.update(now / 1000);
        const cueTravelScale = this.cueTimeline.enabled
            ? cueState.cue.travelScale
            : 1;
        this.clock.advance(delta, {
            travelRunning: this.travelRunning,
            travelSpeed: this.travelSpeed * cueTravelScale,
            windSpeed: mood.windSpeed,
        });
        this.writeUniforms(mood);

        const writeIndex = 1 - this.readIndex;
        const encoder = this.device.createCommandEncoder({
            label: "journey-frame",
        });

        const bufferPass = encoder.beginRenderPass({
            label: "buffer-a-pass",
            colorAttachments: [
                {
                    view: this.feedbackTextures[writeIndex].createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });
        bufferPass.setPipeline(this.bufferPipeline);
        bufferPass.setBindGroup(0, this.feedbackBindGroups[this.readIndex]);
        bufferPass.draw(3);
        bufferPass.end();

        const imagePass = encoder.beginRenderPass({
            label: "image-pass",
            colorAttachments: [
                {
                    view: this.context.getCurrentTexture().createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });
        imagePass.setPipeline(this.imagePipeline);
        imagePass.setBindGroup(0, this.imageBindGroups[writeIndex]);
        imagePass.draw(3);
        imagePass.end();

        this.device.queue.submit([encoder.finish()]);
        this.readIndex = writeIndex;
        this.frameHandle = requestAnimationFrame(this.render);
    }
}
