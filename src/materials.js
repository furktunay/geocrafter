import * as THREE from 'three';
import { buildTextures, TEX_SIZE } from './textures.js';

// Street photos are projected onto the world from the spot they were taken ("the photo skin").
// Two panoramas (A, B) can be active so moving between them cross-fades. A face takes the photo
// only where it was visible from the camera that took it (distance cube map of the unedited
// world) and only if the player has not touched it - so breaking a real surface shows ordinary
// blocks underneath, and placed blocks stay ordinary blocks.
// The ground patch of a panorama covers elevations from straight down to this (radians).
export const PATCH_TOP = (-10 * Math.PI) / 180;

export const PHOTO_GLSL = /* glsl */ `
uniform sampler2D uPanoA;
uniform sampler2D uPanoB;
uniform vec3 uPosA;
uniform vec3 uPosB;
uniform mat3 uRotA; // world direction -> panorama frame (+y up, image centre at -z)
uniform mat3 uRotB;
uniform vec3 uPano; // A available, B available, mix (0 = A, 1 = B)
uniform sampler2D uPatchA; // ground under the capturing vehicle, rebuilt from neighbouring photos
uniform sampler2D uPatchB;
uniform vec2 uPatchOn; // how far each patch has faded in

const float PATCH_TOP = ${PATCH_TOP.toFixed(7)};

vec3 equirect(sampler2D tex, sampler2D under, float patched, vec3 p) {
  float el = asin(clamp(p.y, -1.0, 1.0));
  vec2 uv = vec2(atan(p.x, -p.z) * 0.15915494 + 0.5, el * 0.31830989 + 0.5);
  vec3 c = texture(tex, uv).rgb;
  if (patched > 0.0 && el < PATCH_TOP) {
    vec4 f = texture(under, vec2(uv.x, (el + 1.5707963) / (PATCH_TOP + 1.5707963)));
    c = mix(c, f.rgb, f.a * patched); // the patch's alpha says where the vehicle was
  }
  return c;
}
`;

const VERT = /* glsl */ `
attribute vec4 aData; // texture layer, ao (0-3), flags (sky | glow << 1 | edited << 3), face direction
varying vec3 vUvl;
varying float vLight;
varying vec3 vFlags; // sky, glow, edited
varying float vDist;
varying vec3 vWorld;
varying vec3 vNormal;

const vec3 NORMALS[6] = vec3[6](vec3(1, 0, 0), vec3(-1, 0, 0), vec3(0, 1, 0), vec3(0, -1, 0), vec3(0, 0, 1), vec3(0, 0, -1));
const float SHADES[6] = float[6](0.72, 0.72, 1.0, 0.5, 0.86, 0.86);

void main() {
  int dir = int(aData.w + 0.5);
  vec2 uv = dir < 2 ? position.zy : dir < 4 ? position.xz : position.xy;
#ifdef FAR
  if (dir < 2 || dir > 3) uv *= 0.25; // facade textures span 4 m
#endif
  vUvl = vec3(uv, aData.x);
  vFlags = vec3(mod(aData.z, 2.0), mod(floor(aData.z * 0.5), 4.0), floor(aData.z * 0.125));
  vLight = SHADES[dir] * (0.5 + 0.5 * aData.y / 3.0);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = NORMALS[dir];
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray uTex;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uDay; // 1 = noon, 0 = night
uniform vec3 uClip; // x, z, radius: voxel chunks draw inside, far tiles outside
uniform float uPhoto; // strength of the photo skin, 0 = plain blocks
uniform samplerCube uDepthA;
uniform samplerCube uDepthB;
varying vec3 vUvl;
varying float vLight;
varying vec3 vFlags;
varying float vDist;
varying vec3 vWorld;
varying vec3 vNormal;
${PHOTO_GLSL}

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// rgb = photo colour, a = 1 where this fragment was visible from the panorama centre
vec4 photo(sampler2D tex, sampler2D under, float patched, samplerCube depth, vec3 pos, mat3 rot) {
  vec3 v = vWorld - pos;
  float d = length(v);
  vec3 dir = v / d;
  float c = abs(dot(vNormal, dir));
  // grazing surfaces change distance quickly across one cube texel: widen the tolerance there
  float bias = 0.12 + d * 0.004 + d * 0.0026 * sqrt(max(1.0 - c * c, 0.0)) / max(c, 0.02);
  // farthest of the neighbouring texels, so block edges and stair-steps do not speckle
  vec3 t1 = normalize(cross(dir, vec3(0.0, 1.0, 0.0)) + vec3(1e-5, 0.0, 0.0));
  vec3 t2 = cross(dir, t1);
  float far = max(
    max(texture(depth, dir + t1 * 0.0016).r, texture(depth, dir - t1 * 0.0016).r),
    max(texture(depth, dir + t2 * 0.0016).r, texture(depth, dir - t2 * 0.0016).r));
  float seen = step(d, max(far, texture(depth, dir).r) + bias);
  return vec4(equirect(tex, under, patched, rot * dir), seen);
}

void main() {
  float ring = distance(vWorld.xz, uClip.xy) - uClip.z;
#ifdef FAR
  if (ring < 0.0) discard;
#else
  if (ring > 0.0) discard;
#endif
  vec4 c = texture(uTex, vUvl);
#ifdef CUTOUT
  if (c.a < 0.5) discard;
#endif
  float night = 1.0 - uDay;
  // open-air faces follow the sun; covered faces keep a dim constant level
  float sun = mix(0.3, 1.0, uDay);
  float amb = mix(0.36 + 0.2 * uDay, sun, vFlags.x);
  vec3 col = c.rgb * vLight * amb * mix(vec3(0.62, 0.76, 1.2), vec3(1.0), uDay);
  float alpha = c.a;
  if (vFlags.y > 1.5) {
    col = c.rgb * mix(1.0, 1.25, night);
#ifdef FAR
  } else if (vFlags.y > 0.5 && c.a < 0.9) {
#else
  } else if (vFlags.y > 0.5) {
#endif
    // each window bay gets its own switch after dark
    float h = hash(floor((vWorld - vNormal * 0.5) / vec3(3.0, 4.0, 3.0)));
    float lit = step(0.42, h) * smoothstep(0.35, 0.8, night);
    vec3 lamp = mix(vec3(1.0, 0.85, 0.52), vec3(0.82, 0.92, 1.0), step(0.82, h));
    col = mix(col, lamp * (0.75 + 0.25 * c.rgb), lit * 0.9);
    alpha = mix(alpha, 0.96, lit);
  }
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, vDist));

  if (uPhoto > 0.0 && vFlags.z < 0.5) {
    vec4 a = photo(uPanoA, uPatchA, uPatchOn.x, uDepthA, uPosA, uRotA);
    vec4 b = photo(uPanoB, uPatchB, uPatchOn.y, uDepthB, uPosB, uRotB);
    float wa = a.a * uPano.x * (1.0 - uPano.z);
    float wb = b.a * uPano.y * uPano.z;
    float w = wa + wb;
    if (w > 0.001) {
      float k = min(w, 1.0) * uPhoto;
      col = mix(col, (a.rgb * wa + b.rgb * wb) / w, k);
      alpha = mix(alpha, 1.0, k);
    }
  }
#ifdef CUTOUT
  gl_FragColor = vec4(col, 1.0);
#else
  gl_FragColor = vec4(col, alpha);
#endif
}
`;

// Distance from a panorama centre, rendered into a cube map.
const DEPTH_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const DEPTH_FRAG = /* glsl */ `
uniform vec3 uCenter;
uniform vec3 uClip;
varying vec3 vWorld;
void main() {
  float ring = distance(vWorld.xz, uClip.xy) - uClip.z;
#ifdef FAR
  if (ring < 0.0) discard;
#else
  if (ring > 0.0) discard;
#endif
  gl_FragColor = vec4(distance(vWorld, uCenter), 0.0, 0.0, 1.0);
}
`;

export function createMaterials() {
  const { data, layers } = buildTextures();
  const tex = new THREE.DataArrayTexture(data, TEX_SIZE, TEX_SIZE, layers);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;

  // placeholders until a panorama is loaded
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;
  const blankCube = new THREE.CubeTexture();

  // shared with the sky so the backdrop shows the same panorama
  const pano = {
    uPanoA: { value: blank },
    uPanoB: { value: blank },
    uPosA: { value: new THREE.Vector3() },
    uPosB: { value: new THREE.Vector3() },
    uRotA: { value: new THREE.Matrix3() },
    uRotB: { value: new THREE.Matrix3() },
    uPano: { value: new THREE.Vector3(0, 0, 0) },
    uPatchA: { value: blank },
    uPatchB: { value: blank },
    uPatchOn: { value: new THREE.Vector2(0, 0) },
  };
  const uniforms = {
    uTex: { value: tex },
    uFogColor: { value: new THREE.Color(0.7, 0.83, 0.96) },
    uFogNear: { value: 120 },
    uFogFar: { value: 190 },
    uDay: { value: 1 },
    uClip: { value: new THREE.Vector3(0, 0, 1e6) },
    uPhoto: { value: 1 },
    uDepthA: { value: blankCube },
    uDepthB: { value: blankCube },
    ...pano,
  };
  const make = (defines, extra = {}) => new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, defines, ...extra });
  const opaque = make({ CUTOUT: 1 });
  const trans = make({}, { transparent: true, depthWrite: false });
  const far = make({ CUTOUT: 1, FAR: 1 });

  const depthUniforms = { uCenter: { value: new THREE.Vector3() }, uClip: { value: new THREE.Vector3(0, 0, 1e6) } };
  const depthNear = new THREE.ShaderMaterial({ uniforms: depthUniforms, vertexShader: DEPTH_VERT, fragmentShader: DEPTH_FRAG });
  const depthFar = new THREE.ShaderMaterial({ uniforms: depthUniforms, vertexShader: DEPTH_VERT, fragmentShader: DEPTH_FRAG, defines: { FAR: 1 } });

  return { opaque, trans, far, uniforms, pano, blank, blankCube, depthNear, depthFar, depthUniforms };
}
