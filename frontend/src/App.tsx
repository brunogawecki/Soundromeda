import { useCallback, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useAppStore } from './store/useAppStore';
import { useToneStart } from './useTone';
import { Scene } from './components/Scene';
import { SettingsPanel } from './components/SettingsPanel';
import './App.css';

function App() {
  useAppStore(); // wire Zustand into the tree
  const startTone = useToneStart();
  const hoveredName = useAppStore((s) => s.hoveredName);
  const pointerX = useAppStore((s) => s.pointerX);
  const pointerY = useAppStore((s) => s.pointerY);
  const hoverTooltipMode = useAppStore((s) => s.hoverTooltipMode);

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
      <Canvas
        camera={{ position: [0, 0, 5], fov: 50 }}
        gl={{ antialias: true }}
      >
        <Scene />
        <OrbitControls />
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
