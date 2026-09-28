import * as THREE from 'three';

const SKY_RADIUS = 180;
const ZENITH_COLOR = new THREE.Color(0x05070d);
/** Matches GameManager's fog color exactly, so the dome's lower edge blends
 * into the fogged distance with no visible seam at the horizon. */
const HORIZON_COLOR = new THREE.Color(0x0b0f1a);
const STAR_COUNT = 420;

/**
 * A vertex-colored gradient sky dome plus a scattered starfield - the scene
 * previously used a single flat background color, which reads as an empty
 * void above the fog line rather than a night sky. Purely procedural (no
 * new asset dependency, negligible added bundle/runtime cost): one big
 * inverted sphere and one Points cloud.
 */
export function buildSky(scene: THREE.Scene): void {
  const geometry = new THREE.SphereGeometry(SKY_RADIUS, 24, 16);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    const y = geometry.attributes.position.getY(i) / SKY_RADIUS; // -1..1
    // Only the upper hemisphere is ever really seen (camera pitch is
    // clamped well above looking straight down) - bias the gradient so
    // most of the visible sky already reads as "night" rather than
    // spending half the lerp range on a horizon band the camera won't
    // reach.
    const t = Math.max(0, y) ** 0.6;
    color.copy(HORIZON_COLOR).lerp(ZENITH_COLOR, t);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const dome = new THREE.Mesh(geometry, material);
  dome.renderOrder = -1;
  scene.add(dome);

  scene.add(buildStars());
}

function buildStars(): THREE.Points {
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    // Random point on the upper hemisphere of a slightly smaller radius
    // than the sky dome, so stars never clip through it.
    const radius = SKY_RADIUS * 0.95;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.85); // biased toward the pole - avoids clustering at the unreachable horizon
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xdfe6ff,
    size: 1.6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.8,
    fog: false,
    depthWrite: false,
  });
  const stars = new THREE.Points(geometry, material);
  stars.renderOrder = -1;
  return stars;
}
