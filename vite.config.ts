/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Served from https://rrong12.github.io/uchicagomacros/ — GitHub Pages
  // puts project sites under a subpath, so assets need this prefix.
  // Change to "/" if moving to Vercel or a custom domain.
  base: "/uchicagomacros/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // Node 22+ ships an experimental global `localStorage` stub (warns
    // "--localstorage-file was not provided" and always reads back
    // undefined). It gets defined on globalThis before jsdom's window is
    // wired in, so it shadows jsdom's real localStorage implementation.
    // Disabling it lets jsdom's localStorage take effect for tests.
    execArgv: ["--no-experimental-webstorage"],
  },
});
