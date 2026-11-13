import { persistedState } from "../utils/persisted-state.svelte";

// Shared browser preference for Groups and Subscriptions. Off by default.
export const autosave = persistedState<boolean>("autosave-enabled", false);
