import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PNG } from 'pngjs';
import { __setCanvasModule, renderGridPng } from '../src/util/gridImage.js';
import { makeFakeCanvasModule } from './helpers.js';

describe('gridImage additional branches', () => {
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
