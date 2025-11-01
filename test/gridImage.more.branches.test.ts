// filepath: c:\Users\norbe\IdeaProjects\discord-when-bot\test\gridImage.more.branches.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { PNG } from "pngjs";
import { renderGridPng, __setCanvasModule } from "../src/util/gridImage.js";
import { makeFakeCanvasModule } from "./helpers.js";

describe("gridImage additional branch coverage (extra cases)", () => {
  afterEach(() => {
    __setCanvasModule(undefined);
  });

  it("skips drawing row labels when rowLabels length does not match rows", () => {
    __setCanvasModule(makeFakeCanvasModule());
    const matrix = [
      [true, false],
      [false, true],
    ];
    // provide wrong number of row labels (only 1 for 2 rows)
    const { buffer, width, height } = renderGridPng(matrix, {
      rowLabels: ["OnlyOne"] as any,
      bgColor: "#000000",
    });
    const png = PNG.sync.read(buffer as any);
    // image should still render and dimensions should match returned values
    expect(png.width).toBe(width);
    expect(png.height).toBe(height);
  });

  it("handles a matrix with an empty inner array (cols = 0) without throwing", () => {
    __setCanvasModule(makeFakeCanvasModule());
    const matrix = [[]]; // one row, zero cols
    const res = renderGridPng(matrix, {
      rowLabels: ["A"] as any,
      colHeaders: [] as any,
    });
    const png = PNG.sync.read(res.buffer as any);
    expect(png.width).toBe(res.width);
    expect(png.height).toBe(res.height);
    // there should be no cells drawn (width equals at least the label area + padding)
    expect(res.width).toBeGreaterThanOrEqual(240 + 24 * 2);
  });

  it("handles a matrix containing an undefined row entry gracefully", () => {
    __setCanvasModule(makeFakeCanvasModule());
    // treat an undefined row as a row with no selections
    const matrix: any = [[true], undefined, [false]];
    const res = renderGridPng(matrix, {
      rowLabels: ["A", "B", "C"] as any,
      bgColor: "#101010",
    });
    const png = PNG.sync.read(res.buffer as any);
    expect(png.width).toBe(res.width);
    expect(png.height).toBe(res.height);
  });

  it("accepts a custom fontFamily option and does not throw", () => {
    __setCanvasModule(makeFakeCanvasModule());
    const matrix = [[true]];
    expect(() =>
      renderGridPng(matrix, { fontFamily: "Arial", rowLabels: ["A"] as any }),
    ).not.toThrow();
  });

  it("treats provided empty rowLabels array as no labels (uses default computed width path)", () => {
    __setCanvasModule(makeFakeCanvasModule());
    const matrix = [[true]];
    // rowLabels provided but empty
    const res = renderGridPng(matrix, { rowLabels: [] as any });
    const png = PNG.sync.read(res.buffer as any);
    expect(png.width).toBe(res.width);
  });

  it("skips background fill when bgColor explicitly equals transparent rgba", () => {
    __setCanvasModule(makeFakeCanvasModule());
    const matrix = [[true]];
    const res = renderGridPng(matrix, {
      rowLabels: ["A"] as any,
      bgColor: "rgba(0,0,0,0)",
    });
    const png = PNG.sync.read(res.buffer as any);
    // top-left pixel alpha should be 0
    expect(png.data[3]).toBe(0);
  });

  it("handles matrix with first row undefined (cols fallback to 0) without throwing", () => {
    __setCanvasModule(makeFakeCanvasModule());
    const matrix: any = [undefined];
    const res = renderGridPng(matrix as any, { rowLabels: ["A"] as any });
    const png = PNG.sync.read(res.buffer as any);
    expect(png.width).toBe(res.width);
    expect(png.height).toBe(res.height);
  });

  it("treats undefined rows as non-voters when computing gold columns", () => {
    __setCanvasModule(makeFakeCanvasModule());
    const matrix: any = [[true], undefined];
    const { buffer } = renderGridPng(matrix, { rowLabels: ["A", "B"] as any });
    const png = PNG.sync.read(buffer as any);

    const cellSize = 99,
      cellGap = 9,
      padding = 24,
      headerHeight = 72;
    const rowFontSize = 33,
      charW = Math.ceil(rowFontSize * 0.6);
    const avatarSize = Math.min(Math.floor(cellSize * 0.8), 84);
    const labelGap = 21;
    const maxLabelWidth = Math.max("A".length, "B".length) * charW;
    const spaceWidth = charW;
    const rowLabelWidth = Math.max(
      240,
      avatarSize + labelGap + Math.ceil(maxLabelWidth) + spaceWidth,
    );

    const y = padding + headerHeight + 1; // row 0
    const x = padding + rowLabelWidth + 1; // col 0
    const idx = (png.width * y + x) << 2;
    // gold color
    expect([
      png.data[idx],
      png.data[idx + 1],
      png.data[idx + 2],
      png.data[idx + 3],
    ]).toEqual([253, 105, 222, 255]);
  });
});
