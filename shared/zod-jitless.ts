/**
 * Side-effect import: put zod in jitless mode. Zod 4 probes
 * `new Function("")` to decide whether to JIT-compile object parsers; under
 * a CSP without 'unsafe-eval' (the Chrome extension's MV3 pages) that probe
 * logs a CSP violation every time. Jitless parsing behaves the same, just
 * without the compiled fast path. Lives in shared/ so it configures the same
 * zod instance every shared schema uses. The web app does not import it.
 */
import { config } from "zod";

config({ jitless: true });
