import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
    plugins: [vue()],
    server: {
        allowedHosts: ["datacenter"],
    },
    build: {
        target: "es2022",
    },
});
