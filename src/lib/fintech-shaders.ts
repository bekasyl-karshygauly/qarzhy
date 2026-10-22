/** Decorative GLSL only. No DOM capture, financial values, textures or render targets. */
export const meshVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const meshFragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uAspect;
  uniform float uScroll;
  uniform vec2 uPointer;
  uniform float uPointerPower;
  uniform vec2 uPulseOrigin;
  uniform float uPulseAge;
  uniform float uPulseStrength;
  uniform vec2 uMintCenter;
  uniform vec2 uLimeCenter;

  float glow(vec2 p, vec2 center, vec2 radius) {
    vec2 d = (p - center) / radius;
    return exp(-dot(d, d) * 2.5);
  }

  void main() {
    vec2 uv = vUv;
    vec2 aspect = vec2(uAspect, 1.0);
    float ring = 0.0;
    // Refraction is limited to the background coordinates: content is never distorted.
    // A uniform branch skips pulse work once its envelope is exactly zero.
    if (uPulseAge < 1.8 && uPulseStrength > 0.0) {
      vec2 fromPulse = (uv - uPulseOrigin) * aspect;
      float pulseDistance = length(fromPulse);
      float radius = uPulseAge * 0.52;
      float envelope = (1.0 - smoothstep(0.65, 1.8, uPulseAge)) * uPulseStrength;
      float ringDistance = (pulseDistance - radius) * 19.0;
      ring = exp(-ringDistance * ringDistance) * envelope;
      uv += fromPulse / max(pulseDistance, 0.001) * ring * 0.022 / aspect;
    }

    float t = uTime * 0.12;
    vec2 warp = vec2(
      sin(uv.y * 4.6 + t) + cos(uv.x * 3.2 - t * 0.7),
      sin(uv.x * 4.0 - t * 0.8) + cos(uv.y * 3.6 + t * 0.6)
    ) * 0.035;
    vec2 p = uv + warp + vec2(uScroll * 0.045, uScroll * -0.1);
    float mint = glow(p, uMintCenter, vec2(0.55, 0.73));
    float lime = glow(p, uLimeCenter, vec2(0.48, 0.61));
    float depth = glow(p, vec2(0.48, 0.92), vec2(0.72, 0.45));
    vec3 color = vec3(0.018, 0.048, 0.035);
    color += vec3(0.022, 0.155, 0.095) * mint;
    color += vec3(0.105, 0.135, 0.018) * lime;
    color += vec3(0.022, 0.031, 0.067) * depth;

    // A thin flowing caustic gives the mesh definition without a bloom pass.
    float flow = p.y + sin(p.x * 4.2 + t * 0.55) * 0.10;
    float causticDistance = (flow - 0.58 - uScroll * 0.05) * 17.0;
    float caustic = exp(-causticDistance * causticDistance);
    color += vec3(0.040, 0.110, 0.063) * caustic * mint;

    float pointerLight = 0.0;
    if (uPointerPower > 0.0) {
      vec2 toPointer = (uv - uPointer) * aspect;
      pointerLight = exp(-dot(toPointer, toPointer) * 11.0) * uPointerPower;
    }
    color += vec3(0.070, 0.105, 0.035) * pointerLight;
    color += vec3(0.055, 0.125, 0.075) * ring;

    // Fade away at the edge rather than exposing a rectangular shader surface.
    float edge = smoothstep(0.0, 0.10, uv.y) * (1.0 - smoothstep(0.82, 1.0, uv.y));
    float vignette = 1.0 - smoothstep(0.35, 0.95, length((vUv - 0.5) * vec2(0.9, 1.0)));
    gl_FragColor = vec4(color, edge * (0.72 + vignette * 0.22));
  }
`;

export const particleVertexShader = /* glsl */ `
  attribute float aPhase;
  attribute float aSize;
  uniform float uTime;
  uniform float uAspect;
  uniform float uScroll;
  uniform float uPixelRatio;
  uniform vec2 uPointer;
  uniform float uPointerPower;
  uniform vec2 uPulseOrigin;
  uniform float uPulseAge;
  uniform float uPulseStrength;
  varying float vOpacity;
  varying float vColor;
  void main() {
    vec2 uv = position.xy * 0.5 + 0.5;
    uv += vec2(sin(uTime * 0.13 + aPhase), cos(uTime * 0.10 + aPhase * 1.7)) * 0.018;
    uv.y -= uScroll * (0.025 + aPhase * 0.0015);
    vec2 delta = (uv - uPointer) * vec2(uAspect, 1.0);
    float distance = length(delta);
    uv += delta / max(distance, 0.001) / vec2(uAspect, 1.0)
      * exp(-distance * 9.0) * 0.045 * uPointerPower;
    vec2 pulseDelta = (uv - uPulseOrigin) * vec2(uAspect, 1.0);
    float pulseDistance = length(pulseDelta);
    float pulseRingDistance = (pulseDistance - uPulseAge * 0.52) * 13.0;
    float pulse = exp(-pulseRingDistance * pulseRingDistance)
      * (1.0 - smoothstep(0.65, 1.8, uPulseAge)) * uPulseStrength;
    uv += pulseDelta / max(pulseDistance, 0.001) / vec2(uAspect, 1.0) * pulse * 0.025;
    gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = aSize * uPixelRatio * (1.0 + pulse * 0.35);
    vOpacity = (0.30 + 0.18 * sin(uTime * 0.32 + aPhase))
      * smoothstep(0.02, 0.16, uv.y) * (1.0 - smoothstep(0.82, 0.98, uv.y));
    vColor = sin(aPhase) * 0.5 + 0.5;
  }
`;

export const particleFragmentShader = /* glsl */ `
  precision mediump float;
  varying float vOpacity;
  varying float vColor;
  void main() {
    float distance = length(gl_PointCoord - 0.5) * 2.0;
    float alpha = (1.0 - smoothstep(0.15, 1.0, distance)) * vOpacity;
    vec3 color = mix(vec3(0.48, 0.94, 0.73), vec3(0.77, 1.0, 0.35), vColor);
    gl_FragColor = vec4(color, alpha);
  }
`;
