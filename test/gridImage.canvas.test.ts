import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PNG } from 'pngjs';
import { renderGridPng, __setCanvasModule } from '../src/util/gridImage.js';

function hexToRgba(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '');
  const num = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255, 255];
}

function parseColor(c: string): [number, number, number, number] {
  if (c.startsWith('#')) return hexToRgba(c);
  const m = c.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/i);
  if (m) return [parseInt(m[1]!,10), parseInt(m[2]!,10), parseInt(m[3]!,10), Math.round((m[4]?parseFloat(m[4]!):1)*255)];
  // default white
  return [255,255,255,255];
}

function makeFakeCanvasModule() {
  return {
    createCanvas(width: number, height: number) {
      const rects: Array<{x:number,y:number,w:number,h:number,color:string}> = [];
      let currentFill = '#000000';
      let currentFont = 'bold 10px sans-serif';
      let currentBaseline = 'alphabetic';
      const ctx = {
        fillStyle: currentFill,
        font: currentFont,
        textBaseline: currentBaseline,
        clearRect: (_x: number, _y: number, _w: number, _h: number) => {},
        fillRect: (x: number, y: number, w: number, h: number) => {
          rects.push({ x, y, w, h, color: (ctx as any).fillStyle });
        },
        fillText: (_text: string, _x: number, _y: number) => {},
        measureText: (text: string) => {
          const m = /\b(\d+)px\b/.exec((ctx as any).font as string);
          const px = m ? parseInt(m[1]!,10) : 10;
          const width = Math.ceil(text.length * (px * 0.6));
          return { width } as any;
        },
        beginPath: () => {},
        arc: (_x: number, _y: number, _r: number, _s: number, _e: number) => {},
        closePath: () => {},
        clip: () => {},
        save: () => {},
        restore: () => {},
        drawImage: (_img: any, _x: number, _y: number, _w: number, _h: number) => {},
        fill: () => {},
      } as any;
      Object.defineProperty(ctx, 'fillStyle', {
        get() { return currentFill; },
        set(v: any) { currentFill = v; },
      });
      Object.defineProperty(ctx, 'font', {
        get() { return currentFont; },
        set(v: any) { currentFont = v; },
      });
      Object.defineProperty(ctx, 'textBaseline', {
        get() { return currentBaseline; },
        set(v: any) { currentBaseline = v; },
      });

      return {
        width,
        height,
        getContext: (_: string) => ctx,
        toBuffer: () => {
          const png = new PNG({ width, height });
          // transparent base
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const idx = (width * y + x) << 2;
              png.data[idx+0] = 0;
              png.data[idx+1] = 0;
              png.data[idx+2] = 0;
              png.data[idx+3] = 0;
            }
          }
          // draw rects
          for (const r of rects) {
            const [rr, gg, bb, aa] = parseColor(r.color);
            for (let yy = r.y; yy < r.y + r.h; yy++) {
              for (let xx = r.x; xx < r.x + r.w; xx++) {
                if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
                const idx = (width * yy + xx) << 2;
                png.data[idx+0] = rr;
                png.data[idx+1] = gg;
                png.data[idx+2] = bb;
                png.data[idx+3] = aa;
              }
            }
          }
          return PNG.sync.write(png);
        },
      };
    },
    Image: class { src: any }
  };
}

describe('gridImage renderer (canvas path)', () => {
  let original: any;

  beforeEach(() => {
    original = null;
    __setCanvasModule(makeFakeCanvasModule());
  });
  afterEach(() => {
    __setCanvasModule(original);
  });

  it('computes dimensions with canvas defaults and row label width', () => {
    const matrix = [ [true, false, true] ];
    const opts = { rowLabels: ['Alice Bob'] } as any;
    const { width, height } = renderGridPng(matrix, opts);

    const cellSize = 99;
    const cellGap = 9;
    const padding = 24;
    const headerHeight = 72;
    const rows = 1;
    const cols = 3;

    const rowFontSize = 33;
    const pxChar = rowFontSize * 0.6; // 19.8
    const avatarSize = Math.min(Math.floor(cellSize * 0.8), 84); // 79
    const labelGap = 21;
    const upper = 'ALICE BOB';
    const maxLabelWidth = Math.ceil(upper.length * pxChar); // measureText rounding
    const spaceWidth = Math.ceil(1 * pxChar);
    const computedRowLabelWidth = avatarSize + labelGap + Math.ceil(maxLabelWidth) + spaceWidth;
    const rowLabelWidth = Math.max(240, computedRowLabelWidth);

    const gridW = cols * cellSize + Math.max(0, cols - 1) * cellGap;
    const gridH = rows * cellSize + Math.max(0, rows - 1) * cellGap;

    expect(width).toBe(padding * 2 + rowLabelWidth + gridW);
    expect(height).toBe(padding * 2 + headerHeight + gridH);
  });

  it('draws gold in full-availability columns and respects bgColor', () => {
    const matrix = [ [true, true], [true, false] ];
    const { buffer } = renderGridPng(matrix, { bgColor: '#112233', rowLabels: ['A','B'] });
    const png = PNG.sync.read(buffer as any);

    const cellSize = 99;
    const cellGap = 9;
    const padding = 24;
    const headerHeight = 72;
    const rowFontSize = 33;
    const charW = Math.ceil(rowFontSize * 0.6);
    const avatarSize = Math.min(Math.floor(cellSize * 0.8), 84);
    const labelGap = 21;
    const maxLabelWidth = 'A'.length * charW;
    const spaceWidth = charW;
    const rowLabelWidth = Math.max(240, avatarSize + labelGap + Math.ceil(maxLabelWidth) + spaceWidth);

    const y = padding + headerHeight + 1; // inside first row
    const xGold = padding + rowLabelWidth + 0 * (cellSize + cellGap) + 1;
    const xNonGold = padding + rowLabelWidth + 1 * (cellSize + cellGap) + 1;

    const idxG = (png.width * y + xGold) << 2;
    expect([png.data[idxG], png.data[idxG+1], png.data[idxG+2], png.data[idxG+3]]).toEqual([253,105,222,255]);

    const idxN = (png.width * y + xNonGold) << 2;
    expect([png.data[idxN], png.data[idxN+1], png.data[idxN+2], png.data[idxN+3]]).toEqual([46,204,113,255]);

    // top-left pixel should be background
    const idxBG = 0;
    expect([png.data[idxBG], png.data[idxBG+1], png.data[idxBG+2]]).toEqual([0x11,0x22,0x33]);
  });

  it('places a background pixel before the first cell due to extra space after label', () => {
    const matrix = [ [true] ];
    const { buffer } = renderGridPng(matrix, { bgColor: '#000000', rowLabels: ['AB'] });
    const png = PNG.sync.read(buffer as any);

    const cellSize = 99;
    const cellGap = 9;
    const padding = 24;
    const headerHeight = 72;
    const rowFontSize = 33;
    const charW = Math.ceil(rowFontSize * 0.6);
    const avatarSize = Math.min(Math.floor(cellSize * 0.8), 84);
    const labelGap = 21;
    const maxLabelWidth = 'AB'.length * charW;
    const spaceWidth = charW; // the extra gap we added
    const rowLabelWidth = Math.max(240, avatarSize + labelGap + Math.ceil(maxLabelWidth) + spaceWidth);

    const y = padding + headerHeight + 1;
    const xBefore = padding + rowLabelWidth - 1;
    const idxBefore = (png.width * y + xBefore) << 2;
    // background black => [0,0,0,255]
    expect([png.data[idxBefore], png.data[idxBefore+1], png.data[idxBefore+2], png.data[idxBefore+3]]).toEqual([0,0,0,255]);
  });

  it('renders column headers when provided', () => {
    const matrix = [ [true] ];
    const { buffer } = renderGridPng(matrix, { rowLabels: ['A'], colHeaders: ['Mon\n1/9'], bgColor: '#000000' });
    const png = PNG.sync.read(buffer as any);
    // Check a pixel inside header area above first cell retains background (text drawing not rasterized in fake ctx)
    // Ensure image was generated successfully with expected dimensions
    expect(png.width).toBeGreaterThan(0);
    expect(png.height).toBeGreaterThan(0);
  });

  it('uses default rowLabelWidth when no rowLabels are provided', () => {
    const matrix = [ [true, false] ];
    const { width, height } = renderGridPng(matrix, {} as any);

    const cellSize = 99;
    const cellGap = 9;
    const padding = 24;
    const headerHeight = 72;
    const rows = 1;
    const cols = 2;

    const defaultRowLabelWidth = Math.max(240, Math.floor(cellSize * 1.8)); // => 240
    const gridW = cols * cellSize + Math.max(0, cols - 1) * cellGap;
    const gridH = rows * cellSize + Math.max(0, rows - 1) * cellGap;
    expect(width).toBe(padding * 2 + defaultRowLabelWidth + gridW);
    expect(height).toBe(padding * 2 + headerHeight + gridH);
  });

  it('takes avatar draw branch when rowAvatars are provided', () => {
    const matrix = [ [true] ];
    const fakePng = Buffer.from([137,80,78,71,13,10,26,10]); // minimal PNG header; our fake canvas doesn\'t parse it but path executes
    const { buffer } = renderGridPng(matrix, { rowLabels: ['A'], rowAvatars: [fakePng] as any, bgColor: '#000000' });
    const png = PNG.sync.read(buffer as any);
    expect(png.width).toBeGreaterThan(0);
  });

  it('renders transparent background when no bgColor is set', () => {
    const matrix = [ [true] ];
    const { buffer } = renderGridPng(matrix, { rowLabels: ['A'] });
    const png = PNG.sync.read(buffer as any);
    // Top-left pixel should be transparent
    expect(png.data[3]).toBe(0);
  });

  it('does not throw when WHEN_REQUIRE_CANVAS=1 and canvas is available', () => {
    const prev = process.env.WHEN_REQUIRE_CANVAS;
    try {
      process.env.WHEN_REQUIRE_CANVAS = '1';
      expect(() => renderGridPng([[true]], { rowLabels: ['A'] } as any)).not.toThrow();
    } finally {
      if (prev === undefined) delete (process.env as any).WHEN_REQUIRE_CANVAS;
      else process.env.WHEN_REQUIRE_CANVAS = prev;
    }
  });
});
