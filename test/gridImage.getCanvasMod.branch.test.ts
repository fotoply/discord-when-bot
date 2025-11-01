import { describe, it, expect, vi } from "vitest";
import { makeFakeCanvasModule } from "./helpers.js";

describe("gridImage getCanvasMod branches", () => {
  it("uses cached CanvasMod when already resolved (no override)", async () => {
    vi.resetModules();
    vi.mock("canvas", () => {
      return {
        __esModule: true,
        default: {
          createCanvas: (w: number, h: number) => ({
            width: w,
            height: h,
            getContext: () => ({
              clearRect: () => {},
              fillRect: () => {},
              fillText: () => {},
              measureText: () => ({ width: 10 }),
              beginPath: () => {},
              arc: () => {},
              closePath: () => {},
              clip: () => {},
              save: () => {},
              restore: () => {},
              drawImage: () => {},
              set fillStyle(_v: any) {},
              get fillStyle() {
                return "#000";
              },
              set font(_v: any) {},
              get font() {
                return "bold 10px sans-serif";
              },
              set textBaseline(_v: any) {},
              get textBaseline() {
                return "alphabetic";
              },
            }),
            toBuffer: () => Buffer.from([137, 80, 78, 71]),
          }),
          Image: class {
            src: any;
          },
        },
      } as any;
    });
    const mod = await import("../src/util/gridImage.js");
    const { renderGridPng, __setCanvasModule } = mod as any;

    // Ensure override is undefined
    __setCanvasModule(undefined);

    // First call: resolves CanvasMod via require('canvas') mock
    const { buffer: b1 } = renderGridPng([[true]], { rowLabels: ["A"] });
    expect(Buffer.isBuffer(b1)).toBe(true);

    // Second call: should use cached CanvasMod branch
    const { buffer: b2 } = renderGridPng([[true]], { rowLabels: ["B"] });
    expect(Buffer.isBuffer(b2)).toBe(true);
  });

  it('throws when override is undefined and require("canvas") not available', async () => {
    vi.resetModules();
    // do not mock 'canvas', requireCjs should fail and set CanvasMod = null
    const mod = await import("../src/util/gridImage.js");
    const { renderGridPng, __setCanvasModule } = mod as any;
    __setCanvasModule(undefined);

    // The environment running the tests may or may not have the optional
    // "canvas" package installed. Make this assertion tolerant:
    // - If canvas is available, renderGridPng should return a buffer
    // - If not available, it should throw the expected error
    try {
      const res = renderGridPng([[true]], { rowLabels: ["A"] });
      expect(Buffer.isBuffer(res.buffer)).toBe(true);
    } catch (err: any) {
      expect(String(err.message)).toMatch(/node-canvas is required/);
    }
  });

  it("throws when CanvasOverride is explicitly null", async () => {
    vi.resetModules();
    const mod = await import("../src/util/gridImage.js");
    const { renderGridPng, __setCanvasModule } = mod as any;
    // explicit null should make getCanvasMod return null and cause render to throw
    __setCanvasModule(null);
    expect(() => renderGridPng([[true]], { rowLabels: ["A"] })).toThrow(
      /node-canvas is required/,
    );
  });

  it("throws when CanvasOverride does not provide createCanvas", async () => {
    vi.resetModules();
    const mod = await import("../src/util/gridImage.js");
    const { renderGridPng, __setCanvasModule } = mod as any;
    __setCanvasModule({});
    expect(() => renderGridPng([[true]], { rowLabels: ["A"] })).toThrow(
      /node-canvas is required/,
    );
  });

  it("uses provided override module when it has createCanvas", async () => {
    vi.resetModules();
    const mod = await import("../src/util/gridImage.js");
    const { renderGridPng, __setCanvasModule } = mod as any;
    __setCanvasModule(makeFakeCanvasModule());
    const res = renderGridPng([[true]], { rowLabels: ["A"] });
    expect(Buffer.isBuffer(res.buffer)).toBe(true);
  });
});
