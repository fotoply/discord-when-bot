import { describe, it, expect, vi } from "vitest";
import { Polls } from "../src/store/polls.js";
import { buildPollMessage } from "../src/util/pollRender.js";
import { __setCanvasModule } from "../src/util/gridImage.js";
import { makeFakeCanvasModule } from "./helpers.js";
import * as gridImage from "../src/util/gridImage.js";

describe("pollRender grid extras integration", () => {
  it("passes resolver labels to renderGridPng when rowLabels are omitted", () => {
    __setCanvasModule(makeFakeCanvasModule());
    const poll = Polls.createPoll({
      channelId: "grid-extra",
      creatorId: "creator",
      dates: ["2025-08-01"],
    });
    Polls.toggle(poll.id, "2025-08-01", "user-a");
    Polls.toggleViewMode(poll.id);

    const extras = {
      userIds: ["user-a"],
      userLabelResolver: (id: string) => (id === "user-a" ? "Alpha" : id),
    };

    const spy = vi
      .spyOn(gridImage, "renderGridPng")
      .mockReturnValue({ buffer: Buffer.from([]) } as any);

    buildPollMessage(poll, extras as any);

    expect(spy).toHaveBeenCalled();
    const call = spy.mock.calls.at(0);
    const options = call?.[1];
    expect(options?.rowLabels).toEqual(["Alpha"]);
    spy.mockRestore();
  });
});
