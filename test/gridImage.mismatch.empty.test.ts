import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PNG } from "pngjs";
import { renderGridPng, __setCanvasModule } from "../src/util/gridImage.js";
import { makeFakeCanvasModule } from "./helpers.js";

describe("gridImage edge branches: empty and mismatched labels", () => {
  let original: any;
  beforeEach(() => {
    original = null;
    __setCanvasModule(makeFakeCanvasModule());
  });
  afterEach(() => {
    __setCanvasModule(original);
  });

  it("handles empty matrix with zero headers and labels", () => {
    const { buffer, width, height } = renderGridPng([], {
      rowLabels: [],
      colHeaders: [],
    });
    const png = PNG.sync.read(buffer as any);
    expect(png.width).toBe(width);
    expect(png.height).toBe(height);
  });

  it("skips header/row rendering when lengths mismatch", () => {
    // 2 rows, 3 cols; but pass mismatched lengths to take false-branches
    const matrix = [
      [true, false, true],
      [false, true, false],
    ];
    const { buffer } = renderGridPng(matrix, {
      rowLabels: ["OnlyOne"],
      colHeaders: ["H1"],
    });
    const png = PNG.sync.read(buffer as any);
    expect(png.width).toBeGreaterThan(0);
    expect(png.height).toBeGreaterThan(0);
  });
});
