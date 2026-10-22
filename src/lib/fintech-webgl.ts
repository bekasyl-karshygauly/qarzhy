import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Mesh, OrthographicCamera,
  PlaneGeometry, Points, Scene, ShaderMaterial, Vector2, WebGLRenderer,
} from 'three';
import {gsap} from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
import {
  meshFragmentShader, meshVertexShader, particleFragmentShader, particleVertexShader,
} from './fintech-shaders';

export interface FintechWebGLOptions {
  /** Initial hint only; viewport/input media changes always apply live. */
  mobile?: boolean;
  maxPixelRatio?: number;
}

export interface FintechWebGL {
  dispose(): void;
  setActive(active: boolean): void;
  /** Coordinates are normalized host coordinates, with y measured from the top. */
  pulse(x?: number, y?: number): void;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * One optional, isolated decorative context. It never owns scrolling, UI transforms,
 * financial state, focus or action handlers. Call only after the app's motion check.
 */
export function createFintechWebGL(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  options: FintechWebGLOptions = {},
): FintechWebGL {
  const fallback: FintechWebGL = {dispose() {}, setActive() {}, pulse() {}};
  host.dataset.webglState = 'fallback';
  delete host.dataset.webglFailure;
  if (typeof window === 'undefined' || !canvas.isConnected) return fallback;

  // Request explicitly, so unsupported devices fall back before Three constructs a renderer.
  let context: WebGL2RenderingContext | null;
  try {
    context = canvas.getContext('webgl2', {
      alpha: true, antialias: false, depth: false, stencil: false,
      powerPreference: 'low-power', preserveDrawingBuffer: false,
    });
  } catch { host.dataset.webglFailure = 'unsupported'; return fallback; }
  if (!context) { host.dataset.webglFailure = 'unsupported'; return fallback; }

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({canvas, context, alpha: true, antialias: false, depth: false, stencil: false});
  } catch {
    host.dataset.webglFailure = 'renderer';
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return fallback;
  }

  const mobileQuery = window.matchMedia('(max-width: 700px), (pointer: coarse)');
  let mobile = options.mobile ?? mobileQuery.matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let frameInterval = 1000 / (mobile ? 24 : 30);
  const configuredMaxDpr = clamp(options.maxPixelRatio ?? 1.5, 0.5, 1.5);
  const constrainedHardware = navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4;
  let qualityScale = constrainedHardware ? 0.8 : 1;
  let width = 0;
  let height = 0;
  let disposed = false;
  let failed = false;
  let resourcesReleased = false;
  let requestedActive = true;
  let intersecting = true;
  let running = false;
  let frame = 0;
  let lastFrame = 0;
  let lastRendered = 0;
  let animationTime = 0;
  let renderCount = 0;
  let pulseCount = 0;
  let slowFrames = 0;
  let lastRaf = 0;
  let cadenceWarmupUntil = 0;
  let cadenceIntervals: number[] = [];
  let pointerPowerTarget = 0;
  let scrollProgressTarget = 0;
  let pulseStarted = -10;
  const pointerTarget = new Vector2(0.5, 0.5);
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    uTime: {value: 0}, uAspect: {value: 1}, uScroll: {value: 0},
    uPointer: {value: new Vector2(0.5, 0.5)}, uPointerPower: {value: 0},
    uPulseOrigin: {value: new Vector2(0.5, 0.5)}, uPulseAge: {value: 10},
    uPulseStrength: {value: 0}, uPixelRatio: {value: 1},
    uMintCenter: {value: new Vector2(0.73, 0.74)},
    uLimeCenter: {value: new Vector2(0.32, 0.26)},
  };
  const meshGeometry = new PlaneGeometry(2, 2);
  const meshMaterial = new ShaderMaterial({
    uniforms, vertexShader: meshVertexShader, fragmentShader: meshFragmentShader,
    transparent: true, depthTest: false, depthWrite: false,
  });
  const mesh = new Mesh(meshGeometry, meshMaterial);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const count = 42;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  // Stable, deterministic distribution: no random layout jump on remount.
  for (let i = 0; i < count; i++) {
    positions[i * 3] = ((i * 0.61803398875 + 0.17) % 1) * 1.86 - 0.93;
    positions[i * 3 + 1] = ((i * 0.41421356237 + 0.31) % 1) * 1.72 - 0.86;
    phases[i] = i * 2.39996323;
    sizes[i] = 2.2 + (i % 5) * 0.55;
  }
  const particleGeometry = new BufferGeometry();
  particleGeometry.setAttribute('position', new BufferAttribute(positions, 3));
  particleGeometry.setAttribute('aPhase', new BufferAttribute(phases, 1));
  particleGeometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
  particleGeometry.setDrawRange(0, mobile ? 18 : 42);
  const particleMaterial = new ShaderMaterial({
    uniforms, vertexShader: particleVertexShader, fragmentShader: particleFragmentShader,
    transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending,
  });
  const particles = new Points(particleGeometry, particleMaterial);
  particles.frustumCulled = false;
  particles.renderOrder = 1;
  scene.add(particles);
  renderer.setClearColor(0x000000, 0);

  let scrollTrigger: ScrollTrigger | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let intersectionObserver: IntersectionObserver | undefined;
  const interactionRoot = host.parentElement ?? host;

  function stop() {
    running = false;
    cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    lastRendered = 0;
    lastRaf = 0;
    cadenceIntervals = [];
    if (!disposed && !failed) host.dataset.webglState = 'paused';
  }

  function markFallback(reason: 'shader' | 'context' | 'render' | 'setup') {
    if (disposed || failed) return;
    failed = true;
    stop();
    scrollTrigger?.disable(false);
    host.dataset.webglState = 'fallback';
    host.dataset.webglFailure = reason;
    // Shader callbacks run inside render(). Release after that draw has unwound.
    queueMicrotask(releaseResources);
  }

  // Handle shader failures locally; the existing app must remain usable.
  renderer.debug.onShaderError = () => markFallback('shader');

  function resize() {
    if (disposed || failed) return;
    width = Math.max(0, host.clientWidth);
    height = Math.max(0, host.clientHeight);
    if (!width || !height) { stop(); return; }
    const pixelLimit = mobile ? 800_000 : 1_800_000;
    const budgetDpr = Math.sqrt(pixelLimit / (width * height));
    const maxDpr = Math.min(configuredMaxDpr, mobile ? 1 : 1.5);
    const dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, maxDpr, budgetDpr) * qualityScale);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    uniforms.uAspect.value = width / height;
    uniforms.uPixelRatio.value = dpr;
    host.dataset.webglQuality = qualityScale < 1 ? 'low' : mobile ? 'mobile' : 'high';
    sync();
  }

  function tick(timestamp: number) {
    if (!running || disposed || failed) return;
    frame = requestAnimationFrame(tick);
    // Measure the browser's UI cadence BEFORE the intentional shader FPS cap.
    // GPU submissions may be cheap on the CPU while still delaying the next paint.
    if (!lastRaf) cadenceWarmupUntil = timestamp + 350;
    const rafInterval = lastRaf ? timestamp - lastRaf : 0;
    lastRaf = timestamp;
    if (timestamp >= cadenceWarmupUntil && rafInterval > 0 && rafInterval < 150) {
      cadenceIntervals.push(rafInterval);
      if (cadenceIntervals.length >= 24) {
        const sorted = cadenceIntervals.slice().sort((a, b) => a - b);
        const median = (sorted[11] + sorted[12]) / 2;
        const sustainedSlow = cadenceIntervals.filter(value => value > 25).length >= 14;
        cadenceIntervals = [];
        if (median > 25 && sustainedSlow) lowerQuality(timestamp);
      }
    }
    const elapsed = timestamp - lastFrame;
    if (lastFrame && elapsed < frameInterval - 0.5) return;
    const delta = lastRendered ? Math.min((timestamp - lastRendered) / 1000, 0.08) : frameInterval / 1000;
    lastFrame = timestamp - (elapsed % frameInterval);
    lastRendered = timestamp;
    animationTime += delta;
    uniforms.uTime.value = animationTime;
    const meshTime = animationTime * 0.12;
    uniforms.uMintCenter.value.set(0.73 + Math.sin(meshTime * 0.7) * 0.12, 0.64 + Math.cos(meshTime) * 0.10);
    uniforms.uLimeCenter.value.set(0.22 + Math.cos(meshTime * 0.8) * 0.10, 0.26 + Math.sin(meshTime * 0.6) * 0.10);
    uniforms.uPulseAge.value = animationTime - pulseStarted;
    const smoothing = 1 - Math.exp(-delta * 6);
    uniforms.uPointer.value.lerp(pointerTarget, smoothing);
    uniforms.uPointerPower.value += (pointerPowerTarget - uniforms.uPointerPower.value) * smoothing;
    if (!pointerPowerTarget && uniforms.uPointerPower.value < 0.0001) uniforms.uPointerPower.value = 0;
    uniforms.uScroll.value += (scrollProgressTarget - uniforms.uScroll.value) * smoothing;
    const started = performance.now();
    try { renderer.render(scene, camera); }
    catch { markFallback('render'); return; }
    if (failed) return;
    host.dataset.webglFrame = String(++renderCount);
    // A one-way quality reduction avoids oscillating canvas reallocations on busy GPUs.
    if (performance.now() - started > (mobile ? 16 : 12) || delta * 1000 > frameInterval * 1.8) slowFrames++;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames >= 12) lowerQuality(timestamp);
  }

  function lowerQuality(timestamp: number) {
    if (qualityScale <= 0.5) return;
    qualityScale = qualityScale > 0.8 ? 0.8 : qualityScale > 0.65 ? 0.65 : 0.5;
    slowFrames = 0;
    cadenceIntervals = [];
    // Exclude the brief resize/allocation cost from the next cadence window.
    cadenceWarmupUntil = timestamp + 250;
    resize();
  }

  function sync() {
    if (disposed || failed) return;
    const shouldRun = requestedActive && intersecting && !document.hidden && width > 0 && height > 0;
    if (!shouldRun) { stop(); return; }
    if (running) return;
    running = true;
    lastFrame = 0;
    lastRendered = 0;
    lastRaf = 0;
    cadenceIntervals = [];
    host.dataset.webglState = 'active';
    frame = requestAnimationFrame(tick);
  }

  function pulse(x = 0.5, y = 0.5) {
    if (disposed || failed || !running) return;
    uniforms.uPulseOrigin.value.set(clamp(x, 0, 1), 1 - clamp(y, 0, 1));
    uniforms.uPulseStrength.value = mobile ? 0.65 : 1;
    pulseStarted = animationTime;
    host.dataset.webglPulse = String(++pulseCount);
  }

  function updatePointer(event: PointerEvent) {
    if (!finePointer.matches || event.pointerType === 'touch' || !running) return;
    const bounds = host.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    pointerTarget.set(clamp((event.clientX - bounds.left) / bounds.width, 0, 1), 1 - clamp((event.clientY - bounds.top) / bounds.height, 0, 1));
    pointerPowerTarget = 1;
  }
  function leavePointer() { pointerPowerTarget = 0; }
  function click(event: MouseEvent) {
    const bounds = host.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    pulse(event.detail === 0 ? 0.5 : (event.clientX - bounds.left) / bounds.width,
      event.detail === 0 ? 0.5 : (event.clientY - bounds.top) / bounds.height);
  }
  function contextLost() { markFallback('context'); }
  function updateQuality() {
    mobile = mobileQuery.matches;
    frameInterval = 1000 / (mobile ? 24 : 30);
    particleGeometry.setDrawRange(0, mobile ? 18 : 42);
    lastFrame = 0;
    lastRendered = 0;
    lastRaf = 0;
    cadenceIntervals = [];
    resize();
  }

  function releaseResources() {
    if (resourcesReleased) return;
    resourcesReleased = true;
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    scrollTrigger?.kill();
    interactionRoot.removeEventListener('pointermove', updatePointer);
    interactionRoot.removeEventListener('pointerleave', leavePointer);
    interactionRoot.removeEventListener('click', click);
    document.removeEventListener('visibilitychange', sync);
    canvas.removeEventListener('webglcontextlost', contextLost);
    finePointer.removeEventListener('change', leavePointer);
    mobileQuery.removeEventListener('change', updateQuality);
    meshGeometry.dispose();
    particleGeometry.dispose();
    meshMaterial.dispose();
    particleMaterial.dispose();
    scene.clear();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  interactionRoot.addEventListener('pointermove', updatePointer, {passive: true});
  interactionRoot.addEventListener('pointerleave', leavePointer, {passive: true});
  interactionRoot.addEventListener('click', click, {passive: true});
  document.addEventListener('visibilitychange', sync);
  canvas.addEventListener('webglcontextlost', contextLost);
  finePointer.addEventListener('change', leavePointer);
  mobileQuery.addEventListener('change', updateQuality);

  try {
    gsap.registerPlugin(ScrollTrigger);
    scrollTrigger = ScrollTrigger.create({
      id: 'qarzhy-shader-scroll', trigger: host, start: 'top bottom', end: 'bottom top',
      invalidateOnRefresh: true,
      onUpdate: self => {
        scrollProgressTarget = self.progress;
        host.dataset.webglScroll = self.progress.toFixed(3);
      },
      onRefresh: self => {
        scrollProgressTarget = self.progress;
        host.dataset.webglScroll = self.progress.toFixed(3);
      },
    });
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    intersectionObserver = new IntersectionObserver(entries => {
      intersecting = entries.some(entry => entry.isIntersecting);
      sync();
    }, {threshold: 0});
    intersectionObserver.observe(host);
    const bounds = host.getBoundingClientRect();
    intersecting = bounds.bottom > 0 && bounds.top < window.innerHeight;
    resize();
    pulse(0.74, 0.46);
  } catch { markFallback('setup'); }

  return {
    pulse,
    setActive(active) {
      requestedActive = active;
      if (active) scrollTrigger?.enable(false, false);
      else scrollTrigger?.disable(false);
      sync();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      releaseResources();
      host.dataset.webglState = 'fallback';
      delete host.dataset.webglQuality;
      delete host.dataset.webglFrame;
      delete host.dataset.webglFailure;
      delete host.dataset.webglScroll;
      delete host.dataset.webglPulse;
    },
  };
}
