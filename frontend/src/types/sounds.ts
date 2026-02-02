/** Single sound point from GET /api/sounds (id, coords_2d, name, audioUrl). */
export interface SoundPoint {
  id: string | number;
  coords_2d: [number, number];
  coords_3d?: [number, number, number];
  name: string;
  audioUrl: string;
}

export interface PointsResponse {
  points: SoundPoint[];
}
