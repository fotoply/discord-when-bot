import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PNG } from 'pngjs';
import { __setCanvasModule, renderGridPng } from '../src/util/gridImage.js';
import { makeFakeCanvasModule } from './helpers.js';

describe('gridImage edge branches: empty and mismatched labels', () => {
  let original: any;
  beforeEach(() => { original = null; });
  afterEach(() => { __setCanvasModule(original); });

  it('uses spaceWidth fallback when measureText(" ") returns 0', () => {
    __setCanvasModule(makeFakeCanvasModule({ spaceWidthZero: true }));
    const { buffer } = renderGridPng([[true]], { rowLabels: ['AL'] });
    const png = PNG.sync.read(buffer as any);
    expect(png.width).toBeGreaterThan(0);
  });

  it('catches errors when drawing avatar images and continues', () => {
    __setCanvasModule(makeFakeCanvasModule({ imageThrows: true }));
    // provide a non-empty avatar buffer to enter the try {} block
    const avatar = Buffer.from([1,2,3]);
    const { buffer } = renderGridPng([[true]], { rowLabels: ['A'], rowAvatars: [avatar] as any });
    const png = PNG.sync.read(buffer as any);
    expect(png.height).toBeGreaterThan(0);
  });
});

// Additional cases to exercise more branches
describe('gridImage additional error and no-voter branches', () => {
  it('gracefully handles avatar image load errors (try/catch branch)', () => {
    __setCanvasModule(makeFakeCanvasModule({ imageThrows: true }));
    const matrix = [[true]];
    const res = renderGridPng(matrix, { rowLabels: ['A'] as any, rowAvatars: [Buffer.from([1,2,3])] as any, bgColor: '#000000' });
    // If the image load threw, rendering should still succeed
    expect(res.width).toBeGreaterThan(0);
    expect(res.height).toBeGreaterThan(0);
  });

  it('does not mark columns gold when no voters selected any real date (votersRealCount=0)', () => {
    __setCanvasModule(makeFakeCanvasModule());
    // All false -> votersRealCount = 0
    const matrix = [[false, false], [false, false]];
    const { buffer } = renderGridPng(matrix, { rowLabels: ['A','B'] as any });
    const png = PNG.sync.read(buffer as any);

    const cellSize = 99, cellGap = 9, padding = 24, headerHeight = 72;
    const rowFontSize = 33, charW = Math.ceil(rowFontSize * 0.6);
    const avatarSize = Math.min(Math.floor(cellSize * 0.8), 84);
    const labelGap = 21;
    const maxLabelWidth = Math.max('A'.length, 'B'.length) * charW;
    const spaceWidth = charW;
    const rowLabelWidth = Math.max(240, avatarSize + labelGap + Math.ceil(maxLabelWidth) + spaceWidth);

    const y = padding + headerHeight + 1; // inside first row
    const x0 = padding + rowLabelWidth + 0 * (cellSize + cellGap) + 1;
    const idx0 = (png.width * y + x0) << 2;
    // offColor default is #d2d6db -> [210,214,219,255]
    expect([png.data[idx0], png.data[idx0+1], png.data[idx0+2], png.data[idx0+3]]).toEqual([210,214,219,255]);
  });
});
