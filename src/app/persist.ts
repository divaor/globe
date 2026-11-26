// Waiting for the apps' copy of your data (v0.50.2). In the apps, every change to the page's storage is also written to
// the app's own storage a moment later (src/native/storage.ts sets `flush`). Anything about to start the page again
// (bringing back a backup) waits for those writes first, so the app's copy matches and nothing removed comes back. On
// the website there is nothing to wait for.
export const persist = { flush: (): Promise<void> => Promise.resolve() };
