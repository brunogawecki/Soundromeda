import { create } from 'zustand';

interface AppState {
  selectedId: string | null;
  playingId: string | null;
  hoveredId: string | null;
  galaxyVersion: number;
  setSelectedId: (id: string | null) => void;
  setPlayingId: (id: string | null) => void;
  setHoveredId: (id: string | null) => void;
  refreshGalaxy: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedId: null,
  playingId: null,
  hoveredId: null,
  galaxyVersion: 0,
  setSelectedId: (id) => set({ selectedId: id }),
  setPlayingId: (id) => set({ playingId: id }),
  setHoveredId: (id) => set({ hoveredId: id }),
  refreshGalaxy: () => set((s) => ({ galaxyVersion: s.galaxyVersion + 1 })),
}));
