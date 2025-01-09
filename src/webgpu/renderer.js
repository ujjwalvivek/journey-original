import fullscreenSource from "../shaders/fullscreen.wgsl?raw";
import bufferASource from "../shaders/bufferA.wgsl?raw";
import imageSource from "../shaders/image.wgsl?raw";
import { loadExactNoiseTexture } from "./textures.js";
import { MoodEngine } from "./moodEngine.js";

const BUFFER_FORMAT = "rgba16float";
const UNIFORM_FLOATS = 16;
const UNIFORM_BYTES = UNIFORM_FLOATS * 4;

export class JourneyRenderer {
    constructor(canvas) {
        this.canvas = canvas;
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
        this.sceneTime = 0;
        this.moodTime = 0;
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
            console.error("WebGPU device lost:", info);
            this.stopRenderer();
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

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
        const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));

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
        this.moodEngine.setAutoCycle(enabled);
    }

    setMoodCycleSeconds(value) {
        this.moodEngine.setCycleSeconds(value);
    }

    nextMood() {
        return this.moodEngine.next();
    }

    resetJourney() {
        this.sceneTime = 0;
        this.moodTime = 0;
        this.clearFeedback();
    }

    getStats() {
        return {
            fps: this.fps,
            width: this.canvas.width,
            height: this.canvas.height,
            travelRunning: this.travelRunning,
            sceneTime: this.sceneTime,
            moodId: this.moodEngine.currentId,
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
        this.stopRenderer();
        this.resizeObserver.disconnect();
        this.feedbackTextures.forEach((texture) => texture.destroy());
        this.noiseTexture?.destroy();
        this.uniformBuffer?.destroy();
    }

    writeUniforms(nowSeconds) {
        const mood = this.moodEngine.update(nowSeconds);

        this.uniformData[0] = this.canvas.width;
        this.uniformData[1] = this.canvas.height;
        this.uniformData[2] = this.sceneTime;
        this.uniformData[3] = this.moodTime;

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
        this.uniformData[15] = 0;

        this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);
    }

    updateClock(now) {
        if (!this.lastFrameAt) this.lastFrameAt = now;
        const delta = Math.min(
            0.1,
            Math.max(0, (now - this.lastFrameAt) / 1000),
        );
        this.lastFrameAt = now;

        if (this.travelRunning) this.sceneTime += delta * this.travelSpeed;
        this.moodTime += delta;

        this.fpsAccumulator += delta;
        this.fpsFrames += 1;
        if (this.fpsAccumulator >= 0.5) {
            this.fps = Math.round(this.fpsFrames / this.fpsAccumulator);
            this.fpsAccumulator = 0;
            this.fpsFrames = 0;
        }
    }

    render(now) {
        if (!this.running || !this.device || this.feedbackTextures.length !== 2)
            return;

        this.updateClock(now);
        this.writeUniforms(now / 1000);

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
