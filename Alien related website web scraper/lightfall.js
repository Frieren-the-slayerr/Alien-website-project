import { Renderer, Program, Mesh, Triangle } from 'https://esm.sh/ogl@1.0.11';

const container = document.querySelector('#lightfall-background');
const options = {
  colors: ['#A6C8FF', '#5227FF', '#FF9FFC'],
  backgroundColor: '#000000',
  speed: 1,
  streakCount: 8,
  streakWidth: 1,
  streakLength: 1,
  glow: 1,
  density: 1,
  twinkle: 1,
  zoom: 2,
  backgroundGlow: 1,
  opacity: 1,
  mouseInteraction: true,
  mouseStrength: 1,
  mouseRadius: 0.6,
  mouseDampening: 0.15,
};

const vertex = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragment = `
precision highp float;
uniform vec3 iResolution;
uniform vec2 iMouse;
uniform float iTime;
uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uBgColor;
uniform vec3 uMouseColor;
uniform float uSpeed;
uniform int uStreakCount;
uniform float uStreakWidth;
uniform float uStreakLength;
uniform float uGlow;
uniform float uDensity;
uniform float uTwinkle;
uniform float uZoom;
uniform float uBgGlow;
uniform float uOpacity;
uniform float uMouseEnabled;
uniform float uMouseStrength;
uniform float uMouseRadius;
varying vec2 vUv;

vec3 palette(float h) {
  float scaled = clamp(h, 0.0, 0.9999) * 3.0;
  if (scaled < 1.0) return uColor0;
  if (scaled < 2.0) return uColor1;
  return uColor2;
}
vec3 tanhv(vec3 x) {
  vec3 e = exp(-2.0 * x);
  return (1.0 - e) / (1.0 + e);
}
vec2 sceneC(vec2 frag, vec2 r) {
  vec2 P = (frag + frag - r) / r.x;
  float z = 0.0;
  float d = 1e3;
  vec4 O = vec4(0.0);
  for (int k = 0; k < 39; k++) {
    if (d <= 1e-4) break;
    O = z * normalize(vec4(P, uZoom, 0.0)) - vec4(0.0, 4.0, 1.0, 0.0) / 4.5;
    d = 1.0 - sqrt(length(O * O));
    z += d;
  }
  return vec2(O.x, atan(O.z, O.y));
}
void main() {
  vec2 r = iResolution.xy;
  vec2 uv0 = (vUv * r + vUv * r - r) / r.x;
  float T = 0.1 * iTime * uSpeed + 9.0;
  float rings = max(1.0, floor(6.2831853 * max(uDensity, 0.05) + 0.5));
  vec2 Y = vec2(5e-3, 6.2831853 / rings);
  vec2 C = sceneC(vUv * r, r);
  vec2 cdx = sceneC(vUv * r + vec2(1.0, 0.0), r);
  vec2 cdy = sceneC(vUv * r + vec2(0.0, 1.0), r);
  vec2 dCx = cdx - C;
  vec2 dCy = cdy - C;
  dCx.y -= 6.2831853 * floor(dCx.y / 6.2831853 + 0.5);
  dCy.y -= 6.2831853 * floor(dCy.y / 6.2831853 + 0.5);
  vec2 fw = abs(dCx) + abs(dCy);
  vec2 P = vec2(2.0, 1.0) * uv0 - (r / r.x) * vec2(0.0, 1.0);
  vec3 color = uBgColor * 90.0 * uBgGlow / (1e3 * dot(P, P) + 6.0);
  float mouseGlow = 0.0;
  if (uMouseEnabled > 0.5) {
    vec2 mouse = (iMouse + iMouse - r) / r.x;
    float distanceToMouse = length(uv0 - mouse);
    mouseGlow = exp(-distanceToMouse * distanceToMouse / max(uMouseRadius * uMouseRadius, 1e-4)) * uMouseStrength;
    color += uMouseColor * mouseGlow * 0.25;
  }
  float zr = 5e-4 * uStreakWidth;
  vec2 rr = vec2(max(length(fw), 1e-5));
  float tail = 19.0 / max(uStreakLength, 0.05);
  for (int m = 0; m < 16; m++) {
    if (m >= uStreakCount) break;
    float jf = float(m) + 1.0;
    float seed = fract(sin(dot(vec2(jf, floor(C.x / Y.x + 0.5)), vec2(7.0, 11.0)) * 73.0));
    vec2 streak = C - (T + T * seed) * vec2(0.0, 1.0);
    streak -= floor(streak / Y + 0.5) * Y;
    vec3 streakColor = palette(fract(8663.0 * seed));
    float weight = mix(1.5, 1.0 + sin(T + 7.0 * seed + 4.0), uTwinkle) * (1.0 + mouseGlow * 2.0);
    vec2 inner = vec2(length(max(streak, vec2(-1.0, 0.0))), length(streak) - zr) - zr;
    vec2 smoothMask = vec2(1.0) - smoothstep(-rr, rr, inner);
    color += dot(smoothMask, vec2(exp(tail * streak.y), 3.0)) * streakColor * weight;
    C.x += Y.x / 8.0;
  }
  vec3 finalColor = sqrt(tanhv(max(color * uGlow - vec3(0.04, 0.08, 0.02), 0.0)));
  gl_FragColor = vec4(finalColor, uOpacity);
}
`;

const hexToRGB = (hex) => {
  const value = hex.replace('#', '').padEnd(6, '0');
  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  ];
};

const colors = options.colors.map(hexToRGB);
const averageColor = colors.reduce((average, color) => average.map((value, index) => value + color[index] / colors.length), [0, 0, 0]);

const renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio || 1, 2), alpha: true, antialias: true });
const gl = renderer.gl;
const canvas = gl.canvas;
canvas.setAttribute('aria-hidden', 'true');
canvas.style.width = '100%';
canvas.style.height = '100%';
canvas.style.display = 'block';
container.appendChild(canvas);

const uniforms = {
  iResolution: { value: [gl.drawingBufferWidth, gl.drawingBufferHeight, 1] },
  iMouse: { value: [0, 0] },
  iTime: { value: 0 },
  uColor0: { value: colors[0] },
  uColor1: { value: colors[1] },
  uColor2: { value: colors[2] },
  uBgColor: { value: hexToRGB(options.backgroundColor) },
  uMouseColor: { value: averageColor },
  uSpeed: { value: options.speed },
  uStreakCount: { value: options.streakCount },
  uStreakWidth: { value: options.streakWidth },
  uStreakLength: { value: options.streakLength },
  uGlow: { value: options.glow },
  uDensity: { value: options.density },
  uTwinkle: { value: options.twinkle },
  uZoom: { value: options.zoom },
  uBgGlow: { value: options.backgroundGlow },
  uOpacity: { value: options.opacity },
  uMouseEnabled: { value: options.mouseInteraction ? 1 : 0 },
  uMouseStrength: { value: options.mouseStrength },
  uMouseRadius: { value: options.mouseRadius },
};

const program = new Program(gl, { vertex, fragment, uniforms });
const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
const mouseTarget = [0, 0];
let lastTime = 0;

const resize = () => {
  const rect = container.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height);
  uniforms.iResolution.value = [gl.drawingBufferWidth, gl.drawingBufferHeight, 1];
};

const onPointerMove = (event) => {
  const rect = canvas.getBoundingClientRect();
  const scale = renderer.dpr || 1;
  mouseTarget[0] = (event.clientX - rect.left) * scale;
  mouseTarget[1] = (rect.height - (event.clientY - rect.top)) * scale;
};

resize();
window.addEventListener('resize', resize);
canvas.addEventListener('pointermove', onPointerMove);

const loop = (time) => {
  requestAnimationFrame(loop);
  uniforms.iTime.value = time * 0.001;
  if (!lastTime) lastTime = time;
  const factor = 1 - Math.exp(-((time - lastTime) / 1000) / options.mouseDampening);
  uniforms.iMouse.value[0] += (mouseTarget[0] - uniforms.iMouse.value[0]) * factor;
  uniforms.iMouse.value[1] += (mouseTarget[1] - uniforms.iMouse.value[1]) * factor;
  lastTime = time;
  renderer.render({ scene: mesh });
};
requestAnimationFrame(loop);
