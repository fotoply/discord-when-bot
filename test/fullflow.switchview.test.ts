import { beforeEach, describe, expect, it, vi } from 'vitest';
import InteractionCreateMod from '../src/listeners/interactionCreate.js';
import WhenCommandMod from '../src/commands/when.js';
import { Polls } from '../src/store/polls.js';
import { buildFutureDates } from '../src/util/date.js';
import { __setCanvasModule } from '../src/util/gridImage.js';
import { PNG } from 'pngjs';

function makeFakeCanvasModule() {
  return {
    createCanvas(width: number, height: number) {
      const rects: Array<{ x: number; y: number; w: number; h: number; color: string }> = [];
      let currentFill = '#000000';
      let currentFont = 'bold 10px sans-serif';
      let currentBaseline = 'alphabetic';
      const ctx = {
        fillStyle: currentFill,
        font: currentFont,
        textBaseline: currentBaseline,
        clearRect: (_x: number, _y: number, _w: number, _h: number) => {},
        fillRect: (x: number, y: number, w: number, h: number) => {
          rects.push({ x, y, w, h, color: (ctx as any).fillStyle });
        },
        fillText: (_text: string, _x: number, _y: number) => {},
        measureText: (text: string) => {
          const m = /\b(\d+)px\b/.exec((ctx as any).font as string);
          const px = m ? parseInt(m[1]!, 10) : 10;
          const width = Math.ceil(text.length * (px * 0.6));
          return { width } as any;
        },
        beginPath: () => {},
        arc: (_x: number, _y: number, _r: number, _s: number, _e: number) => {},
        closePath: () => {},
        clip: () => {},
        save: () => {},
        restore: () => {},
        drawImage: (_img: any, _x: number, _y: number, _w: number, _h: number) => {},
        fill: () => {},
      } as any;
      Object.defineProperty(ctx, 'fillStyle', {
        get() { return currentFill; },
        set(v: any) { currentFill = v; },
      });
      Object.defineProperty(ctx, 'font', {
        get() { return currentFont; },
        set(v: any) { currentFont = v; },
      });
      Object.defineProperty(ctx, 'textBaseline', {
        get() { return currentBaseline; },
        set(v: any) { currentBaseline = v; },
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
            const color = r.color as string;
            let rr = 255, gg = 255, bb = 255, aa = 255;
            if (color?.startsWith('#')) {
              const h = color.slice(1);
              const num = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
              rr = (num >> 16) & 255; gg = (num >> 8) & 255; bb = num & 255; aa = 255;
            } else if (typeof color === 'string') {
              const m = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/i);
              if (m) { rr = parseInt(m[1]!, 10); gg = parseInt(m[2]!, 10); bb = parseInt(m[3]!, 10); aa = Math.round((m[4] ? parseFloat(m[4]!) : 1) * 255); }
            }
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
    Image: class { src: any }
  };
}

class EventBus {
  private handlers: Array<(i: any) => Promise<void> | void> = [];
  onInteraction(handler: (i: any) => Promise<void> | void) { this.handlers.push(handler); }
  async emitInteraction(i: any) { for (const h of this.handlers) await h(i); }
}

class FakeChannel {
  public id: string;
  public sent: Array<{ content: string; components?: any[]; files?: any[]; id: string }> = [];
  private seq = 0;
  constructor(id: string) { this.id = id; }
  isTextBased() { return true; }
  async send(payload: { content: string; components?: any[]; files?: any[] }) {
    const id = `m-${++this.seq}`;
    this.sent.push({ ...payload, id });
    return { id };
  }
}

class MockFramework {
  public bus = new EventBus();
  public interactionListener: any;
  public channels = new Map<string, FakeChannel>();
  private commands = new Map<string, any>();
  constructor() {
    this.interactionListener = new (InteractionCreateMod as any)({}, {});
    this.bus.onInteraction((i) => this.interactionListener.run(i));
    this.commands.set('when', (WhenCommandMod as any));
  }
  getChannel(id: string) { if (!this.channels.has(id)) this.channels.set(id, new FakeChannel(id)); return this.channels.get(id)!; }
  async emitSlash(commandName: string, options?: { channelId?: string }) {
    const CmdClass = this.commands.get(commandName);
    const channel = this.getChannel(options?.channelId ?? 'chan-x');
    const interaction: any = { commandName, reply: vi.fn().mockResolvedValue(undefined), channel, inGuild: () => true };
    await (CmdClass as any).prototype.chatInputRun.call({ name: commandName }, interaction);
    return interaction;
  }
  async emitSelect(customId: string, values: string[], userId: string, channelId = 'chan-x') {
    const channel = this.getChannel(channelId);
    const interaction: any = { isStringSelectMenu: () => true, isButton: () => false, customId, values, user: { id: userId }, inGuild: () => true, channel, update: vi.fn().mockResolvedValue(undefined), reply: vi.fn().mockResolvedValue(undefined) };
    await this.bus.emitInteraction(interaction); return interaction;
  }
  async emitButton(customId: string, userId: string, extras?: Partial<any>) {
    const interaction: any = { isButton: () => true, isStringSelectMenu: () => false, customId, user: { id: userId }, update: vi.fn().mockResolvedValue(undefined), reply: vi.fn().mockResolvedValue(undefined), ...extras };
    await this.bus.emitInteraction(interaction); return interaction;
  }
}

describe('Full-flow: Switch view toggles grid and back', () => {
  let fw: MockFramework;
  beforeEach(() => {
    vi.restoreAllMocks();
    __setCanvasModule(makeFakeCanvasModule());
    fw = new MockFramework();
  });

  it('creates a poll via /when, then Switch view toggles grid image on and off', async () => {
    // Create poll with a small date range
    const slash = await fw.emitSlash('when', { channelId: 'chan-sv' });
    expect(slash.reply).toHaveBeenCalled();

    const future = buildFutureDates(10);
    const first = future[0]!;
    const last = future[1]!;
    await fw.emitSelect('when:first', [first], 'creatorSV', 'chan-sv');
    const lastIx = await fw.emitSelect('when:last', [last], 'creatorSV', 'chan-sv');
    expect(lastIx.update).toHaveBeenCalled();

    const poll = Polls.allOpen()[0]!;

    // Toggle to grid
    const viewBtn = `when:view:${poll.id}`;
    const ix1 = await fw.emitButton(viewBtn, 'creatorSV');
    expect(ix1.update).toHaveBeenCalled();
    const arg1 = ix1.update.mock.calls[0][0];
    expect(arg1.content).toBe('');
    expect(Array.isArray(arg1.files)).toBe(true);
    const names1 = (arg1.files || []).map((f: any) => f?.name);
    expect(names1).toContain('grid.png');

    // Toggle back to list
    const ix2 = await fw.emitButton(viewBtn, 'creatorSV');
    expect(ix2.update).toHaveBeenCalled();
    const arg2 = ix2.update.mock.calls[0][0];
    expect(typeof arg2.content).toBe('string');
    expect(Array.isArray(arg2.files)).toBe(true);
    expect(arg2.files.length).toBe(0);
  });
});
