import { useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { usePlaceHandler } from '../lib/placing.js';

// A Gaussian splat scan (Polycam / Scaniverse export: .ply, .spz, .splat ...),
// rendered with Spark. Spots here are 3D points, plus where the camera stood.
export default function SplatRoom({ url, flipped, onPlace, onStatus }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const getState = useThree((s) => s.get);
  const [spark, setSpark] = useState(null);
  const [splat, setSplat] = useState(null);
  const loaded = useRef(false);

  // Scans put their origin wherever capture started (often the floor or a corner),
  // so stand in the middle of the scan instead, keeping the same viewing direction.
  function moveToCenter(mesh) {
    const { controls } = getState();
    if (!controls) return;
    mesh.updateMatrixWorld(true);
    const center = mesh.getBoundingBox(true).applyMatrix4(mesh.matrixWorld).getCenter(new THREE.Vector3());
    const look = controls.target.clone().sub(camera.position);
    camera.position.copy(center);
    controls.target.copy(center).add(look);
    controls.update();
  }

  // Created inside effects (not useMemo) so React's StrictMode double-mount can't
  // leave us holding an already-disposed scan.
  useEffect(() => {
    const renderer = new SparkRenderer({ renderer: gl });
    setSpark(renderer);
    return () => renderer.dispose();
  }, [gl]);

  useEffect(() => {
    let cancelled = false;
    const mesh = new SplatMesh({ url });
    mesh.rotation.x = flipped ? Math.PI : 0;
    setSplat(mesh);
    onStatus('Loading 3D scan…');
    mesh.initialized
      .then(() => {
        if (cancelled) return;
        loaded.current = true;
        onStatus(null);
        // Only if nothing has moved the camera yet (Wander may already be walking to a spot).
        if (camera.position.lengthSq() < 1e-8) moveToCenter(mesh);
      })
      .catch((err) => !cancelled && onStatus(`Could not load scan: ${err.message}`));
    return () => {
      cancelled = true;
      loaded.current = false;
      onStatus(null);
      mesh.dispose();
    };
  }, [url, onStatus]);

  // Flipping turns the scan over, so the old camera spot is now somewhere else.
  useEffect(() => {
    if (!splat) return;
    splat.rotation.x = flipped ? Math.PI : 0;
    if (loaded.current) moveToCenter(splat);
  }, [flipped, splat]);

  const handleClick = usePlaceHandler(onPlace, (e) => ({
    point: e.point.toArray(),
    viewFrom: camera.position.toArray(),
  }));

  if (!spark || !splat) return null;
  return (
    <>
      <primitive object={spark} />
      {/* Many exports are upside down; the room's "flip" setting turns it over (see the effect above). */}
      <primitive object={splat} onClick={handleClick} />
    </>
  );
}
