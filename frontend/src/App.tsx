import { useCallback, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useAppStore } from './store/useAppStore';
import { useToneStart } from './useTone';
import { Scene } from './components/Scene';
import './App.css';

function App() {
  useAppStore(); // wire Zustand into the tree
  const startTone = useToneStart();

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
    </div>
  );
}

export default App;
