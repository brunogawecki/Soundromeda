import { useCallback, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useAppStore } from './store/useAppStore';
import { useToneStart } from './useTone';
import { Scene } from './components/Scene';
import { UploadPanel } from './components/UploadPanel';
import './App.css';

function App() {
  useAppStore(); // wire Zustand into the tree
  const startTone = useToneStart();
  const hoveredName = useAppStore((s) => s.hoveredName);

  const onInteraction = useCallback(() => {
    startTone();
  }, [startTone]);

  useEffect(() => {
    window.addEventListener('click', onInteraction, { once: true });
    return () => window.removeEventListener('click', onInteraction);
  }, [onInteraction]);

  return (
    <div className="app">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 50 }}
        gl={{ antialias: true }}
      >
        <Scene />
        <OrbitControls />
      </Canvas>
      {hoveredName != null && (
        <div className="sound-tooltip" aria-live="polite">
          {hoveredName}
        </div>
      )}
      <UploadPanel />
    </div>
  );
}

export default App;
