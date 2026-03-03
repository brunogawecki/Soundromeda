import { useCallback, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from './store/useAppStore';
import { DAMPING_FACTOR_2D, DAMPING_FACTOR_3D, MIN_2D_ZOOM, MAX_2D_ZOOM } from './config';
import { useToneStart } from './useTone';
import { Scene } from './components/Scene';
import { SettingsPanel } from './components/SettingsPanel';
import './App.css';

/** Lerp speed for orbit target animation (higher = faster). */
const ORBIT_TARGET_LERP_SPEED = 3;

function AnimatedOrbitControls() {
  const controlsRef = useRef<React.ComponentRef<typeof OrbitControls> | null>(null);
  const orbitTarget = useAppStore((s) => s.orbitTarget);
  const viewMode = useAppStore((s) => s.viewMode);
  const desiredTarget = useRef(new THREE.Vector3(orbitTarget[0], orbitTarget[1], orbitTarget[2]));

  useFrame((_, delta) => {
    const controls = controlsRef.current as unknown as { target: THREE.Vector3 } | null;
    if (!controls?.target) return;
    // In 2D mode, let OrbitControls handle panning directly without lerp fighting it.
    if (viewMode === '2d') return;
    desiredTarget.current.set(orbitTarget[0], orbitTarget[1], orbitTarget[2]);
    controls.target.lerp(desiredTarget.current, 1 - Math.exp(-ORBIT_TARGET_LERP_SPEED * delta));
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableRotate={viewMode === '3d'}
      screenSpacePanning
      enableDamping
      dampingFactor={viewMode === '2d' ? DAMPING_FACTOR_2D : DAMPING_FACTOR_3D}
      mouseButtons={viewMode === '2d' ? {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      } : undefined}
      minZoom={viewMode === '2d' ? MIN_2D_ZOOM : undefined}
      maxZoom={viewMode === '2d' ? MAX_2D_ZOOM : undefined}
    />
  );
}

function App() {
  useAppStore(); // wire Zustand into the tree
  const startTone = useToneStart();
  const hoveredName = useAppStore((s) => s.hoveredName);
  const pointerX = useAppStore((s) => s.pointerX);
  const pointerY = useAppStore((s) => s.pointerY);
  const hoverTooltipMode = useAppStore((s) => s.hoverTooltipMode);
  const viewMode = useAppStore((s) => s.viewMode);

  const onInteraction = useCallback(() => {
    startTone();
  }, [startTone]);

  useEffect(() => {
    window.addEventListener('click', onInteraction, { once: true });
    return () => window.removeEventListener('click', onInteraction);
  }, [onInteraction]);

  const showFollowTooltip = hoveredName != null && pointerX != null && pointerY != null && hoverTooltipMode === 'follow';
  const showFixedTooltip = hoveredName != null && hoverTooltipMode === 'fixed';

  return (
    <div className="app">
      <Canvas gl={{ antialias: true, alpha: false }}>
        <color attach="background" args={['#0c0c0e']} />
        {viewMode === '3d' ? (
          <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={50} />
        ) : (
          <OrthographicCamera makeDefault position={[0, 0, 100]} zoom={50} />
        )}
        <Scene />
        <AnimatedOrbitControls />
      </Canvas>
      {showFollowTooltip && (
        <div
          className="sound-tooltip sound-tooltip-follow"
          style={{ left: pointerX, top: pointerY }}
          aria-live="polite"
        >
          {hoveredName}
        </div>
      )}
      {showFixedTooltip && (
        <div className="sound-tooltip sound-tooltip-fixed" aria-live="polite">
          {hoveredName}
        </div>
      )}
      <SettingsPanel />
    </div>
  );
}

export default App;
