/** Real ANT print artwork, in metres, with explicitly owned GPU resources. */
import {
  type BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import {
  INK, SANS, DISPLAY, SIZE, PAGE_W, PAGE_H, SHEET_W, SHEET_H,
  TEMPLATE_W, TEMPLATE_H, MAP_W, MAP_H, mm, loadMap, loadedMap,
  paintKitLid, paintKitFront, paintKitBack, paintProfileCover,
  paintProfileInterests, paintProfileStory, paintProfileBack,
  paintStickerSheet, paintTemplate, paintMap, paintCardBoxFront, paintCard,
  token, type ProfileData, type ProfileAnim, type TemplateFill,
} from './real.js';
import type { TokenId } from './pictos.js';

export * from './real.js';
export { TOKEN_IDS, drawPicto, type TokenId, type PictoId } from './pictos.js';
export { createBlobHost, chain, chainPoint, CHAIN_PARAMS, type BlobSurface, type SurfaceBlob } from './blobHost.js';

export type PaperKind = 'kitLid' | 'kitFront' | 'kitBack' | 'profileCover'
  | 'profileInterests' | 'profileStory' | 'profileBack' | 'stickerSheet'
  | 'template' | 'map' | 'cardBox' | 'card';

export type PaperOptions = {
  profile?: ProfileData | null;
  anim?: ProfileAnim;
  peeled?: number[];
  template?: TemplateFill;
  card?: number;
};

export type Painter = (context: CanvasRenderingContext2D) => void;
export type Paper = {
  /** Local XY plane; printed front faces +Z. Width and height are in metres. */
  mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  texture: CanvasTexture;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Drawing coordinates are the painter's original points. */
  designWidth: number;
  designHeight: number;
  repaint(options?: PaperOptions): void;
  /** Adds to existing artwork; coordinates remain the original printer points. */
  draw(painter: Painter): void;
  dispose(): void;
};

/** Web kits remain remote; timeout always leaves the Arial fallback usable. */
export async function loadPrintFonts(): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('700 40px "helvetica-neue-lt-pro"'),
        document.fonts.load('400 40px "helvetica-neue-lt-pro"'),
        document.fonts.load('italic 400 40px "helvetica-neue-lt-pro"'),
        document.fonts.load('500 40px "evert-pe-vf"'),
        loadMap(),
      ]),
      new Promise<void>((resolve) => { timeout = setTimeout(resolve, 2500); }),
    ]);
  } catch {
    // Network and font permissions never prevent a run.
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/** A rectangle with round corners; UVs cover the full rectangle like a plane. */
function roundedRect(width: number, height: number, radius: number): BufferGeometry {
  const r = Math.min(radius, width / 2, height / 2);
  const w = width / 2;
  const h = height / 2;
  const shape = new Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h); shape.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(w, h - r); shape.absarc(w - r, h - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-w + r, h); shape.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-w, -h + r); shape.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  const geometry = new ShapeGeometry(shape, 8);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / width + .5, position.getY(i) / height + .5);
  uv.needsUpdate = true;
  return geometry;
}

function surface(
  width: number, height: number, designWidth: number, designHeight: number,
  painter: Painter, circular = false, resolution = 1024, radius = 0,
): Paper {
  const canvas = document.createElement('canvas');
  const scale = resolution / Math.max(designWidth, designHeight);
  canvas.width = Math.max(1, Math.round(designWidth * scale));
  canvas.height = Math.max(1, Math.round(designHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('ANT needs canvas drawing support. Please reload your browser.');
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new MeshBasicMaterial({ map: texture, side: DoubleSide });
  material.toneMapped = false;
  const geometry: BufferGeometry = circular ? new CircleGeometry(width / 2, 32)
    : radius > 0 ? roundedRect(width, height, radius) : new PlaneGeometry(width, height);
  const mesh = new Mesh(geometry, material);
  let disposed = false;
  const paint = (fn: Painter, clear: boolean) => {
    if (disposed) return;
    context.save();
    context.setTransform(canvas.width / designWidth, 0, 0, canvas.height / designHeight, 0, 0);
    if (clear) context.clearRect(0, 0, designWidth, designHeight);
    fn(context);
    context.restore();
    texture.needsUpdate = true;
  };
  const paper: Paper = {
    mesh, texture, canvas, context, width, height, designWidth, designHeight,
    repaint: () => paint(painter, true),
    draw: (fn) => paint(fn, false),
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      canvas.width = canvas.height = 1;
    },
  };
  paper.repaint();
  return paper;
}

/** Every real item retains the source artwork and physical printed size. */
export function createPaper(kind: PaperKind, initialOptions: PaperOptions = {}): Paper {
  let options = { ...initialOptions };
  let width: number;
  let height: number;
  let designWidth: number;
  let designHeight: number;
  let painter: Painter;
  switch (kind) {
    case 'kitLid':
      width = .240; height = .220; designWidth = mm(240); designHeight = mm(220);
      painter = paintKitLid;
      break;
    case 'kitFront': case 'kitBack':
      width = .240; height = .055; designWidth = mm(240); designHeight = mm(55);
      painter = kind === 'kitFront' ? paintKitFront : paintKitBack;
      break;
    case 'profileCover': case 'profileInterests': case 'profileStory': case 'profileBack':
      width = .148; height = .210; designWidth = PAGE_W; designHeight = PAGE_H;
      painter = (ctx) => {
        const profile = options.profile ?? null;
        if (kind === 'profileCover') paintProfileCover(ctx, profile, options.anim);
        else if (kind === 'profileInterests') paintProfileInterests(ctx, profile, options.anim);
        else if (kind === 'profileStory') paintProfileStory(ctx, profile, options.anim);
        else paintProfileBack(ctx);
      };
      break;
    case 'stickerSheet':
      width = SIZE.sheet.w / 1000; height = SIZE.sheet.h / 1000;
      designWidth = SHEET_W; designHeight = SHEET_H;
      painter = (ctx) => paintStickerSheet(ctx, options.peeled);
      break;
    case 'template':
      width = .105; height = .148; designWidth = TEMPLATE_W; designHeight = TEMPLATE_H;
      painter = (ctx) => paintTemplate(ctx, options.template);
      break;
    case 'map':
      width = .297; height = .420; designWidth = MAP_W; designHeight = MAP_H;
      painter = (ctx) => paintMap(ctx, loadedMap());
      break;
    case 'cardBox':
      width = .066; height = .093; designWidth = mm(66); designHeight = mm(93);
      painter = paintCardBoxFront;
      break;
    case 'card':
      width = .063; height = .088; designWidth = mm(63); designHeight = mm(88);
      painter = (ctx) => paintCard(ctx, options.card ?? 0);
      break;
  }
  const paper = surface(width, height, designWidth, designHeight, painter);
  paper.mesh.name = `ANT ${kind}`;
  const repaint = paper.repaint;
  paper.repaint = (next = {}) => {
    options = { ...options, ...next };
    repaint();
  };
  if (kind === 'map' && !loadedMap()) void loadMap().then(() => paper.repaint());
  return paper;
}

/** The 25 mm sticker can be peeled and placed without changing its scale. */
export function createToken(id: TokenId): Paper {
  const paper = surface(.025, .025, 100, 100, (ctx) => {
    token(ctx, id, 50, 50, 50);
  }, true, 128);
  paper.mesh.name = `Interest Token: ${id}`;
  return paper;
}

export type LabelOptions = {
  width?: number;
  height?: number;
  /** Actual capital height is approximately 70% of this em size, in metres. */
  fontSize?: number;
  background?: string;
  color?: string;
  align?: CanvasTextAlign;
  display?: boolean;
  /** Corner radius in metres. Defaults to a pill for one line, a soft card otherwise; 0 is square. */
  radius?: number;
  /** Letter spacing in em; used with upper case for eyebrow labels. */
  tracking?: number;
  weight?: number;
  /** Longest canvas side in pixels. */
  resolution?: number;
};
export type Label = Paper & { setText(text: string): void };

/** World labels, separate from the true-size artwork so guidance stays readable. */
export function createLabel(initialText: string, options: LabelOptions = {}): Label {
  const width = options.width ?? .72;
  const height = options.height ?? .15;
  const fontSize = options.fontSize ?? .043;
  const pxPerMetre = 1000;
  let currentText = initialText;
  const paper = surface(width, height, width * pxPerMetre, height * pxPerMetre, (ctx) => {
    const w = width * pxPerMetre;
    const h = height * pxPerMetre;
    const font = fontSize * pxPerMetre;
    const padding = Math.min(18, w * .04);
    ctx.fillStyle = options.background ?? INK.white;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = options.color ?? INK.black;
    ctx.font = `${options.weight ?? (options.display ? 500 : 400)} ${font}px ${options.display ? DISPLAY : SANS}`;
    if (options.tracking) ctx.letterSpacing = `${(font * options.tracking).toFixed(2)}px`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = options.align ?? 'center';
    const lines: string[] = [];
    for (const paragraph of currentText.split('\n')) {
      let line = '';
      for (const word of paragraph.split(' ')) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate).width > w - padding * 2) {
          lines.push(line); line = word;
        } else line = candidate;
      }
      lines.push(line);
    }
    const lineHeight = font * 1.16;
    const x = ctx.textAlign === 'left' ? padding : ctx.textAlign === 'right' ? w - padding : w / 2;
    lines.forEach((line, i) => ctx.fillText(line, x, h / 2 + (i - (lines.length - 1) / 2) * lineHeight));
  }, false, options.resolution ?? 1024, options.radius ?? Math.min(height / 2, .026)) as Label;
  paper.setText = (text) => {
    if (text === currentText) return;
    currentText = text;
    paper.repaint();
  };
  paper.mesh.name = `Label: ${initialText}`;
  return paper;
}

export type Progress = Paper & { setStep(index: number, finished?: boolean): void };

/** The journey chain: black = done, green = now, outlined = still to come. */
export function createProgress(count: number): Progress {
  const pitch = .042;
  const width = pitch * count + .012;
  const height = .042;
  const px = 2400;
  let step = 0;
  let finished = false;
  const paper = surface(width, height, width * px, height * px, (ctx) => {
    const w = width * px;
    const h = height * px;
    ctx.fillStyle = INK.white;
    ctx.fillRect(0, 0, w, h);
    ctx.font = `700 ${.013 * px}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = .0012 * px;
    const r = .0135 * px;
    for (let i = 0; i < count; i++) {
      const x = w / 2 + (i - (count - 1) / 2) * pitch * px;
      const done = finished || i < step;
      if (i > 0) {
        ctx.strokeStyle = INK.black;
        ctx.beginPath(); ctx.moveTo(x - pitch * px + r, h / 2); ctx.lineTo(x - r, h / 2); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(x, h / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = done ? INK.black : i === step ? INK.green : INK.white;
      ctx.fill();
      ctx.strokeStyle = INK.black; ctx.stroke();
      ctx.fillStyle = done ? INK.white : INK.black;
      ctx.fillText(String(i + 1), x, h / 2 + .0008 * px);
    }
  }, false, 1024, height / 2) as Progress;
  paper.setStep = (index, isFinished = false) => {
    if (index === step && isFinished === finished) return;
    step = index; finished = isFinished;
    paper.repaint();
  };
  paper.mesh.name = 'Journey progress';
  return paper;
}
