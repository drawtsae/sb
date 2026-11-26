/// <reference lib="webworker" />
import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected by `serwist build` (serwist.config.mjs): the build's static assets, public/ and /live.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Precache only. There is deliberately no runtimeCaching: a request that is not in the precache
// (every page except /live, /api/*, /__music/*) is not handled here, so it goes to the network
// and nothing about it is stored. /__music/* lives in Cache Storage "sb-music-v1", which the
// page reads directly; precache cleanup only touches Serwist's own precache caches.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
});

serwist.addEventListeners();
