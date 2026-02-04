import { create } from 'zustand';

export type HoverTooltipMode = 'fixed' | 'follow';

interface AppState {
  selectedId: string | null;
  playingId: string | null;
  hoveredId: string | null;
  hoveredName: string | null;
  pointerX: number | null;
  pointerY: number | null;
  hoverTooltipMode: HoverTooltipMode;
  galaxyVersion: number;
  setSelectedId: (id: string | null) => void;
  setPlayingId: (id: string | null) => void;
  setHoveredId: (id: string | null) => void;
  setHoveredName: (name: string | null) => void;
  setPointerPosition: (x: number | null, y: number | null) => void;
  setHoverTooltipMode: (mode: HoverTooltipMode) => void;
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
  galaxyVersion: 0,
  setSelectedId: (id) => set({ selectedId: id }),
  setPlayingId: (id) => set({ playingId: id }),
  setHoveredId: (id) => set({ hoveredId: id }),
  setHoveredName: (name) => set({ hoveredName: name }),
  setPointerPosition: (x, y) => set({ pointerX: x, pointerY: y }),
  setHoverTooltipMode: (mode) => set({ hoverTooltipMode: mode }),
  refreshGalaxy: () => set((s) => ({ galaxyVersion: s.galaxyVersion + 1 })),
}));
