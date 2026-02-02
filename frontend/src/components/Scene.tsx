import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAppStore } from '../store/useAppStore';
import type { SoundPoint } from '../types/sounds';
import { buildKDTreeFromPoints } from '../utils/kdTree';
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

/** Hit-test radius in world units: points within this distance of cursor count as hovered. */
const HOVER_RADIUS = 0.15;

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
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

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

  const kdTree = useMemo(() => {
    if (points.length === 0) return null;
    return buildKDTreeFromPoints(points);
  }, [points]);

  useFrame(() => {
    if (points.length === 0 || !kdTree || !planeRef.current) return;
    raycaster.current.setFromCamera(mouse.current, camera);
    const hits = raycaster.current.intersectObject(planeRef.current);
    const hit = hits[0];
    if (!hit) return;
    const nn = kdTree.nearestNeighbor(hit.point.x, hit.point.y);
    if (!nn) return;
    const dx = hit.point.x - nn.x;
    const dy = hit.point.y - nn.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= HOVER_RADIUS * HOVER_RADIUS) {
      setHoveredId(String(nn.id));
    } else {
      setHoveredId(null);
    }
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
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoveredId(null)}
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
        return (
          <mesh position={[p.coords_2d[0], p.coords_2d[1], 0]}>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshBasicMaterial color="#fbbf24" transparent opacity={0.9} />
          </mesh>
        );
      })()}
    </>
  );
}
