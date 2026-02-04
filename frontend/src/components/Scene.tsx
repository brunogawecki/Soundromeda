import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAppStore } from '../store/useAppStore';
import type { SoundPoint } from '../types/sounds';
import { playAudioUrl } from '../useTone';
import * as THREE from 'three';

const API_BASE = '';

async function fetchAllPoints(): Promise<SoundPoint[]> {
  try {
    const [builtinRes, userRes] = await Promise.all([
      fetch(`${API_BASE}/api/sounds?source=builtin`),
      fetch(`${API_BASE}/api/sounds?source=user`),
    ]);
    const builtin = builtinRes.ok ? await builtinRes.json() : { points: [] };
    const user = userRes.ok ? await userRes.json() : { points: [] };
    if (!builtinRes.ok) {
      console.error('Failed to fetch builtin sounds:', builtinRes.status, await builtinRes.text().catch(() => ''));
    }
    if (!userRes.ok) {
      console.error('Failed to fetch user sounds:', userRes.status, await userRes.text().catch(() => ''));
    }
    const builtinPoints: SoundPoint[] = Array.isArray(builtin.points) ? builtin.points : [];
    const userPoints: SoundPoint[] = Array.isArray(user.points) ? user.points : [];
    return [...builtinPoints, ...userPoints];
  } catch (err) {
    console.error('Failed to fetch sounds:', err);
    return [];
  }
}

/** Hit-test radius in normalized device coords [-1,1]; points within this distance of cursor count as hovered. */
const HOVER_NDC_RADIUS = 0.08;

export function Scene() {
  const pointsRef = useRef<THREE.Points>(null);
  const planeRef = useRef<THREE.Mesh>(null);
  const [points, setPoints] = useState<SoundPoint[]>([]);
  const setHoveredId = useAppStore((s) => s.setHoveredId);
  const hoveredId = useAppStore((s) => s.hoveredId);
  const setSelectedId = useAppStore((s) => s.setSelectedId);
  const setPlayingId = useAppStore((s) => s.setPlayingId);
  const selectedId = useAppStore((s) => s.selectedId);
  const galaxyVersion = useAppStore((s) => s.galaxyVersion);

  const { camera } = useThree();
  const mouse = useRef(new THREE.Vector2());
  /** True while pointer is over the scene (plane); used so useFrame doesn't overwrite hoveredId after onPointerLeave. */
  const isPointerOverScene = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchAllPoints()
      .then((all) => {
        if (!cancelled) setPoints(all);
      })
      .catch((err) => console.error('Failed to fetch sounds:', err));
    return () => {
      cancelled = true;
    };
  }, [galaxyVersion]);

  // Play selected sound with Tone.js; clear playingId when done
  useEffect(() => {
    if (!selectedId || points.length === 0) return;
    const point = points.find((p) => String(p.id) === String(selectedId));
    if (!point?.audioUrl) return;
    setPlayingId(selectedId);
    const stop = playAudioUrl(point.audioUrl, () => setPlayingId(null));
    return () => {
      stop();
      setPlayingId(null);
    };
  }, [selectedId, points, setPlayingId]);

  // Reusable vectors for hit-test (avoid per-frame allocations)
  const worldPos = useRef(new THREE.Vector3());
  const ndc = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!isPointerOverScene.current) {
      setHoveredId(null);
      return;
    }
    if (points.length === 0 || !pointsRef.current) return;
    const matrixWorld = pointsRef.current.matrixWorld;
    let bestId: string | null = null;
    let bestDistSq = HOVER_NDC_RADIUS * HOVER_NDC_RADIUS;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const use3d = p.coords_3d && p.coords_3d.length === 3;
      const x = use3d ? p.coords_3d![0] : p.coords_2d[0];
      const y = use3d ? p.coords_3d![1] : p.coords_2d[1];
      const z = use3d ? p.coords_3d![2] : 0;
      worldPos.current.set(x, y, z).applyMatrix4(matrixWorld);
      ndc.current.copy(worldPos.current).project(camera);
      const dx = ndc.current.x - mouse.current.x;
      const dy = ndc.current.y - mouse.current.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestId = String(p.id);
      }
    }
    setHoveredId(bestId);
  });

  const handlePointerMove = (e: { pointer: { x: number; y: number } }) => {
    mouse.current.x = e.pointer.x;
    mouse.current.y = e.pointer.y;
  };

  const positions = useMemo(() => {
    const pos = new Float32Array(points.length * 3);
    points.forEach((p, i) => {
      if (p.coords_3d && p.coords_3d.length === 3) {
        pos[i * 3] = p.coords_3d[0];
        pos[i * 3 + 1] = p.coords_3d[1];
        pos[i * 3 + 2] = p.coords_3d[2];
      } else {
        pos[i * 3] = p.coords_2d[0];
        pos[i * 3 + 1] = p.coords_2d[1];
        pos[i * 3 + 2] = 0;
      }
    });
    return pos;
  }, [points]);

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
        }}
        onPointerDown={() => {
          if (hoveredId != null) setSelectedId(hoveredId);
        }}
      >
        <planeGeometry args={[1e6, 1e6]} />
        <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
      </mesh>
      <points ref={pointsRef} key={points.length}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.12}
          color="#a78bfa"
          sizeAttenuation
          transparent
          opacity={0.9}
        />
      </points>
      {hoveredId != null && (() => {
        const p = points.find((x) => String(x.id) === String(hoveredId));
        if (!p) return null;
        const use3d = p.coords_3d && p.coords_3d.length === 3;
        const x = use3d ? p.coords_3d![0] : p.coords_2d[0];   // condition ? valueIfTrue : valueIfFalse
        const y = use3d ? p.coords_3d![1] : p.coords_2d[1];
        const z = use3d ? p.coords_3d![2] : 0;
        return (
          <mesh position={[x, y, z]}>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshBasicMaterial color="#fbbf24" transparent opacity={0.9} />
          </mesh>
        );
      })()}
    </>
  );
}
