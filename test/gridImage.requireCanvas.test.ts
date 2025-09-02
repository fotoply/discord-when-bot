import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderGridPng, __setCanvasModule } from '../src/util/gridImage.js';

describe('gridImage require-canvas behavior (isolated)', () => {
  let prev: string | undefined;
  let originalCanvas: any;

  beforeEach(() => {
    prev = process.env.WHEN_REQUIRE_CANVAS;
    originalCanvas = null;
  });
  afterEach(() => {
    if (prev === undefined) delete (process.env as any).WHEN_REQUIRE_CANVAS;
    else process.env.WHEN_REQUIRE_CANVAS = prev;
    __setCanvasModule(originalCanvas);
  });

  it('throws when WHEN_REQUIRE_CANVAS=1 and no canvas is available', () => {
    process.env.WHEN_REQUIRE_CANVAS = '1';
    __setCanvasModule(null);
    expect(() => renderGridPng([[true]], {} as any)).toThrow(/node-canvas is required/);
  });
});

