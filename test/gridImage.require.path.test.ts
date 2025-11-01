import { describe, it, expect, vi } from "vitest";
import { makeFakeCanvasModule } from "./helpers.js";

describe("gridImage require(path) branch", () => {
  it("loads canvas via require when override is undefined", async () => {
    vi.resetModules();
    vi.mock("canvas", () => makeFakeCanvasModule() as any);

    const mod = await import("../src/util/gridImage.js");
    const { renderGridPng, __setCanvasModule } = mod as any;

    // ensure override is undefined so getCanvasMod takes the require path
    __setCanvasModule(undefined);

    const { buffer } = renderGridPng([[true]], { rowLabels: ["A"] });
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });
});
