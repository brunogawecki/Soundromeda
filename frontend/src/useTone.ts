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

let activePlayer: Tone.Player | null = null;
let playGeneration = 0;

/**
 * Play an audio URL with Tone.js Player. Call after Tone.start().
 * Returns a function to stop playback. Stops any previously playing sound.
 */
export function playAudioUrl(audioUrl: string, onEnded?: () => void): () => void {
  const stop = () => {
    playGeneration++;
    if (activePlayer) {
      activePlayer.stop();
      activePlayer.dispose();
      activePlayer = null;
    }
  };

  if (!audioUrl) {
    onEnded?.();
    return stop;
  }

  stop();
  playGeneration++;
  const myGen = playGeneration;

  Tone.start().then(() => {
    const player = new Tone.Player(audioUrl, () => {
      if (myGen !== playGeneration) return;
      activePlayer = player;
      player.toDestination();
      player.onstop = () => {
        activePlayer = null;
        player.dispose();
        onEnded?.();
      };
      player.start();
    });
  });

  return stop;
}
