/**
 * @seanhogg/hired-video-sdk — official Hired.Video partner SDK.
 *
 * Server entry: the `HiredClient` (system-to-system) + the framework-agnostic
 * `mountHiredProfile` embed helper. React components live in the separate
 * `@seanhogg/hired-video-sdk/react` entry so this core stays dependency-free.
 */
export { HiredClient } from "./client.js";
export type { HiredClientOptions } from "./client.js";
export { HiredApiError, HiredConfigError } from "./errors.js";
export { mountHiredProfile } from "./embed.js";
export type { MountHiredProfileOptions, HiredEmbedHandle } from "./embed.js";
export * from "./types.js";
