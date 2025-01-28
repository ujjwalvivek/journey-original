import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const allowedHosts = (env.JOURNEY_ALLOWED_HOSTS ?? "")
        .split(",")
        .map((host) => host.trim())
        .filter(Boolean);

    return {
        plugins: [vue()],
        server: {
            allowedHosts,
        },
        build: {
            target: "es2022",
        },
    };
});
