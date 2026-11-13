/**
 * Shared-context host for ANT's byte-identical field renderer.
 * The engine owns raw GL objects, tracked here so every one can be released.
 * Call surface.set between scene renders, never inside onBeforeRender.
 */
import { LinearFilter, MeshBasicMaterial, WebGLRenderTarget, type WebGLRenderer } from '@iwsdk/core';
import { DEFAULT_PARAMS, Renderer, computePairs, hexToRgb, type BlobParams, type RenderBlob } from './engine.js';

export type SurfaceBlob = { id: number; x: number; y: number; r: number; color: string };
export type BlobSurface = {
  material: MeshBasicMaterial;
  /** Returns false when data is unchanged or the 12 Hz update limit applies. */
  set(blobs: SurfaceBlob[], force?: boolean): boolean;
  dispose(): void;
};
export type BlobHost = {
  surface(width?: number, height?: number, params?: Partial<BlobParams>): BlobSurface;
  /** Raw field draw calls are outside renderer.info; add these on update frames. */
  readonly drawCount: number;
  dispose(): void;
};

function trackContext(gl: WebGL2RenderingContext) {
  const cleanup: (() => void)[] = [];
  const bound = new Map<PropertyKey, unknown>();
  const context = new Proxy(gl, {
    get(target, property) {
      const cached = bound.get(property);
      if (cached !== undefined) return cached;
      const member: unknown = Reflect.get(target, property, target);
      if (typeof member !== 'function') return member;
      const call = (...args: unknown[]) => {
        const result: unknown = Reflect.apply(member, target, args);
        if (result) {
          if (property === 'createProgram') cleanup.push(() => gl.deleteProgram(result as WebGLProgram));
          if (property === 'createShader') cleanup.push(() => gl.deleteShader(result as WebGLShader));
          if (property === 'createVertexArray') cleanup.push(() => gl.deleteVertexArray(result as WebGLVertexArrayObject));
          if (property === 'createBuffer') cleanup.push(() => gl.deleteBuffer(result as WebGLBuffer));
          if (property === 'createTexture') cleanup.push(() => gl.deleteTexture(result as WebGLTexture));
        }
        return result;
      };
      bound.set(property, call);
      return call;
    },
  });
  return { context, dispose: () => { cleanup.reverse().forEach((fn) => fn()); cleanup.length = 0; bound.clear(); } };
}

export function createBlobHost(three: WebGLRenderer): BlobHost {
  const gl = three.getContext() as WebGL2RenderingContext;
  const tracked = trackContext(gl);
  const target = { width: 1, height: 1, getContext: () => tracked.context, addEventListener() {} };
  let engine: Renderer;
  three.resetState();
  try {
    engine = new Renderer(target as unknown as HTMLCanvasElement);
  } catch (error) {
    tracked.dispose();
    throw error;
  } finally {
    three.resetState();
  }
  const surfaces = new Set<BlobSurface>();
  const colors = new Map<string, [number, number, number]>();
  let disposed = false;
  let drawCount = 0;
  return {
    get drawCount() { return drawCount; },
    surface(width = 512, height = 512, params = {}) {
      if (disposed) throw new Error('ANT blob host has been disposed.');
      const w = Math.max(1, Math.min(1024, Math.round(width)));
      const h = Math.max(1, Math.min(1024, Math.round(height)));
      const rt = new WebGLRenderTarget(w, h, {
        depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
        minFilter: LinearFilter, magFilter: LinearFilter,
      });
      three.initRenderTarget(rt);
      const material = new MeshBasicMaterial({ map: rt.texture, transparent: true, depthWrite: false });
      material.toneMapped = false;
      // Engine writes the original sRGB palette; Three's material expects linear.
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
          '#include <map_fragment>\n diffuseColor = sRGBTransferEOTF(diffuseColor);');
      };
      const full: BlobParams = { ...DEFAULT_PARAMS, ...params };
      let signature = '';
      let lastTime = -Infinity;
      let surfaceDisposed = false;
      const surface: BlobSurface = {
        material,
        set(blobs, force = false) {
          if (disposed || surfaceDisposed || gl.isContextLost()) return false;
          const time = performance.now();
          if (!force && time - lastTime < 1000 / 12) return false;
          const live = blobs.filter((blob) => blob.r > .3);
          const next = live.map((b) => `${b.id}:${b.x.toFixed(2)},${b.y.toFixed(2)},${b.r.toFixed(2)},${b.color}`).join(';');
          if (next === signature && lastTime !== -Infinity) return false;
          const items: RenderBlob[] = live.map((b) => {
            let rgb = colors.get(b.color);
            if (!rgb) { rgb = hexToRgb(b.color); colors.set(b.color, rgb); }
            return { id: b.id, x: b.x, y: b.y, r: b.r, rgb };
          });
          const previous = three.getRenderTarget();
          const previousFace = three.getActiveCubeFace();
          const previousLevel = three.getActiveMipmapLevel();
          three.resetState();
          try {
            three.setRenderTarget(rt);
            target.width = w; target.height = h;
            engine.render({ blobs: items, pairs: computePairs(items, full), params: full,
              board: { w, h }, view: { scale: 1, ox: 0, oy: 0 },
              background: '#000000', transparent: true, clip: false });
            signature = next;
            lastTime = time;
            drawCount++;
          } finally {
            three.resetState();
            three.setRenderTarget(previous, previousFace, previousLevel);
          }
          return true;
        },
        dispose() {
          if (surfaceDisposed) return;
          surfaceDisposed = true;
          surfaces.delete(surface);
          material.dispose();
          rt.dispose();
        },
      };
      surfaces.add(surface);
      return surface;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const surface of surfaces) surface.dispose();
      surfaces.clear();
      three.resetState();
      tracked.dispose();
      three.resetState();
      colors.clear();
    },
  };
}

/** The same linking parameters used by the website and explainer video. */
export const CHAIN_PARAMS: Partial<BlobParams> = {
  reach: 1.9, thickness: .42, flare: .4, smooth: .55,
  snap: .9, taper: 2.6, organic: .6, maxBridges: 4,
};

export function chainPoint(p0: [number, number], p1: [number, number], t: number, bend = 1): [number, number] {
  const dx = p1[0] - p0[0]; const dy = p1[1] - p0[1];
  const length = Math.hypot(dx, dy) || 1;
  const b = Math.sin(t * Math.PI) * length * .06 * bend;
  return [p0[0] + dx * t - dy / length * b, p0[1] + dy * t + dx / length * b];
}

export function chain(id: number, p0: [number, number], p1: [number, number], progress: number,
  color: string, bead: number, bend = 1): SurfaceBlob[] {
  if (progress < .01) return [];
  const n = Math.max(2, Math.floor(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / (bead * 2.5)));
  const out: SurfaceBlob[] = [];
  for (let k = 1; k < n; k++) {
    const t = k / n;
    if (t > progress) break;
    const front = Math.max(0, 1 - Math.abs(progress - t) * n * .35);
    const [x, y] = chainPoint(p0, p1, t, bend);
    out.push({ id: id + k, x, y, r: bead * (1 + front * .5), color });
  }
  return out;
}
