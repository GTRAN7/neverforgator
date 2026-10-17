import { useThree } from '@react-three/fiber';

// Cut a square out of the rendered view around where the user clicked. We keep
// it as the spot's thumbnail, let Gemini name the object, and use it as the
// reference photo for the spot's image. (Needs preserveDrawingBuffer on the Canvas.)
export function captureCrop(canvas, clientX, clientY, outSize = 384) {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = canvas.width / rect.width;
  const size = Math.round(Math.min(canvas.width, canvas.height) * 0.5);
  const clamp = (v, max) => Math.max(0, Math.min(max, v));
  const sx = clamp((clientX - rect.left) * pixelRatio - size / 2, canvas.width - size);
  const sy = clamp((clientY - rect.top) * pixelRatio - size / 2, canvas.height - size);

  const out = document.createElement('canvas');
  out.width = out.height = outSize;
  out.getContext('2d').drawImage(canvas, sx, sy, size, size, 0, 0, outSize, outSize);
  return out.toDataURL('image/jpeg', 0.85);
}

// Click handler for a room's 3D object. `toSpot(event)` says where the spot is
// (a direction for panoramas, a 3D point for splats); we add the crop.
export function usePlaceHandler(onPlace, toSpot) {
  const gl = useThree((s) => s.gl);
  return (event) => {
    if (!onPlace || event.delta > 4) return; // that was a drag to look around, not a click
    event.stopPropagation();
    const { clientX, clientY } = event.nativeEvent;
    onPlace({ ...toSpot(event), crop: captureCrop(gl.domElement, clientX, clientY) });
  };
}
