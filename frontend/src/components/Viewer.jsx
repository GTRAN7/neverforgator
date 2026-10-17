import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Html, Instance, Instances, OrbitControls, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import { fileUrl } from '../api.js';
import { usePlaceHandler } from '../lib/placing.js';
import Creature from './Creature.jsx';

// The splat renderer is big, so it only downloads when a splat room is opened.
const SplatRoom = lazy(() => import('./SplatRoom.jsx'));

const PANO_RADIUS = 50;
const MARKER_RADIUS = 40; // markers float a little in front of the photo
const LOOK_DISTANCE = 0.01; // the orbit target sits just in front of the camera, so dragging = turning your head
const START_TARGET = [0, 0, -LOOK_DISTANCE];

// Where a spot's marker is drawn.
function spotPosition(spot) {
  return spot.point
    ? new THREE.Vector3(...spot.point)
    : new THREE.Vector3(...spot.direction).setLength(MARKER_RADIUS);
}

// Where the camera stands, and which way it faces, to look at a spot.
function spotView(spot) {
  if (spot.direction) {
    return { position: new THREE.Vector3(0, 0, 0), look: new THREE.Vector3(...spot.direction).normalize() };
  }
  const position = new THREE.Vector3(...spot.viewFrom);
  return { position, look: new THREE.Vector3(...spot.point).sub(position).normalize() };
}

// ---- Panorama room ----
// Wraps the photo around the camera on the inside of a sphere.
// A 360° photo sphere is 2:1 and covers the whole sphere. A wider phone
// panorama (e.g. 6:1) still goes all the way around but only covers a band
// around the horizon: its height on the sphere is 360° × height/width.
function PanoramaRoom({ url, onPlace }) {
  const texture = useLoader(THREE.TextureLoader, url);
  texture.colorSpace = THREE.SRGBColorSpace;
  const handleClick = usePlaceHandler(onPlace, (e) => ({
    direction: e.point.clone().normalize().toArray(),
  }));

  const { width, height } = texture.image;
  const verticalAngle = Math.min(Math.PI, (2 * Math.PI * height) / width);
  const topAngle = (Math.PI - verticalAngle) / 2; // center the band on the horizon

  return (
    // scale x = -1 mirrors the sphere so the photo isn't backwards when seen from inside.
    <mesh scale={[-1, 1, 1]} onClick={handleClick}>
      <sphereGeometry args={[PANO_RADIUS, 64, 32, 0, Math.PI * 2, topAngle, verticalAngle]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} />
    </mesh>
  );
}

// ---- Friends (spots) and the dotted trail between them ----

function Star() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD86B" stroke="#3B2A1E" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z" />
    </svg>
  );
}

// A creature pinned to its 3D spot. It's HTML anchored in the 3D scene, so it
// follows the room as you look around and always faces you, like a sprite.
function FriendSprite({ friend, onClick }) {
  const { spot, number, state, tag, active } = friend;
  return (
    <Html position={spotPosition(spot)} center zIndexRange={[50, 0]}>
      <button
        className={`sprite ${state} ${active ? 'active' : ''}`}
        style={{ animationDelay: `${((number * 0.37) % 3).toFixed(2)}s` }}
        onClick={onClick}
        aria-label={`Friend ${number}`}
      >
        {state === 'sleepy' && <span className="zzz">z z z</span>}
        {state === 'asking' && <span className="ask">?</span>}
        {state === 'happy' && <Star />}
        <Creature number={number} state={state} size={active || state === 'asking' ? 'lg' : 'md'} />
        <span className="tag">{tag}</span>
      </button>
    </Html>
  );
}

// Little 3D dots from each friend to the next. Dots you've already walked are darker.
const TRAIL_VISITED = '#B04A2E';
const TRAIL_AHEAD = '#FFFDF7';

function TrailDots({ friends, panorama, visitedUpTo }) {
  const spacing = panorama ? 1.6 : 0.09;
  const dots = [];
  for (let i = 1; i < friends.length; i++) {
    const prev = friends[i - 1];
    const next = friends[i];
    if (next.number !== prev.number + 1) continue; // not consecutive stops
    const a = spotPosition(prev.spot);
    const b = spotPosition(next.spot);
    const steps = Math.max(2, Math.round(a.distanceTo(b) / spacing));
    for (let j = 1; j < steps; j++) {
      const position = a.clone().lerp(b, j / steps);
      if (panorama) position.setLength(MARKER_RADIUS); // curve along the sphere
      dots.push({ key: `${next.spot.id}-${j}`, position, visited: next.number <= visitedUpTo });
    }
  }
  return (
    <Instances limit={3000} range={dots.length}>
      <sphereGeometry args={[panorama ? 0.32 : 0.016, 12, 8]} />
      <meshBasicMaterial toneMapped={false} />
      {dots.map((d) => (
        <Instance key={d.key} position={d.position} color={d.visited ? TRAIL_VISITED : TRAIL_AHEAD} />
      ))}
    </Instances>
  );
}

// ---- Camera ----
// Smoothly turns (and for splats, moves) the camera to the focused spot.
// In splat rooms, WASD walks and Q/E go down/up.
function CameraRig({ focus, walk }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const goal = useRef(null);
  const keys = useRef(new Set());
  const focusRef = useRef(focus);
  focusRef.current = focus;

  // Start a turn when the focused spot changes (by id, so data updates don't re-trigger it).
  useEffect(() => {
    if (focusRef.current) goal.current = { ...spotView(focusRef.current), started: performance.now() };
  }, [focus?.id]);

  // Grabbing the view cancels the animation.
  useEffect(() => {
    if (!controls) return;
    const cancel = () => { goal.current = null; };
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener('start', cancel);
  }, [controls]);

  useEffect(() => {
    if (!walk) return;
    const typing = (e) => ['INPUT', 'TEXTAREA'].includes(e.target.tagName);
    const down = (e) => { if (!typing(e)) keys.current.add(e.key.toLowerCase()); };
    const up = (e) => keys.current.delete(e.key.toLowerCase());
    const clear = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, [walk]);

  useFrame((_, dt) => {
    if (!controls) return;
    const look = controls.target.clone().sub(camera.position).normalize();
    const k = keys.current;

    if (goal.current) {
      const t = 1 - Math.exp(-dt * 5); // ease out
      camera.position.lerp(goal.current.position, t);
      look.lerp(goal.current.look, t).normalize();
      if (performance.now() - goal.current.started > 1500) goal.current = null;
    } else if (walk && k.size) {
      const right = new THREE.Vector3().crossVectors(look, camera.up).normalize();
      const move = new THREE.Vector3();
      if (k.has('w')) move.add(look);
      if (k.has('s')) move.sub(look);
      if (k.has('d')) move.add(right);
      if (k.has('a')) move.sub(right);
      if (k.has('e')) move.y += 1;
      if (k.has('q')) move.y -= 1;
      camera.position.addScaledVector(move.normalize(), dt * (k.has('shift') ? 3 : 1.2));
    } else {
      return;
    }
    controls.target.copy(camera.position).addScaledVector(look, LOOK_DISTANCE);
    controls.update();
  });
  return null;
}

function LoadingOverlay({ message }) {
  const { active } = useProgress();
  const text = active ? 'Loading room…' : message;
  return text ? <div className="viewer-loading">{text}</div> : null;
}

// ---- The viewer ----
// friends: [{ spot, number, state, tag, active }] for this room (see PalaceEditor).
// onPlace: set only while placing spots. visitedUpTo: trail is "walked" up to this friend number.
export default function Viewer({ palaceId, room, friends, focusSpot, visitedUpTo = 0, onPlace, onFriendClick }) {
  const [splatMessage, setSplatMessage] = useState(null);
  const url = fileUrl(palaceId, room.file);
  const panorama = room.type !== 'splat';

  return (
    <div className={`viewer-canvas ${onPlace ? 'placing' : ''}`}>
      <Canvas
        camera={{ fov: 75, near: 0.005, far: 1000, position: [0, 0, 0] }}
        gl={{ preserveDrawingBuffer: true }}
      >
        <color attach="background" args={['#F3E3C8']} />
        <Suspense fallback={null}>
          {panorama
            ? <PanoramaRoom url={url} onPlace={onPlace} />
            : <SplatRoom url={url} flipped={room.flipped} onPlace={onPlace} onStatus={setSplatMessage} />}
        </Suspense>
        <TrailDots friends={friends} panorama={panorama} visitedUpTo={visitedUpTo} />
        {friends.map((friend) => (
          <FriendSprite key={friend.spot.id} friend={friend} onClick={() => onFriendClick?.(friend.spot)} />
        ))}
        {/* Negative speed: dragging feels like grabbing the room. */}
        <OrbitControls makeDefault target={START_TARGET} enableZoom={false} enablePan={false} rotateSpeed={-0.35} />
        <CameraRig focus={focusSpot} walk={!panorama} />
      </Canvas>
      <LoadingOverlay message={splatMessage} />
      {!panorama && <div className="walk-hint">Drag to look · WASD to walk · Q/E down/up</div>}
    </div>
  );
}
