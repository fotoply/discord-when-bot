import {beforeEach, describe, expect, it, vi} from 'vitest';
import {Polls} from '../src/store/polls.js';
import {buildPollMessage} from '../src/util/pollRender.js';
import { __setCanvasModule } from '../src/util/gridImage.js';
import { PNG } from 'pngjs';

function makeFakeCanvasModule() {
    return {
        createCanvas(width: number, height: number) {
            const rects: Array<{x:number,y:number,w:number,h:number,color:string}> = [];
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
                    const px = m ? parseInt(m[1],10) : 10;
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
                    // transparent base
                    for (let y = 0; y < height; y++) {
                        for (let x = 0; x < width; x++) {
                            const idx = (width * y + x) << 2;
                            png.data[idx+0] = 0;
                            png.data[idx+1] = 0;
                            png.data[idx+2] = 0;
                            png.data[idx+3] = 0;
                        }
                    }
                    // draw rects
                    for (const r of rects) {
                        const color = r.color as string;
                        let rr = 255, gg = 255, bb = 255, aa = 255;
                        if (color?.startsWith('#')) {
                            const h = color.slice(1);
                            const num = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
                            rr = (num >> 16) & 255; gg = (num >> 8) & 255; bb = num & 255; aa = 255;
                        } else if (typeof color === 'string') {
                            const m = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/i);
                            if (m) { rr = parseInt(m[1],10); gg = parseInt(m[2],10); bb = parseInt(m[3],10); aa = Math.round((m[4]?parseFloat(m[4]):1)*255); }
                        }
                        for (let yy = r.y; yy < r.y + r.h; yy++) {
                            for (let xx = r.x; xx < r.x + r.w; xx++) {
                                if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
                                const idx = (width * yy + xx) << 2;
                                png.data[idx+0] = rr;
                                png.data[idx+1] = gg;
                                png.data[idx+2] = bb;
                                png.data[idx+3] = aa;
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

let listener: any;

describe('Poll view mode toggle', () => {
    beforeEach(async () => {
        __setCanvasModule(makeFakeCanvasModule());
        const mod = await import('../src/listeners/interactionCreate.js');
        const InteractionCreateListener = mod.default;
        listener = new InteractionCreateListener({} as any, {} as any);
    });

    it('buildPollMessage uses content for list mode and file for grid mode', async () => {
        const poll = Polls.createPoll({channelId: 'c-v1', creatorId: 'creatorV', dates: ['2025-08-30', '2025-08-31']});

        // Default is list
        const msg1 = buildPollMessage(poll);
        expect(msg1.content).toBeTypeOf('string');
        expect(Array.isArray(msg1.embeds)).toBe(true);
        expect((msg1.embeds as any[]).length).toBe(0);

        // Toggle to grid via interaction
        const interaction: any = {
            isButton: () => true,
            customId: `when:view:${poll.id}`,
            user: {id: 'any'},
            reply: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.update).toHaveBeenCalled();
        const arg = interaction.update.mock.calls[0][0];
        expect(arg.content).toBe('');
        expect(Array.isArray(arg.embeds)).toBe(true);
        expect(arg.embeds.length).toBe(0);
        expect(Array.isArray(arg.files)).toBe(true);
        expect(arg.files.length).toBeGreaterThanOrEqual(1);

        // Toggle back to list
        interaction.update.mockClear();
        await listener.run(interaction);
        const arg2 = interaction.update.mock.calls[0][0];
        expect(arg2.content).toBeTypeOf('string');
        expect(Array.isArray(arg2.embeds)).toBe(true);
        expect(arg2.embeds.length).toBe(0);
        expect(Array.isArray(arg2.files)).toBe(true);
        expect(arg2.files.length).toBe(0);
    });

    it('grid view uses a standalone PNG image when there are voters', async () => {
        const poll = Polls.createPoll({channelId: 'c-v2', creatorId: 'creatorV2', dates: ['2025-08-30', '2025-08-31']});
        // add some votes so users appear as rows
        Polls.toggle(poll.id, '2025-08-30', 'u1');
        Polls.toggle(poll.id, '2025-08-31', 'u2');

        const interaction: any = {
            isButton: () => true,
            customId: `when:view:${poll.id}`,
            user: {id: 'any'},
            reply: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        const arg = interaction.update.mock.calls[0][0];
        expect(Array.isArray(arg.files)).toBe(true);
        const fileNames = (arg.files || []).map((f: any) => f?.name);
        expect(fileNames).toContain('grid.png');
        expect(Array.isArray(arg.embeds)).toBe(true);
        expect(arg.embeds.length).toBe(0);
    });

    it('grid view attaches a PNG image (no embed image)', async () => {
        const poll = Polls.createPoll({channelId: 'c-v3', creatorId: 'creatorV3', dates: ['2025-08-30', '2025-08-31']});
        // two voters so matrix has 2 rows
        Polls.toggle(poll.id, '2025-08-30', 'u1');
        Polls.toggle(poll.id, '2025-08-31', 'u2');

        const interaction: any = {
            isButton: () => true,
            customId: `when:view:${poll.id}`,
            user: {id: 'any'},
            reply: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        const arg = interaction.update.mock.calls[0][0];
        // files should include our grid.png
        expect(Array.isArray(arg.files)).toBe(true);
        const fileNames = (arg.files || []).map((f: any) => f?.name);
        expect(fileNames).toContain('grid.png');
        // no embeds should be present in grid mode
        expect(Array.isArray(arg.embeds)).toBe(true);
        expect(arg.embeds.length).toBe(0);
    });
});
