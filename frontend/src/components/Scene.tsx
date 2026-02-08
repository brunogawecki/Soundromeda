import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAppStore } from '../store/useAppStore';
import type { SoundPoint } from '../types/sounds';
import { playAudioUrl, useToneStart } from '../useTone';
import * as THREE from 'three';

// --- Logic ---

const API_BASE = '';

/** Normalize API response to SoundPoint[]; logs and returns [] when response is not ok. */
async function parsePointsResponse(res: Response, source?: string): Promise<SoundPoint[]> {
  if (!res.ok) {
    if (source) {
      console.error(`Failed to fetch ${source} sounds:`, res.status, await res.text().catch(() => ''));
    }
    return [];
  }
  const data = await res.json();
  return Array.isArray(data?.points) ? data.points : [];
}

async function fetchAllPoints(): Promise<{ builtin: SoundPoint[]; user: SoundPoint[]; all: SoundPoint[] }> {
  try {
    const [builtinResponse, userResponse] = await Promise.all([
      fetch(`${API_BASE}/api/sounds?source=builtin`),
      fetch(`${API_BASE}/api/sounds?source=user`),
    ]);
    const [builtin, user] = await Promise.all([
      parsePointsResponse(builtinResponse, 'builtin'),
      parsePointsResponse(userResponse, 'user'),
    ]);
    return { builtin, user, all: [...builtin, ...user] };
  } catch (err) {
    console.error('Failed to fetch sounds:', err);
    return { builtin: [], user: [], all: [] };
  }
}

/** Hit-test radius in normalized device coords [-1,1]; points within this distance of cursor count as hovered. */
const HOVER_NDC_RADIUS = 0.04;

/** Delay (ms) before playing sound on hover; avoids click artifacts when moving quickly between points. */
const HOVER_PLAY_DELAY_MS = 30;

function getSoundPointPosition3D(soundPoint: SoundPoint): [number, number, number] {
  if (soundPoint.coords_3d && soundPoint.coords_3d.length === 3) {
    return [soundPoint.coords_3d[0], soundPoint.coords_3d[1], soundPoint.coords_3d[2]];
  }
  return [soundPoint.coords_2d[0], soundPoint.coords_2d[1], 0];
}

function findClosestSoundPointToCursor(
  points: SoundPoint[],
  mouseNdc: THREE.Vector2,
  camera: THREE.Camera,
  matrixWorld: THREE.Matrix4,
  worldPositionRef: { current: THREE.Vector3 },
  normalizedDeviceCoordsRef: { current: THREE.Vector3 },
): { id: string | null; name: string | null } {
  let bestId: string | null = null;
  let bestName: string | null = null;
  let bestDistSq = HOVER_NDC_RADIUS * HOVER_NDC_RADIUS;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const [x, y, z] = getSoundPointPosition3D(point);
    worldPositionRef.current.set(x, y, z).applyMatrix4(matrixWorld);
    normalizedDeviceCoordsRef.current.copy(worldPositionRef.current).project(camera);
    const dx = normalizedDeviceCoordsRef.current.x - mouseNdc.x;
    const dy = normalizedDeviceCoordsRef.current.y - mouseNdc.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestId = String(point.id);
      bestName = point.name ?? null;
    }
  }
  return { id: bestId, name: bestName };
}

function soundPointsToPositions(soundPoints: SoundPoint[]): Float32Array {
  const pos = new Float32Array(soundPoints.length * 3);
  soundPoints.forEach((point, i) => {
    const [x, y, z] = getSoundPointPosition3D(point);
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
  });
  return pos;
}

/** All scene state, refs, effects, and handlers; no JSX. Call from within Canvas (R3F). */
function useSceneLogic() {
  const primaryPointsRef = useRef<THREE.Points>(null);
  const planeRef = useRef<THREE.Mesh>(null);
  const [points, setPoints] = useState<SoundPoint[]>([]);
  const [builtinPoints, setBuiltinPoints] = useState<SoundPoint[]>([]);
  const [userPoints, setUserPoints] = useState<SoundPoint[]>([]);

  const setHoveredId = useAppStore((s) => s.setHoveredId);
  const setHoveredName = useAppStore((s) => s.setHoveredName);
  const setPointerPosition = useAppStore((s) => s.setPointerPosition);
  const hoveredId = useAppStore((s) => s.hoveredId);
  const selectedId = useAppStore((s) => s.selectedId);
  const setSelectedId = useAppStore((s) => s.setSelectedId);
  const setPlayingId = useAppStore((s) => s.setPlayingId);
  const playMode = useAppStore((s) => s.playMode);
  const galaxyVersion = useAppStore((s) => s.galaxyVersion);
  const highlightedListAudioUrl = useAppStore((s) => s.highlightedListAudioUrl);

  const { camera } = useThree();
  const startTone = useToneStart();
  const mouse = useRef(new THREE.Vector2());
  const isPointerOverScene = useRef(false);
  const worldPosition = useRef(new THREE.Vector3());
  const normalizedDeviceCoords = useRef(new THREE.Vector3());
  const hoverPlayStopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAllPoints()
      .then(({ builtin, user, all }) => {
        if (!cancelled) {
          setBuiltinPoints(builtin);
          setUserPoints(user);
          setPoints(all);
        }
      })
      .catch((err) => console.error('Failed to fetch sounds:', err));
    return () => {
      cancelled = true;
    };
  }, [galaxyVersion]);

  // Click mode: play sound for selected point (set on pointer down).
  useEffect(() => {
    if (playMode !== 'click' || !selectedId || points.length === 0) return;
    const point = points.find((p) => String(p.id) === String(selectedId));
    if (!point?.audioUrl) {
      setPlayingId(null);
      return;
    }
    setPlayingId(selectedId);
    const stop = playAudioUrl(point.audioUrl, () => setPlayingId(null));
    return () => {
      stop();
      setPlayingId(null);
    };
  }, [playMode, selectedId, points, setPlayingId]);

  // Hover mode: play sound for hovered point after a short delay; stop when hover leaves or changes.
  useEffect(() => {
    if (playMode !== 'hover' || !hoveredId || points.length === 0) return;
    const point = points.find((p) => String(p.id) === String(hoveredId));
    if (!point?.audioUrl) return;

    const timeoutId = window.setTimeout(() => {
      startTone();
      setPlayingId(hoveredId);
      hoverPlayStopRef.current = playAudioUrl(point.audioUrl, () => setPlayingId(null));
    }, HOVER_PLAY_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      hoverPlayStopRef.current?.();
      hoverPlayStopRef.current = null;
      setPlayingId(null);
    };
  }, [playMode, hoveredId, points, setPlayingId]);

  useFrame(() => {
    if (!isPointerOverScene.current) {
      setHoveredId(null);
      setHoveredName(null);
      setPointerPosition(null, null);
      return;
    }
    if (points.length === 0 || !primaryPointsRef.current) return;
    const { id: bestId, name: bestName } = findClosestSoundPointToCursor(
      points,
      mouse.current,
      camera,
      primaryPointsRef.current.matrixWorld,
      worldPosition,
      normalizedDeviceCoords,
    );
    setHoveredId(bestId);
    setHoveredName(bestName);
  });

  const handlePointerMove = (e: { pointer: { x: number; y: number }; nativeEvent: { clientX: number; clientY: number } }) => {
    mouse.current.x = e.pointer.x;
    mouse.current.y = e.pointer.y;
    setPointerPosition(e.nativeEvent.clientX, e.nativeEvent.clientY);
  };

  const handlePointerEnter = () => {
    isPointerOverScene.current = true;
  };

  const handlePointerLeave = () => {
    isPointerOverScene.current = false;
    setHoveredId(null);
    setHoveredName(null);
    setPointerPosition(null, null);
  };

  const handlePointerDown = () => {
    startTone();
    if (playMode === 'click' && hoveredId != null) setSelectedId(hoveredId);
  };

  const builtinPositions = useMemo(() => soundPointsToPositions(builtinPoints), [builtinPoints]);
  const userPositions = useMemo(() => soundPointsToPositions(userPoints), [userPoints]);

  return {
    points,
    builtinPoints,
    userPoints,
    builtinPositions,
    userPositions,
    primaryPointsRef,
    planeRef,
    hoveredId,
    selectedId,
    highlightedListAudioUrl,
    handlePointerMove,
    handlePointerEnter,
    handlePointerLeave,
    handlePointerDown,
  };
}

// --- UI components ---

function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
    </>
  );
}

interface InvisibleHitPlaneProps {
  planeRef: React.RefObject<THREE.Mesh | null>;
  onPointerEnter: () => void;
  onPointerMove: (e: { pointer: { x: number; y: number }; nativeEvent: { clientX: number; clientY: number } }) => void;
  onPointerLeave: () => void;
  onPointerDown: () => void;
}

function InvisibleHitPlane({ planeRef, onPointerEnter, onPointerMove, onPointerLeave, onPointerDown }: InvisibleHitPlaneProps) {
  return (
    <mesh
      ref={planeRef}
      position={[0, 0, 0]}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
    >
      <planeGeometry args={[1e6, 1e6]} />
      <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

interface PointsCloudProps {
  positions: Float32Array;
  color: string;
  size: number;
  pointsRef?: React.RefObject<THREE.Points | null>;
}

function PointsCloud({ positions, color, size, pointsRef }: PointsCloudProps) {
  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={size} color={color} sizeAttenuation transparent opacity={0.9} />
    </points>
  );
}

interface HoveredPointMarkerProps {
  points: SoundPoint[];
  hoveredId: string | null;
}

function HoveredPointMarker({ points, hoveredId }: HoveredPointMarkerProps) {
  if (hoveredId == null) return null;
  const point = points.find((x) => String(x.id) === String(hoveredId));
  if (!point) return null;
  const [x, y, z] = getSoundPointPosition3D(point);
  return (
    <mesh position={[x, y, z]}>
      <sphereGeometry args={[0.06, 16, 16]} />
      <meshBasicMaterial color="#fbbf24" transparent opacity={0.9} />
    </mesh>
  );
}

interface HighlightedListPointMarkerProps {
  points: SoundPoint[];
  highlightedListAudioUrl: string | null;
}

function HighlightedListPointMarker({ points, highlightedListAudioUrl }: HighlightedListPointMarkerProps) {
  if (highlightedListAudioUrl == null) return null;
  const point = points.find((x) => x.audioUrl === highlightedListAudioUrl);
  if (!point) return null;
  const [x, y, z] = getSoundPointPosition3D(point);
  return (
    <mesh position={[x, y, z]}>
      <sphereGeometry args={[0.15, 10, 10]} />
      <meshBasicMaterial color="#f97316" transparent opacity={0.25} depthWrite={false} />
    </mesh>
  );
}

export function Scene() {
  const {
    points,
    builtinPoints,
    userPoints,
    builtinPositions,
    userPositions,
    primaryPointsRef,
    planeRef,
    hoveredId,
    highlightedListAudioUrl,
    handlePointerMove,
    handlePointerEnter,
    handlePointerLeave,
    handlePointerDown,
  } = useSceneLogic();

  if (points.length === 0) {
    return (
      <>
        <SceneLighting />
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[1000, 1000]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </>
    );
  }

  return (
    <>
      <SceneLighting />
      <InvisibleHitPlane planeRef={planeRef} onPointerEnter={handlePointerEnter} onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave} onPointerDown={handlePointerDown} />
      {/* Point clouds: builtin (blue), user (orange); primaryPointsRef used for hit-test (builtin or user when only user has points) */}
      {builtinPoints.length > 0 && <PointsCloud pointsRef={primaryPointsRef} positions={builtinPositions} color="#3b82f6" size={0.12} key={`builtin-${builtinPoints.length}`} />}
      {userPoints.length > 0 && <PointsCloud pointsRef={builtinPoints.length === 0 ? primaryPointsRef : undefined} positions={userPositions} color="#f97316" size={0.12} key={`user-${userPoints.length}`} />}
      {/* Hover + list-highlight markers */}
      <HoveredPointMarker points={points} hoveredId={hoveredId} />
      <HighlightedListPointMarker points={points} highlightedListAudioUrl={highlightedListAudioUrl} />
    </>
  );
}
