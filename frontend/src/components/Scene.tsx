import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAppStore } from '../store/useAppStore';
import type { SoundPoint } from '../types/sounds';
import { buildKDTreeFromPoints } from '../utils/kdTree';
import * as THREE from 'three';

const API_BASE = '';

/** Visual-only test points when API returns none (no audio). */
const TEST_POINTS: SoundPoint[] = [
  { id: 't1', coords_2d: [0, 0], name: 'Center', audioUrl: '' },
  { id: 't2', coords_2d: [1.2, 0], name: 'East', audioUrl: '' },
  { id: 't3', coords_2d: [-1, 0.5], name: 'West', audioUrl: '' },
  { id: 't4', coords_2d: [0.3, 1], name: 'North', audioUrl: '' },
  { id: 't5', coords_2d: [-0.5, -0.8], name: 'South', audioUrl: '' },
  { id: 't6', coords_2d: [0.8, 0.7], name: 'NE', audioUrl: '' },
  { id: 't7', coords_2d: [-0.7, -0.3], name: 'SW', audioUrl: '' },
  { id: 't8', coords_2d: [0.6, -0.5], name: 'SE', audioUrl: '' },
  { id: 't9', coords_2d: [-0.9, 0.6], name: 'NW', audioUrl: '' },
  { id: 't10', coords_2d: [1.5, -0.4], name: 'Far East', audioUrl: '' },
];

async function fetchAllPoints(): Promise<SoundPoint[]> {
  try {
    const [builtin, user] = await Promise.all([
      fetch(`${API_BASE}/api/sounds?source=builtin`).then((r) => r.json()),
      fetch(`${API_BASE}/api/sounds?source=user`).then((r) => r.json()),
    ]);
    const builtinPoints = builtin.points ?? [];
    const userPoints = user.points ?? [];
    const all = [...builtinPoints, ...userPoints];
    return all.length >= 2 ? all : TEST_POINTS;
  } catch {
    return TEST_POINTS;
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
  }, []);

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
      pos[i * 3] = p.coords_2d[0];
      pos[i * 3 + 1] = p.coords_2d[1];
      pos[i * 3 + 2] = 0;
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
