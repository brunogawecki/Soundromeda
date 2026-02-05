import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAppStore } from '../store/useAppStore';
import type { SoundPoint } from '../types/sounds';
import { playAudioUrl, useToneStart } from '../useTone';
import * as THREE from 'three';

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
const HOVER_NDC_RADIUS = 0.08;

function getSoundPointPosition3D(soundPoint: SoundPoint): [number, number, number] {
  if (soundPoint.coords_3d && soundPoint.coords_3d.length === 3) {
    return [soundPoint.coords_3d[0], soundPoint.coords_3d[1], soundPoint.coords_3d[2]];
  }
  return [soundPoint.coords_2d[0], soundPoint.coords_2d[1], 0];
}

export function Scene() {
  const builtinPointsRef = useRef<THREE.Points>(null);
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
  const galaxyVersion = useAppStore((s) => s.galaxyVersion);
  const highlightedListAudioUrl = useAppStore((s) => s.highlightedListAudioUrl);

  const { camera } = useThree();
  const startTone = useToneStart();
  const mouse = useRef(new THREE.Vector2());
  /** True while pointer is over the scene (plane); used so useFrame doesn't overwrite hoveredId after onPointerLeave. */
  const isPointerOverScene = useRef(false);

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

  // Play sound when selected (clicked) with Tone.js; clear playingId when done
  useEffect(() => {
    if (!selectedId || points.length === 0) {
      setPlayingId(null);
      return;
    }
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
  }, [selectedId, points, setPlayingId]);

  // Reusable vectors for hit-test (avoid per-frame allocations)
  const normalizedDeviceCoords = useRef(new THREE.Vector3());
  const worldPosition = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!isPointerOverScene.current) {
      setHoveredId(null);
      setHoveredName(null);
      setPointerPosition(null, null);
      return;
    }
    if (points.length === 0 || !builtinPointsRef.current) return;
    const matrixWorld = builtinPointsRef.current.matrixWorld;
    let bestId: string | null = null;
    let bestName: string | null = null;
    let bestDistSq = HOVER_NDC_RADIUS * HOVER_NDC_RADIUS;
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const [x, y, z] = getSoundPointPosition3D(point);
      worldPosition.current.set(x, y, z).applyMatrix4(matrixWorld);
      normalizedDeviceCoords.current.copy(worldPosition.current).project(camera);
      const dx = normalizedDeviceCoords.current.x - mouse.current.x;
      const dy = normalizedDeviceCoords.current.y - mouse.current.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestId = String(point.id);
        bestName = point.name ?? null;
      }
    }
    setHoveredId(bestId);
    setHoveredName(bestName);
  });

  const handlePointerMove = (e: { pointer: { x: number; y: number }; nativeEvent: { clientX: number; clientY: number } }) => {
    mouse.current.x = e.pointer.x;
    mouse.current.y = e.pointer.y;
    setPointerPosition(e.nativeEvent.clientX, e.nativeEvent.clientY);
  };

  const soundPointsToPositions = (soundPoints: SoundPoint[]) => {
    const pos = new Float32Array(soundPoints.length * 3);
    soundPoints.forEach((point, i) => {
      const [x, y, z] = getSoundPointPosition3D(point);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
    });
    return pos;
  };

  const builtinPositions = useMemo(() => soundPointsToPositions(builtinPoints), [builtinPoints]);
  const userPositions = useMemo(() => soundPointsToPositions(userPoints), [userPoints]);

  if (points.length === 0) {
    return (
      <>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[1000, 1000]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </>
    );
  }

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      {/* Invisible plane at z=0 for raycast to get cursor (x,y) in galaxy space */}
      <mesh
        ref={planeRef}
        position={[0, 0, 0]}
        onPointerEnter={() => { isPointerOverScene.current = true; }}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          isPointerOverScene.current = false;
          setHoveredId(null);
          setHoveredName(null);
          setPointerPosition(null, null);
        }}
        onPointerDown={() => {
          startTone();
          if (hoveredId != null) setSelectedId(hoveredId);
        }}
      >
        <planeGeometry args={[1e6, 1e6]} />
        <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
      </mesh>
      {builtinPoints.length > 0 && (
        <points ref={builtinPointsRef} key={`builtin-${builtinPoints.length}`}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[builtinPositions, 3]} />
          </bufferGeometry>
          <pointsMaterial
            size={0.12}
            color="#3b82f6"
            sizeAttenuation
            transparent
            opacity={0.9}
          />
        </points>
      )}
      {userPoints.length > 0 && (
        <points ref={builtinPoints.length === 0 ? builtinPointsRef : undefined} key={`user-${userPoints.length}`}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[userPositions, 3]} />
          </bufferGeometry>
          <pointsMaterial
            size={0.12}
            color="#f97316"
            sizeAttenuation
            transparent
            opacity={0.9}
          />
        </points>
      )}
      {hoveredId != null && (() => {
        const point = points.find((x) => String(x.id) === String(hoveredId));
        if (!point) return null;
        const [x, y, z] = getSoundPointPosition3D(point);
        return (
          <mesh position={[x, y, z]}>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshBasicMaterial color="#fbbf24" transparent opacity={0.9} />
          </mesh>
        );
      })()}
      {highlightedListAudioUrl != null && (() => {
        const point = points.find((x) => x.audioUrl === highlightedListAudioUrl);
        if (!point) return null;
        const [x, y, z] = getSoundPointPosition3D(point);
        return (
          <mesh position={[x, y, z]}>
            <sphereGeometry args={[0.15, 10, 10]} />
            <meshBasicMaterial color="#f97316" transparent opacity={0.25} depthWrite={false} />
          </mesh>
        );
      })()}
    </>
  );
}
