/**
 * Centralized configuration / magic-number constants.
 * Keeping these in one place makes the rendering & loading pipeline
 * easier to tune and reason about.
 */

/** Flush a geometry batch to the main thread every N streamed meshes (incremental display). */
export const FLUSH_EVERY = 150;

/** Upper bound for the shared material cache before evicting the oldest entry. */
export const MATERIAL_CACHE_MAX = 500;

/** Orthographic camera frustum half-height (world units) used for framing. */
export const FRUSTUM_SIZE = 100;

/** Timeout (ms) for a worker property-keys query before falling back to []. */
export const PROPERTY_QUERY_TIMEOUT = 3000;

/** Delay (ms) after controls 'end' before clearing the drag flag. */
export const DRAG_END_DELAY = 150;

/** Enable logarithmic depth buffer. Most models don't need it and it adds
 *  per-fragment cost + precision artifacts; enable only for very large-scale
 *  models that suffer from z-fighting. */
export const ENABLE_LOGARITHMIC_DEPTH_BUFFER = false;

/** Local asset sub-paths (served from /public, referenced via import.meta.env.BASE_URL). */
export const WASM_PATH = 'web-ifc/';
export const DRACO_PATH = 'draco/';
