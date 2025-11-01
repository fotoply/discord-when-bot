// filepath: test/ready.import.fail.test.ts
import { describe, expect, it, vi } from "vitest";

describe("Ready listener import failure", () => {
  it("logs error when import of polls module fails", async () => {
    // Mock the dynamic import to throw by mocking the module path before import
    vi.doMock("../src/store/polls.js", () => {
      throw new Error("import failed");
    });
    const mod = await import("../src/listeners/ready.js");
    const ReadyListener = mod.default;

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Call run without passing pollsModule so it will attempt dynamic import which we've mocked to throw
    await ReadyListener.prototype.run.call({}, {} as any).catch(() => {});

    expect(errSpy).toHaveBeenCalled();

    errSpy.mockRestore();
    vi.unmock("../src/store/polls.js");
  });
});
