import * as Tone from 'tone';

let started = false;

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
let masterVolume: Tone.Volume | null = null;

function getMasterVolume(): Tone.Volume {
  if (!masterVolume) {
    masterVolume = new Tone.Volume(0).toDestination();
  }
  return masterVolume;
}

export function setMasterVolume(volume: number): void {
  const vol = getMasterVolume();
  // Convert linear 0-1 to dB: 0 = -Infinity (mute), 1 = 0dB (full)
  const db = volume <= 0 ? -Infinity : Tone.gainToDb(volume);
  vol.volume.value = db;
}

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
      player.connect(getMasterVolume());
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
