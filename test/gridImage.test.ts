import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderGridPng, __setCanvasModule } from '../src/util/gridImage.js';
import { PNG } from 'pngjs';
import { makeFakeCanvasModule } from './helpers.js';

function readPixelRGBA(png: any, x: number, y: number): [number, number, number, number] {
  const idx = (png.width * y + x) << 2;
  const d = png.data;
  return [d[idx], d[idx + 1], d[idx + 2], d[idx + 3]];
}

describe('gridImage renderer (canvas path suite 2)', () => {
  let originalCanvas: any;
  beforeEach(() => {
    originalCanvas = null;
    __setCanvasModule(makeFakeCanvasModule());
  });
  afterEach(() => {
    __setCanvasModule(originalCanvas);
  });

  it('returns expected dimensions with scaled defaults (~50% larger)', () => {
    // 2x3 grid
    const matrix = [ [true, false, true], [false, true, false] ];
    const { width, height } = renderGridPng(matrix, {});

    // Fallback (pngjs) defaults after scaling:
    const cellSize = 99;
    const cellGap = 9;
    const padding = 24;
    const headerHeight = 72;
    const rowFontSize = 33; const pxChar = rowFontSize * 0.6;
    const avatarSize = Math.min(Math.floor(cellSize * 0.8), 84);
    const labelGap = 21;
    const labels = [] as string[];
    const spaceWidth = Math.ceil(1 * pxChar);
    const computedRowLabelWidth = labels.length ? (avatarSize + labelGap + Math.ceil(0) + spaceWidth) : Math.floor(cellSize * 1.8);
    const rowLabelWidth = Math.max(240, computedRowLabelWidth);

    const rows = matrix.length;
    const cols = matrix[0]!.length;
    const gridW = cols * cellSize + Math.max(0, cols - 1) * cellGap;
    const gridH = rows * cellSize + Math.max(0, rows - 1) * cellGap;

    const expectedW = padding * 2 + rowLabelWidth + gridW;
    const expectedH = padding * 2 + headerHeight + gridH;

    expect(width).toBe(expectedW);
    expect(height).toBe(expectedH);
  });

  it('highlights columns gold when all real-voters are available', () => {
    // 2 rows, 2 cols: column 0 all true; column 1 not all true
    const matrix = [ [true, true], [true, false] ];
    const { buffer } = renderGridPng(matrix, {});
    const png = PNG.sync.read(buffer as any);

    const cellSize = 99;
    const cellGap = 9;
    const padding = 24;
    const headerHeight = 72;
    const rowFontSize = 33; const pxChar = rowFontSize * 0.6;
    const avatarSize = Math.min(Math.floor(cellSize * 0.8), 84);
    const labelGap = 21;
    const labels = [] as string[];
    const spaceWidth = Math.ceil(1 * pxChar);
    const computedRowLabelWidth = labels.length ? (avatarSize + labelGap + Math.ceil(0) + spaceWidth) : Math.floor(cellSize * 1.8);
    const rowLabelWidth = Math.max(240, computedRowLabelWidth);

    // pick a pixel inside row 0, col 0
    const col0x = padding + rowLabelWidth + 0 * (cellSize + cellGap) + 3;
    const row0y = padding + headerHeight + 0 * (cellSize + cellGap) + 3;
    const [r0, g0, b0, a0] = readPixelRGBA(png, col0x, row0y);

    // gold #FD69DE => (253,105,222)
    expect([r0, g0, b0, a0]).toEqual([253, 105, 222, 255]);

    // pick a pixel inside row 0, col 1 (should NOT be gold)
    const col1x = padding + rowLabelWidth + 1 * (cellSize + cellGap) + 3;
    const [r1, g1, b1, a1] = readPixelRGBA(png, col1x, row0y);

    // onColor for true is #2ecc71 => (46, 204, 113)
    expect([r1, g1, b1, a1]).toEqual([46, 204, 113, 255]);
  });

  it('treats rows with no real selections as non-voters when computing gold columns', () => {
    // Row 0 has a true in column 0; Row 1 has no trues -> non-voter
    // Column 0 should be gold (all real-voters available), column 1 should be offColor
    const matrix = [ [true, false], [false, false] ];
    const { buffer } = renderGridPng(matrix, {});
    const png = PNG.sync.read(buffer as any);

    const cellSize = 99;
    const cellGap = 9;
    const padding = 24;
    const headerHeight = 72;
    const rowFontSize = 33; const pxChar = rowFontSize * 0.6;
    const avatarSize = Math.min(Math.floor(cellSize * 0.8), 84);
    const labelGap = 21;
    const labels = [] as string[];
    const spaceWidth = Math.ceil(1 * pxChar);
    const computedRowLabelWidth = labels.length ? (avatarSize + labelGap + Math.ceil(0) + spaceWidth) : Math.floor(cellSize * 1.8);
    const rowLabelWidth = Math.max(240, computedRowLabelWidth);

    const row0y = padding + headerHeight + 0 * (cellSize + cellGap) + 3;

    // Column 0: expect gold
    const col0x = padding + rowLabelWidth + 0 * (cellSize + cellGap) + 3;
    const [r0, g0, b0] = readPixelRGBA(png, col0x, row0y);
    expect([r0, g0, b0]).toEqual([253, 105, 222]);

    // Column 1: expect offColor (since matrix[0][1] is false)
    const col1x = padding + rowLabelWidth + 1 * (cellSize + cellGap) + 3;
    const [r1, g1, b1] = readPixelRGBA(png, col1x, row0y);
    expect([r1, g1, b1]).toEqual([210, 214, 219]);
  });

  it('supports custom onColor/offColor when provided', () => {
    // Use a matrix with no fully-true columns (to avoid gold override)
    const matrix = [ [true, false], [false, true] ];
    const { buffer } = renderGridPng(matrix, { onColor: '#0000FF', offColor: '#FF0000' });
    const png = PNG.sync.read(buffer as any);

    const cellSize = 99; const cellGap = 9; const padding = 24; const headerHeight = 72; const rowFontSize = 33; const pxChar = rowFontSize * 0.6;
    const avatarSize = Math.min(Math.floor(cellSize * 0.8), 84);
    const labelGap = 21; const spaceWidth = Math.ceil(1 * pxChar);
    const rowLabelWidth = Math.max(240, avatarSize + labelGap + Math.ceil('A'.length * pxChar) + spaceWidth);

    const y = padding + headerHeight + 0 * (cellSize + cellGap) + 3;
    const xOn = padding + rowLabelWidth + 0 * (cellSize + cellGap) + 3; // row0 col0 is true
    const xOff = padding + rowLabelWidth + 1 * (cellSize + cellGap) + 3; // row0 col1 is false

    const [rOn, gOn, bOn] = readPixelRGBA(png, xOn, y);
    const [rOff, gOff, bOff] = readPixelRGBA(png, xOff, y);
    expect([rOn, gOn, bOn]).toEqual([0,0,255]);
    expect([rOff, gOff, bOff]).toEqual([255,0,0]);
  });

  it('does not mark columns gold when votersRealCount is 0 (all rows have no trues)', () => {
    const matrix = [ [false, false], [false, false] ];
    const { buffer } = renderGridPng(matrix, {});
    const png = PNG.sync.read(buffer as any);

    const cellSize = 99; const cellGap = 9; const padding = 24; const headerHeight = 72; const rowFontSize = 33; const pxChar = rowFontSize * 0.6;
    const avatarSize = Math.min(Math.floor(cellSize * 0.8), 84);
    const labelGap = 21; const spaceWidth = Math.ceil(1 * pxChar);
    const rowLabelWidth = Math.max(240, avatarSize + labelGap + Math.ceil('A'.length * pxChar) + spaceWidth);

    const y = padding + headerHeight + 0 * (cellSize + cellGap) + 3;
    const x0 = padding + rowLabelWidth + 0 * (cellSize + cellGap) + 3;
    const [r, g, b] = readPixelRGBA(png, x0, y);
    expect([r, g, b]).toEqual([210,214,219]);
  });

  it('honors explicit rowLabelWidth override', () => {
    const matrix = [ [true] ];
    const { width } = renderGridPng(matrix, { rowLabelWidth: 300 });
    const cellSize = 99; const cellGap = 9; const padding = 24; const rows = 1; const cols = 1;
    const gridW = cols * cellSize + Math.max(0, cols - 1) * cellGap;
    expect(width).toBe(padding * 2 + 300 + gridW);
  });

  it('ignores header drawing when colHeaders length does not match cols', () => {
    const matrix = [ [true, false, true] ];
    const { buffer } = renderGridPng(matrix, { colHeaders: ['OnlyOne'] });
    const png = PNG.sync.read(buffer as any);
    expect(png.width).toBeGreaterThan(0);
  });
});
