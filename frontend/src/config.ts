/** Point size in 2D view (base pixel size at default zoom; scales with zoom). */
export const POINT_SIZE_2D = 2;

/** Point size in 3D view (world units, with size attenuation). */
export const POINT_SIZE_3D = 0.12;

/** Hit-test radius in normalized device coords [-1,1]; points within this distance of cursor count as hovered. */
export const HOVER_NDC_RADIUS = 0.04;

/** Delay (ms) before playing sound on hover; avoids click artifacts when moving quickly between points. */
export const HOVER_PLAY_DELAY_MS = 30;

/** Default orthographic zoom in 2D (must match OrthographicCamera zoom in App.tsx). Used so point pixel size scales with zoom. */
export const DEFAULT_2D_ZOOM = 50;

/** Min/max zoom in 2D view (OrbitControls minZoom/maxZoom). */
export const MIN_2D_ZOOM = 50;
export const MAX_2D_ZOOM = 200;

/** OrbitControls damping factor in 2D (higher = less glide, snappier pan). */
export const DAMPING_FACTOR_2D = 0.25;

/** OrbitControls damping factor in 3D (default Three.js feel). */
export const DAMPING_FACTOR_3D = 0.05;
