import { create } from 'zustand';

export type HoverTooltipMode = 'fixed' | 'follow';
export type PlayMode = 'hover' | 'click';

interface AppState {
  selectedId: string | null;
  playingId: string | null;
  hoveredId: string | null;
  hoveredName: string | null;
  pointerX: number | null;
  pointerY: number | null;
  hoverTooltipMode: HoverTooltipMode;
  playMode: PlayMode;
  volume: number;
  galaxyVersion: number;
  /** audioUrl of the sound hovered in the uploaded-files list; Scene highlights that point. */
  highlightedListAudioUrl: string | null;
  setSelectedId: (id: string | null) => void;
  setPlayingId: (id: string | null) => void;
  setHoveredId: (id: string | null) => void;
  setHoveredName: (name: string | null) => void;
  setPointerPosition: (x: number | null, y: number | null) => void;
  setHoverTooltipMode: (mode: HoverTooltipMode) => void;
  setPlayMode: (mode: PlayMode) => void;
  setVolume: (volume: number) => void;
  setHighlightedListAudioUrl: (url: string | null) => void;
  refreshGalaxy: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedId: null,
  playingId: null,
  hoveredId: null,
  hoveredName: null,
  pointerX: null,
  pointerY: null,
  hoverTooltipMode: 'follow',
  playMode: 'hover',
  volume: 1.0,
  galaxyVersion: 0,
  highlightedListAudioUrl: null,
  setSelectedId: (id) => set({ selectedId: id }),
  setPlayingId: (id) => set({ playingId: id }),
  setHoveredId: (id) => set({ hoveredId: id }),
  setHoveredName: (name) => set({ hoveredName: name }),
  setPointerPosition: (x, y) => set({ pointerX: x, pointerY: y }),
  setHoverTooltipMode: (mode) => set({ hoverTooltipMode: mode }),
  setPlayMode: (mode) => set({ playMode: mode }),
  setVolume: (volume) => set({ volume }),
  setHighlightedListAudioUrl: (url) => set({ highlightedListAudioUrl: url }),
  refreshGalaxy: () => set((s) => ({ galaxyVersion: s.galaxyVersion + 1 })),
}));
