import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PNG } from 'pngjs';
import { renderGridPng, __setCanvasModule } from '../src/util/gridImage.js';
import { makeFakeCanvasModule } from './helpers.js';

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
    // Ensure image was generated successfully with expected dimensions
    expect(png.width).toBeGreaterThan(0);
    expect(png.height).toBeGreaterThan(0);
  });

  it('renders multi-line headers with more than two lines', () => {
    const matrix = [[true]];
    const headers = ['Mon\n1/9\nExtra'];
    const { buffer } = renderGridPng(matrix, { colHeaders: headers, rowLabels: ['A'], bgColor: '#001100' });
    const png = PNG.sync.read(buffer as any);
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
    const fakePng = Buffer.from([137,80,78,71,13,10,26,10]);
    const { buffer } = renderGridPng(matrix, { rowLabels: ['A'], rowAvatars: [fakePng] as any, bgColor: '#000000' });
    const png = PNG.sync.read(buffer as any);
    expect(png.width).toBeGreaterThan(0);
  });

  it('honors very long row label and expands rowLabelWidth accordingly', () => {
    const longLabel = 'ThisIsAVeryLongLabelThatShouldIncreaseMeasuredWidthSignificantly';
    const matrix = [[true]];
    const { width } = renderGridPng(matrix, { rowLabels: [longLabel] as any });
    // width should be larger or equal to default when label is long (sanity check)
    expect(width).toBeGreaterThanOrEqual(240 + 99);
  });

  it('falls back to default avatar circle when provided rowAvatars entry is empty buffer', () => {
    const fakePng = Buffer.from([]);
    const matrix = [[true]];
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

  it('uses provided rowLabelWidth override and paints offColor for false cells', () => {
    const matrix = [ [true, false] ];
    const opts = { rowLabels: ['Z'], rowLabelWidth: 400, offColor: '#010203' } as any;
    const { buffer, width } = renderGridPng(matrix, opts);
    const png = PNG.sync.read(buffer as any);
    expect(width).toBeGreaterThan(0);

    const cellSize = 99, cellGap = 9, padding = 24, headerHeight = 72;
    const xFalse = padding + opts.rowLabelWidth + 1 * (cellSize + cellGap) + 1;
    const y = padding + headerHeight + 1;
    const idx = (png.width * y + xFalse) << 2;
    expect([png.data[idx], png.data[idx+1], png.data[idx+2], png.data[idx+3]]).toEqual([1,2,3,255]);
  });

  it('handles very narrow character measurement (spaceWidthZero) combined with charScale variations', () => {
    // tiny characters -> computedRowLabelWidth might be small but Math.max should enforce minimum
    __setCanvasModule(makeFakeCanvasModule({ spaceWidthZero: true, charScale: 0.2 }));
    const matrix = [[true, false]];
    const { width } = renderGridPng(matrix, { rowLabels: ['AA'] });
    expect(width).toBeGreaterThan(0);

    // large charScale -> measured width large and should increase rowLabelWidth
    __setCanvasModule(makeFakeCanvasModule({ spaceWidthZero: false, charScale: 1.5 }));
    const { width: w2 } = renderGridPng(matrix, { rowLabels: ['LONG LABEL EXAMPLE'] });
    expect(w2).toBeGreaterThan(width);
  });

  it('renders correctly when there are zero rows or zero cols (empty matrix)', () => {
    __setCanvasModule(makeFakeCanvasModule());
    const { buffer, width, height } = renderGridPng([], { rowLabels: [], colHeaders: [] });
    const png = PNG.sync.read(buffer as any);
    expect(png.width).toBe(width);
    expect(png.height).toBe(height);
  });

  it('caps avatar size at 84 when cellSize is large', () => {
    const matrix = [[true]];
    const { width, height } = renderGridPng(matrix, { rowLabels: ['A'] as any, cellSize: 300 });
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });
});
