import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Instance, Instances, OrbitControls, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import { fileUrl } from '../api.js';
import { captureCrop, usePlaceHandler } from '../lib/placing.js';
import Creature from './Creature.jsx';
import { useDisplay } from '../lib/display.js';

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

// ---- Panorama and photo rooms ----

// A flat photo (e.g. a campus building) is shown as a curved window this wide (radians) in front
// of you. Keep in sync with PHOTO_FOV in backend/app/studio/panorama.py.
const PHOTO_FOV = 1.75;

// Phone panoramas rarely line up where the two ends meet, so turning around showed a hard jump.
// This blends both ends into their blurred average over the last few percent of the photo
// (textureLod reads a small mipmap = a blurred copy). A panorama that doesn't cover the whole
// sphere also fades its top and bottom edges into the room color instead of cutting off.
const ROOM_DAY = '#F3E3C8';
const ROOM_NIGHT = '#16203A';
const ROOM_COLOR = new THREE.Color(ROOM_DAY);
// A flat photo fades out on all four sides instead.
function softenEdges(shader, partial, photo) {
  shader.uniforms.edgeColor = { value: ROOM_COLOR };
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', 'uniform vec3 edgeColor;\nvoid main() {')
    .replace('#include <map_fragment>', photo ? `
      #ifdef USE_MAP
        vec4 texel = texture2D( map, vMapUv );
        float edge = min( min( vMapUv.x, 1.0 - vMapUv.x ), min( vMapUv.y, 1.0 - vMapUv.y ) );
        texel.rgb = mix( edgeColor, texel.rgb, texel.a * smoothstep( 0.0, 0.04, edge ) );
        texel.a = 1.0;
        diffuseColor *= texel;
      #endif` : `
      #ifdef USE_MAP
        vec4 texel = texture2D( map, vMapUv );
        float seamDistance = min( vMapUv.x, 1.0 - vMapUv.x );
        if ( seamDistance < 0.025 ) {
          vec4 seam = 0.5 * ( textureLod( map, vec2( 0.003, vMapUv.y ), 5.0 ) + textureLod( map, vec2( 0.997, vMapUv.y ), 5.0 ) );
          texel = mix( seam, texel, smoothstep( 0.0, 0.025, seamDistance ) );
        }
        ${partial ? 'texel.rgb = mix( edgeColor, texel.rgb, smoothstep( 0.0, 0.06, min( vMapUv.y, 1.0 - vMapUv.y ) ) );' : ''}
        diffuseColor *= texel;
      #endif`);
}
// Wraps the photo around the camera on the inside of a sphere.
// A 360° photo sphere is 2:1 and covers the whole sphere. A wider phone
// panorama (e.g. 6:1) still goes all the way around but only covers a band
// around the horizon: its height on the sphere is 360° × height/width.
function PanoramaRoom({ url, photo, onPlace }) {
  const texture = useLoader(THREE.TextureLoader, url);
  texture.colorSpace = THREE.SRGBColorSpace;
  const placeHandlers = usePlaceHandler(onPlace, (e) => ({
    direction: e.point.clone().normalize().toArray(),
  }));

  const { width, height } = texture.image;
  // Panoramas go all the way around; a photo is a window in front of you (centered on -z).
  const horizontalAngle = photo ? PHOTO_FOV : Math.PI * 2;
  const startAngle = photo ? 1.5 * Math.PI - PHOTO_FOV / 2 : 0;
  const verticalAngle = photo
    ? Math.min(Math.PI * 0.9, (PHOTO_FOV * height) / width)
    : Math.min(Math.PI, (2 * Math.PI * height) / width);
  const topAngle = (Math.PI - verticalAngle) / 2; // center the band on the horizon
  const partial = verticalAngle < Math.PI - 0.01;

  return (
    // scale x = -1 mirrors the sphere so the photo isn't backwards when seen from inside.
    <mesh scale={[-1, 1, 1]} {...placeHandlers} userData={{ room: true }}>
      <sphereGeometry args={[PANO_RADIUS, 64, 32, startAngle, horizontalAngle, topAngle, verticalAngle]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} customProgramCacheKey={() => `pano-${partial}-${photo}`}
        onBeforeCompile={(shader) => softenEdges(shader, partial, photo)} />
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

// Pointer events on a sprite stay on the sprite. Without this they bubble down to the
// 3D scene too, so clicking an egg also planted a new egg (or started dragging the view).
const keepToSprite = (e) => e.stopPropagation();

// The room (panorama sphere or scan) under a point on the screen, like a click would hit it.
const isRoom = (object) => object && (object.userData.room || isRoom(object.parent));
function roomHit({ camera, gl, scene, raycaster }, clientX, clientY) {
  const rect = gl.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObjects(scene.children, true).find((hit) => isRoom(hit.object));
}

// Build mode: press on a friend to pick it up, move it, and let go to put it down. A press that
// doesn't move is a click (opens its card). While held, onDrag(spot) shows it where it is right now
// (null when it's put down); letting go calls onMove with a placement, as a click would make.
const HOLD_MS = 10;
function useSpotDrag(spot, onDrag, onMove, getState) {
  const moved = useRef(false); // the click that ends a move shouldn't open the card

  function onPointerDown(e) {
    e.stopPropagation();
    moved.current = false;
    if (!onMove || e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY };
    let held = false;
    let placement = null;
    const timer = setTimeout(() => {
      held = true;
      onDrag({ ...spot }); // lift it where it is
    }, HOLD_MS);

    const move = (ev) => {
      // A few pixels of wobble during a click isn't a move.
      if (!held || (!moved.current && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4)) return;
      const state = getState();
      const hit = roomHit(state, ev.clientX, ev.clientY);
      if (!hit) return; // off the photo's edge: stay at the last good spot
      moved.current = true;
      placement = spot.point
        ? { point: hit.point.toArray(), viewFrom: state.camera.position.toArray() }
        : { direction: hit.point.clone().normalize().toArray() };
      placement.at = { x: ev.clientX, y: ev.clientY };
      onDrag({ ...spot, direction: null, point: null, viewFrom: null, ...placement });
    };
    // Capture phase: the sprite stops its own pointerup from bubbling (keepToSprite), so a
    // bubbling listener would miss it and stay attached, then move this friend on the next drag.
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', done, true);
      if (held) onDrag(null);
    };
    const up = () => {
      done();
      if (!placement) return; // a click: nothing moved
      const { at, ...where } = placement;
      onMove(spot, { ...where, crop: captureCrop(getState().gl.domElement, at.x, at.y) });
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', done, true);
  }
  return { onPointerDown, wasMoved: () => moved.current };
}

// A creature pinned to its 3D spot, like a sprite that always faces you. The pins are plain HTML
// in one layer over the canvas; SpriteProjector moves them every frame to where their spot is on
// screen. (drei's <Html> made a separate React root per friend, which under React 19 sometimes
// left ghost copies behind or lost a friend.)
// Every 5th stop gets a gold tag, like memory athletes mark every 5th locus to keep count.
function FriendSprite({ friend, dragging, pinRef, getState, onClick, onDrag, onMove }) {
  const { spot, number, state, tag, active, picture } = friend;
  const drag = useSpotDrag(spot, onDrag, onMove, getState);
  return (
    <div className="sprite-pin" ref={pinRef}>
      <button
        className={`sprite ${state} ${active ? 'active' : ''} ${number % 5 === 0 ? 'fifth' : ''} ${onMove ? 'draggable' : ''} ${dragging ? 'dragging' : ''}`}
        style={{ animationDelay: `${((number * 0.37) % 3).toFixed(2)}s` }}
        onPointerDown={drag.onPointerDown}
        onPointerUp={keepToSprite}
        onClick={(e) => { e.stopPropagation(); if (!drag.wasMoved()) onClick(); }}
        onContextMenu={(e) => onMove && e.preventDefault()}
        title={onMove ? 'Click to open · drag to move' : undefined}
        aria-label={`Friend ${number}`}
      >
        {picture && <img className="sprite-picture" src={picture} alt="" />}
        {state === 'sleepy' && <span className="zzz">z z z</span>}
        {state === 'asking' && <span className="ask">?</span>}
        {state === 'happy' && <Star />}
        <Creature number={number} state={state} size={active || state === 'asking' ? 'lg' : 'md'} />
        <span className="tag">{tag}</span>
      </button>
    </div>
  );
}

// Inside the canvas: every frame, put each friend's pin where its 3D spot is on screen, hide the
// ones behind you, and stack nearer friends on top. Also hands the R3F state to code outside.
function SpriteProjector({ friends, pins, stateRef }) {
  const get = useThree((s) => s.get);
  stateRef.current = get;
  const v = new THREE.Vector3();
  const toSpot = new THREE.Vector3();
  const forward = new THREE.Vector3();
  useFrame(({ camera, size }) => {
    camera.getWorldDirection(forward);
    for (const { spot } of friends) {
      const el = pins.current.get(spot.id);
      if (!el) continue;
      const position = spotPosition(spot);
      toSpot.copy(position).sub(camera.position);
      if (toSpot.dot(forward) <= 0) {
        el.style.visibility = 'hidden';
        continue;
      }
      v.copy(position).project(camera);
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      el.style.visibility = 'visible';
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      el.style.zIndex = String(1000 - Math.round(toSpot.length() * 10));
    }
  });
  return null;
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
// Wander: where on screen the friend should land so the friend card doesn't cover it, as -1 (left
// edge) .. 1 (right edge): right next to the card, on the side with more open space, with room for
// the friend's picture. 0 = straight ahead.
const CARD_WIDTH = 360; // .float-card, for the moment before the card is on the page
const CARD_RIGHT = 28;
const NEXT_TO_CARD = 110; // px from the card's edge to the friend's middle (half its 150px picture + a gap)
function besideCard(viewerEl) {
  const frameEl = viewerEl?.parentElement;
  if (!frameEl) return 0;
  const frame = frameEl.getBoundingClientRect();
  const card = frameEl.querySelector('.movable-card')?.getBoundingClientRect()
    ?? { left: frame.right - CARD_RIGHT - CARD_WIDTH, right: frame.right - CARD_RIGHT };
  const openLeft = card.left - frame.left;
  const openRight = frame.right - card.right;
  // Next to the card; if the open space is too narrow for that, its middle.
  const center = openLeft >= openRight
    ? Math.max(card.left - NEXT_TO_CARD, frame.left + openLeft / 2)
    : Math.min(card.right + NEXT_TO_CARD, card.right + openRight / 2);
  return Math.max(-0.85, Math.min(0.85, ((center - frame.left) / frame.width) * 2 - 1));
}

const UP = new THREE.Vector3(0, 1, 0);

// aim(): where the friend should land on screen (see besideCard); 0 or missing = centered.
function CameraRig({ focus, walk, aim }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const goal = useRef(null);
  const keys = useRef(new Set());
  const focusRef = useRef(focus);
  focusRef.current = focus;

  const aimRef = useRef(aim);
  aimRef.current = aim;

  // Start a turn when the focused spot changes (by id, so data updates don't re-trigger it).
  // With aim, the camera looks a little to the side so the friend lands beside the card.
  useEffect(() => {
    if (!focusRef.current) return;
    const view = spotView(focusRef.current);
    const at = aimRef.current?.() ?? 0;
    if (at) {
      const halfWidth = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
      // Turn around the camera's own up (not the world's), so a friend below eye level lands
      // exactly where aimed instead of drifting farther to the side.
      const right = new THREE.Vector3().crossVectors(view.look, UP).normalize();
      const up = new THREE.Vector3().crossVectors(right, view.look).normalize();
      view.look.applyAxisAngle(up, Math.atan(at * halfWidth));
    }
    goal.current = { ...view, started: performance.now() };
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
// onMoveFriend(spot, placement): set when friends can be dragged to a new spot (Build).
// onRoomClick: a click on the room itself when not placing (Wander closes the friend's card).
// avoidCard (Wander): turn to friends so they land beside the friend card, not under it.
export default function Viewer({ palaceId, room, friends: placed, focusSpot, visitedUpTo = 0, onPlace, onRoomClick, onFriendClick, onMoveFriend, avoidCard = false }) {
  // The space around a room (and the fade at photo edges) follows night mode.
  const [{ night }] = useDisplay();
  const roomColor = night ? ROOM_NIGHT : ROOM_DAY;
  ROOM_COLOR.set(roomColor); // shared with the panorama shader's edge fade
  const [splatMessage, setSplatMessage] = useState(null);
  const [dragSpot, setDragSpot] = useState(null); // the friend being dragged, where it is right now
  const pins = useRef(new Map()); // spot id -> its pin element (see SpriteProjector)
  const stateRef = useRef(null); // R3F's get(), for dragging from outside the canvas
  const viewerRef = useRef(null);
  const url = fileUrl(palaceId, room.file);
  const panorama = room.type !== 'splat';
  // A click on the room places a spot (Build) or, if not placing, is just a click (onRoomClick).
  const roomClick = onPlace ?? (onRoomClick && (() => onRoomClick()));
  const friends = dragSpot
    ? placed.map((f) => (f.spot.id === dragSpot.id ? { ...f, spot: dragSpot } : f))
    : placed;

  return (
    <div className={`viewer-canvas ${onPlace ? 'placing' : ''}`} ref={viewerRef}>
      <Canvas
        camera={{ fov: 75, near: 0.005, far: 1000, position: [0, 0, 0] }}
        gl={{ preserveDrawingBuffer: true }}
      >
        <color attach="background" args={[roomColor]} />
        <Suspense fallback={null}>
          {panorama
            ? <PanoramaRoom url={url} photo={room.type === 'photo'} onPlace={roomClick} />
            : <SplatRoom url={url} flipped={room.flipped} onPlace={roomClick} onStatus={setSplatMessage} />}
        </Suspense>
        <TrailDots friends={friends} panorama={panorama} visitedUpTo={visitedUpTo} />
        <SpriteProjector friends={friends} pins={pins} stateRef={stateRef} />
        {/* Negative speed: dragging feels like grabbing the room. */}
        <OrbitControls makeDefault target={START_TARGET} enableZoom={false} enablePan={false} rotateSpeed={-0.35} />
        <CameraRig focus={focusSpot} walk={!panorama} aim={avoidCard ? () => besideCard(viewerRef.current) : undefined} />
      </Canvas>
      <div className="sprite-layer">
        {friends.map((friend) => (
          <FriendSprite key={friend.spot.id} friend={friend} dragging={dragSpot?.id === friend.spot.id}
            pinRef={(el) => (el ? pins.current.set(friend.spot.id, el) : pins.current.delete(friend.spot.id))}
            getState={() => stateRef.current()}
            onClick={() => onFriendClick?.(friend.spot)} onDrag={setDragSpot} onMove={onMoveFriend} />
        ))}
      </div>
      <LoadingOverlay message={splatMessage} />
      {!panorama && <div className="walk-hint">Drag to look · WASD to walk · Q/E down/up</div>}
    </div>
  );
}
