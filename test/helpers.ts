import { PNG } from "pngjs";
import InteractionCreateMod from "../src/listeners/interactionCreate.js";
import ReadyMod from "../src/listeners/ready.js";
import WhenCommandMod from "../src/commands/when.js";
import PollCommandMod from "../src/commands/poll.js";
import { vi } from "vitest";

export function makeFakeCanvasModule(opts?: {
  spaceWidthZero?: boolean;
  imageThrows?: boolean;
  charScale?: number;
}) {
  function parseColor(c: string): [number, number, number, number] {
    if (typeof c === "string" && c.startsWith("#")) {
      const h = c.slice(1);
      const num = parseInt(
        h.length === 3
          ? h
              .split("")
              .map((ch) => ch + ch)
              .join("")
          : h,
        16,
      );
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255, 255];
    }
    if (typeof c === "string") {
      const m = c.match(
        /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/i,
      );
      if (m)
        return [
          parseInt(m[1]!, 10),
          parseInt(m[2]!, 10),
          parseInt(m[3]!, 10),
          Math.round((m[4] ? parseFloat(m[4]!) : 1) * 255),
        ];
    }
    return [255, 255, 255, 255];
  }

  const ImageClass = opts?.imageThrows
    ? class {
        set src(_v: any) {
          throw new Error("bad image");
        }
      }
    : class {
        src: any;
      };

  const charScale =
    typeof opts?.charScale === "number" ? opts!.charScale! : 0.6;

  return {
    createCanvas(width: number, height: number) {
      const rects: Array<{
        x: number;
        y: number;
        w: number;
        h: number;
        color: string;
      }> = [];
      let currentFill = "#000000";
      let currentFont = "bold 10px sans-serif";
      let currentBaseline = "alphabetic";
      const ctx: any = {
        clearRect: (_x: number, _y: number, _w: number, _h: number) => {},
        fillRect: (x: number, y: number, w: number, h: number) => {
          rects.push({ x, y, w, h, color: ctx.fillStyle });
        },
        fillText: (_text: string, _x: number, _y: number) => {},
        measureText: (text: string) => {
          const m = /\b(\d+)px\b/.exec(ctx.font as string);
          const px = m ? parseInt(m[1]!, 10) : 10;
          if (opts?.spaceWidthZero && text === " ") return { width: 0 } as any;
          const width = Math.ceil(text.length * (px * charScale));
          return { width } as any;
        },
        beginPath: () => {},
        arc: (_x: number, _y: number, _r: number, _s: number, _e: number) => {},
        closePath: () => {},
        clip: () => {},
        save: () => {},
        restore: () => {},
        drawImage: (
          _img: any,
          _x: number,
          _y: number,
          _w: number,
          _h: number,
        ) => {},
        fill: () => {},
      };
      Object.defineProperty(ctx, "fillStyle", {
        get: () => currentFill,
        set: (v: any) => {
          currentFill = v;
        },
      });
      Object.defineProperty(ctx, "font", {
        get: () => currentFont,
        set: (v: any) => {
          currentFont = v;
        },
      });
      Object.defineProperty(ctx, "textBaseline", {
        get: () => currentBaseline,
        set: (v: any) => {
          currentBaseline = v;
        },
      });

      return {
        width,
        height,
        getContext: (_: string) => ctx,
        toBuffer: () => {
          const png = new PNG({ width, height });
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const idx = (width * y + x) << 2;
              png.data[idx] = 0;
              png.data[idx + 1] = 0;
              png.data[idx + 2] = 0;
              png.data[idx + 3] = 0;
            }
          }
          for (const r of rects) {
            const [rr, gg, bb, aa] = parseColor(r.color);
            for (let yy = r.y; yy < r.y + r.h; yy++) {
              for (let xx = r.x; xx < r.x + r.w; xx++) {
                if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
                const idx = (width * yy + xx) << 2;
                png.data[idx] = rr;
                png.data[idx + 1] = gg;
                png.data[idx + 2] = bb;
                png.data[idx + 3] = aa;
              }
            }
          }
          return PNG.sync.write(png);
        },
      };
    },
    Image: ImageClass,
  };
}

export class EventBus {
  private handlers: Array<(i: any) => Promise<void> | void> = [];
  onInteraction(handler: (i: any) => Promise<void> | void) {
    this.handlers.push(handler);
  }
  async emitInteraction(i: any) {
    for (const h of this.handlers) await h(i);
  }
}

export class FakeChannel {
  public id: string;
  public sent: Array<{
    content: string;
    components?: any[];
    files?: any[];
    id: string;
  }> = [];
  private seq = 0;
  constructor(id: string) {
    this.id = id;
  }
  isTextBased() {
    return true;
  }
  async send(payload: { content: string; components?: any[]; files?: any[] }) {
    const id = `m-${++this.seq}`;
    this.sent.push({ ...payload, id });
    return { id };
  }
}

export class MockFramework {
  public bus = new EventBus();
  public interactionListener: any;
  public readyListener: any;
  public channels = new Map<string, FakeChannel>();
  private commands = new Map<string, any>();

  constructor(options?: { registerWhen?: boolean; registerPoll?: boolean }) {
    const registerWhen = options?.registerWhen !== false;
    const registerPoll = options?.registerPoll !== false;

    this.interactionListener = new (InteractionCreateMod as any)({}, {});
    this.bus.onInteraction((i) => this.interactionListener.run(i));

    this.readyListener = new (ReadyMod as any)({}, {});

    if (registerWhen) this.commands.set("when", WhenCommandMod as any);
    if (registerPoll) this.commands.set("poll", PollCommandMod as any);
  }

  getChannel(id: string) {
    if (!this.channels.has(id)) this.channels.set(id, new FakeChannel(id));
    return this.channels.get(id)!;
  }

  async emitReady() {
    const client = {
      channels: {
        fetch: vi
          .fn()
          .mockImplementation(
            async (cid: string) => this.channels.get(cid) ?? null,
          ),
      },
    } as any;
    await this.readyListener.run(client);
  }

  async emitSlash(
    commandName: string,
    options?: { channelId?: string; userId?: string },
  ) {
    const CmdClass = this.commands.get(commandName);
    if (!CmdClass) throw new Error(`Unknown command: ${commandName}`);
    const channel = this.getChannel(options?.channelId ?? "chan-1");
    const interaction: any = {
      commandName,
      reply: vi.fn().mockResolvedValue(undefined),
      channel,
      inGuild: () => true,
    };
    await (CmdClass as any).prototype.chatInputRun.call(
      { name: commandName },
      interaction,
    );
    return interaction;
  }

  async emitSelect(
    customId: string,
    values: string[],
    userId: string,
    channelId = "chan-1",
  ) {
    const channel = this.getChannel(channelId);
    const interaction: any = {
      isStringSelectMenu: () => true,
      isButton: () => false,
      customId,
      values,
      user: { id: userId },
      inGuild: () => true,
      channel,
      update: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
    };
    await this.bus.emitInteraction(interaction);
    return interaction;
  }

  async emitButton(customId: string, userId: string, extras?: Partial<any>) {
    const interaction: any = {
      isButton: () => true,
      isStringSelectMenu: () => false,
      customId,
      user: { id: userId },
      update: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      ...(extras || {}),
    };
    await this.bus.emitInteraction(interaction);
    return interaction;
  }
}
