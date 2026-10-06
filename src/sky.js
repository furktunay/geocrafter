import * as THREE from 'three';
import { PHOTO_GLSL } from './materials.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww; // always at the far plane
}
`;

const FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uGlow;
uniform float uNight;
uniform float uPhoto;
varying vec3 vDir;
${PHOTO_GLSL}

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// square disc around an axis, Minecraft style
float square(vec3 d, vec3 axis, float size) {
  vec3 a = normalize(cross(axis, vec3(0.0, 0.0, 1.0)));
  vec3 b = cross(axis, a);
  float front = step(0.0, dot(d, axis));
  return front * step(max(abs(dot(d, a)), abs(dot(d, b))), size);
}

void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
  float toSun = max(dot(d, uSunDir), 0.0);
  col += uGlow * (pow(toSun, 6.0) * 0.45 + pow(toSun, 60.0) * 0.4) * (1.0 - h * 0.6);
  // stars
  vec3 g = floor(d * 160.0);
  float star = step(0.9965, hash(g)) * uNight * smoothstep(0.02, 0.25, d.y);
  col += vec3(star) * (0.5 + 0.5 * hash(g + 3.0));
  col = mix(col, vec3(1.0, 0.97, 0.85), square(d, uSunDir, 0.055) * (1.0 - uNight * 0.999));
  col = mix(col, vec3(0.86, 0.9, 0.98), square(d, -uSunDir, 0.04) * uNight);
  // street panorama as the backdrop: everything the hidden geometry does not cover
  float wa = uPano.x * (1.0 - uPano.z);
  float wb = uPano.y * uPano.z;
  float w = wa + wb;
  if (w > 0.001) {
    vec3 pa = equirect(uPanoA, uPatchA, uPatchOn.x, uRotA * d);
    vec3 pb = equirect(uPanoB, uPatchB, uPatchOn.y, uRotB * d);
    col = mix(col, (pa * wa + pb * wb) / w, min(w, 1.0) * uPhoto);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const DAY_ZENITH = new THREE.Color(0.22, 0.5, 0.93);
const DAY_HORIZON = new THREE.Color(0.7, 0.84, 0.97);
const NIGHT_ZENITH = new THREE.Color(0.006, 0.01, 0.035);
const NIGHT_HORIZON = new THREE.Color(0.045, 0.06, 0.12);
const DUSK = new THREE.Color(0.98, 0.52, 0.28);

export class Sky {
  constructor(scene, materials) {
    const uniforms = materials.uniforms;
    this.chunkUniforms = uniforms;
    this.hour = 11;
    this.running = false; // the photos are daytime, so the clock stands still
    this.dayMinutes = 24; // real minutes per in-game day
    this.uniforms = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uGlow: { value: new THREE.Color() },
      uNight: { value: 0 },
      uPhoto: uniforms.uPhoto,
      ...materials.pano,
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);
  }

  update(dt, fogFar) {
    if (this.running) this.hour = (this.hour + (dt / 60 / this.dayMinutes) * 24) % 24;
    const a = ((this.hour - 6) / 12) * Math.PI; // 0 at sunrise, pi at sunset
    const elev = Math.sin(a);
    // sun travels east -> south -> west
    this.uniforms.uSunDir.value.set(Math.cos(a), elev, 0.35).normalize();
    const day = THREE.MathUtils.smoothstep(elev, -0.14, 0.22);
    const dusk = Math.exp(-((elev / 0.22) ** 2));
    const u = this.uniforms;
    u.uZenith.value.copy(NIGHT_ZENITH).lerp(DAY_ZENITH, day);
    u.uHorizon.value.copy(NIGHT_HORIZON).lerp(DAY_HORIZON, day).lerp(DUSK, dusk * 0.55);
    u.uGlow.value.copy(DUSK).multiplyScalar(dusk).lerp(new THREE.Color(1, 1, 0.9), day * 0.5);
    u.uNight.value = 1 - day;

    const cu = this.chunkUniforms;
    cu.uDay.value = day;
    cu.uFogColor.value.copy(u.uHorizon.value);
    cu.uFogFar.value = fogFar;
    cu.uFogNear.value = fogFar * 0.3;
    return day;
  }

  clock() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
