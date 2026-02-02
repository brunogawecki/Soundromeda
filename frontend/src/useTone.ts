import * as Tone from 'tone';

let started = false;

/**
 * Resume Tone.js context on first user interaction (required for browser autoplay).
 * Call once when the app mounts or on first click.
 */
export function useToneStart(): () => void {
  return () => {
    if (started) return;
    Tone.start().then(() => {
      started = true;
    });
  };
}
