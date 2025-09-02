// @ts-nocheck
import type { Buffer as NodeBuffer } from 'node:buffer';
// Conditional grid image renderer: prefer node-canvas if available, otherwise fallback to pngjs
import { createRequire } from 'node:module';
const requireCjs = createRequire(import.meta.url);

export type GridImageOptions = {
    cellSize?: number;
    cellGap?: number;
    padding?: number;
    headerHeight?: number;
    rowLabelWidth?: number;
    onColor?: string; // CSS color
    offColor?: string; // CSS color
    bgColor?: string; // CSS color, can be transparent
    colHeaders?: string[]; // length = cols
    rowLabels?: string[]; // length = rows
    rowAvatars?: (NodeBuffer | undefined)[]; // optional avatar buffers per row (used by canvas path)
    fontFamily?: string; // e.g., 'sans-serif'
};

let CanvasMod: any = null;
try {
    CanvasMod = requireCjs('canvas');
} catch {
    CanvasMod = null;
}

let PNGSyncMod: any = null;
try {
    PNGSyncMod = requireCjs('pngjs');
} catch {
    PNGSyncMod = null;
}

export function renderGridPng(matrix: boolean[][], opts: GridImageOptions = {}): { buffer: NodeBuffer; width: number; height: number } {
    const requireCanvas = process.env.WHEN_REQUIRE_CANVAS === '1';
    if (requireCanvas && !CanvasMod?.createCanvas) {
        throw new Error('node-canvas is required (WHEN_REQUIRE_CANVAS=1) but not available. Ensure Node 20 and install canvas.');
    }
    if (CanvasMod?.createCanvas) return renderWithCanvas(matrix, opts);
    return renderWithPngjs(matrix, opts);
}

function renderWithCanvas(matrix: boolean[][], opts: GridImageOptions): { buffer: NodeBuffer; width: number; height: number } {
    const { createCanvas, Image } = CanvasMod as any;

    // scale up defaults by ~50%
    const cellSize = opts.cellSize ?? 99; // was 66
    const cellGap = opts.cellGap ?? 9; // was 6
    const padding = opts.padding ?? 24; // was 16
    const headerHeight = opts.headerHeight ?? 72; // was 48
    const onColor = opts.onColor ?? '#2ecc71';
    const offColor = opts.offColor ?? '#d2d6db';
    const bgColor = opts.bgColor ?? 'rgba(0,0,0,0)';
    const fontFamily = opts.fontFamily ?? 'sans-serif';

    const rows = matrix.length;
    const cols = rows > 0 ? (matrix[0]?.length ?? 0) : 0;

    // Determine which rows represent users who picked at least one real date
    const rowHasAnyTrue: boolean[] = matrix.map((row) => row?.some(Boolean) ?? false);
    const votersRealCount = rowHasAnyTrue.filter(Boolean).length;

    // Compute columns where everyone (who picked any real date) is available
    const colAllTrue: boolean[] = Array.from({ length: cols }, (_, c) =>
        votersRealCount > 0 && matrix.every((row, r) => !rowHasAnyTrue[r] || !!row?.[c])
    );
    const goldColor = '#D4AF37'; // gold

    // Measure row label width dynamically
    const measureCanvas = createCanvas(10, 10);
    const mctx = measureCanvas.getContext('2d');
    const rowFontSize = 33; // was 22
    mctx.font = `bold ${rowFontSize}px ${fontFamily}`;
    let maxLabelWidth = 0;
    const labels = opts.rowLabels ?? [];
    for (const label of labels) {
        const w = mctx.measureText((label ?? '').toString().toUpperCase()).width;
        if (w > maxLabelWidth) maxLabelWidth = w;
    }
    // compute the width of a single space in current font for trailing gap
    const spaceWidth = Math.ceil(mctx.measureText(' ').width || rowFontSize * 0.5);

    // avatar + gaps
    const avatarSize = Math.min(Math.floor(cellSize * 0.8), 84); // cap scaled up from 56
    const labelGap = 21; // was 14, gap between avatar and text
    const computedRowLabelWidth = (opts.rowLabels && labels.length
        ? (avatarSize + labelGap + Math.ceil(maxLabelWidth) + spaceWidth) // add trailing gap roughly one space
        : Math.floor(cellSize * 1.8));
    const rowLabelWidth = opts.rowLabelWidth ?? Math.max(240, computedRowLabelWidth); // was 160

    const gridW = cols * cellSize + Math.max(0, cols - 1) * cellGap;
    const gridH = rows * cellSize + Math.max(0, rows - 1) * cellGap;

    const width = padding * 2 + rowLabelWidth + gridW;
    const height = padding * 2 + headerHeight + gridH;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.clearRect(0, 0, width, height);
    if (bgColor !== 'rgba(0,0,0,0)') {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);
    }

    // Column headers (support multi-line labels like 'Tue\n2/9')
    const headerFontSize = 30; // was 20
    if ((opts.colHeaders ?? []).length === cols) {
        ctx.fillStyle = '#b4b8bd';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${headerFontSize}px ${fontFamily}`;
        for (let c = 0; c < cols; c++) {
            const raw = (opts.colHeaders![c] ?? '').toString();
            const lines = raw.split(/\n/);
            const cellX = padding + rowLabelWidth + c * (cellSize + cellGap);
            // compute total text block height
            const lineHeight = headerFontSize + 3;
            const totalH = lineHeight * lines.length;
            const startY = padding + Math.floor((headerHeight - totalH) / 2) + Math.floor(lineHeight / 2);
            for (let i = 0; i < lines.length; i++) {
                const label = lines[i].toUpperCase();
                const metrics = ctx.measureText(label);
                const textW = metrics.width;
                const centerX = cellX + Math.floor((cellSize - textW) / 2);
                const y = startY + i * lineHeight;
                ctx.fillText(label, centerX, y);
            }
        }
    }

    // Row labels (avatar + text)
    if ((opts.rowLabels ?? []).length === rows) {
        ctx.fillStyle = '#c8ccd1';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${rowFontSize}px ${fontFamily}`;
        for (let r = 0; r < rows; r++) {
            const label = (opts.rowLabels![r] ?? '').toString();
            const y = padding + headerHeight + r * (cellSize + cellGap);
            const cy = y + Math.floor(cellSize / 2);
            const ax = padding + Math.floor(avatarSize / 2);
            const ay = cy;

            const avatarBuf = opts.rowAvatars?.[r];
            if (avatarBuf && avatarBuf.length > 0) {
                try {
                    const img = new Image();
                    img.src = avatarBuf;
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(ax, ay, Math.floor(avatarSize / 2), 0, Math.PI * 2);
                    ctx.closePath();
                    ctx.clip();
                    ctx.drawImage(img, ax - avatarSize / 2, ay - avatarSize / 2, avatarSize, avatarSize);
                    ctx.restore();
                } catch {}
            } else {
                ctx.save();
                ctx.beginPath();
                ctx.arc(ax, ay, Math.floor(avatarSize / 2), 0, Math.PI * 2);
                ctx.closePath();
                ctx.fillStyle = '#99aab5';
                ctx.fill();
                ctx.restore();
            }

            ctx.fillStyle = '#c8ccd1';
            const textX = padding + avatarSize + labelGap;
            ctx.fillText(label.toUpperCase(), textX, cy);
        }
    }

    // Grid cells
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = padding + rowLabelWidth + c * (cellSize + cellGap);
            const y = padding + headerHeight + r * (cellSize + cellGap);
            const isGold = colAllTrue[c];
            ctx.fillStyle = isGold ? goldColor : (matrix[r]?.[c] ? onColor : offColor);
            ctx.fillRect(x, y, cellSize, cellSize);
        }
    }

    const buffer = canvas.toBuffer('image/png');
    return { buffer, width, height };
}

// Fallback: pngjs simple rectangles (no avatars, bitmap-ish labels)
function renderWithPngjs(matrix: boolean[][], opts: GridImageOptions): { buffer: Buffer; width: number; height: number } {
    const PNGSync = PNGSyncMod;
    if (!PNGSync?.PNG) {
        // minimal empty transparent image if pngjs missing
        const buf = Buffer.from(
            '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c636000000200015f0a2db40000000049454e44ae426082',
            'hex',
        );
        return { buffer: buf, width: 1, height: 1 };
    }

    // scale up defaults by ~50%
    const cellSize = opts.cellSize ?? 54; // was 36
    const cellGap = opts.cellGap ?? 6; // was 4
    const padding = opts.padding ?? 18; // was 12
    const headerHeight = opts.headerHeight ?? 36; // was 24
    const rowLabelWidth = opts.rowLabelWidth ?? 240; // was 160
    const on = opts.onColor ?? '#2ecc71';
    const off = opts.offColor ?? '#d2d6db';

    const rows = matrix.length;
    const cols = rows > 0 ? (matrix[0]?.length ?? 0) : 0;

    // Determine which rows represent users who picked at least one real date
    const rowHasAnyTrue: boolean[] = matrix.map((row) => row?.some(Boolean) ?? false);
    const votersRealCount = rowHasAnyTrue.filter(Boolean).length;

    // Compute columns where everyone (who picked any real date) is available
    const colAllTrue: boolean[] = Array.from({ length: cols }, (_, c) =>
        votersRealCount > 0 && matrix.every((row, r) => !rowHasAnyTrue[r] || !!row?.[c])
    );
    const gold = '#D4AF37';

    const gridW = cols * cellSize + Math.max(0, cols - 1) * cellGap;
    const gridH = rows * cellSize + Math.max(0, rows - 1) * cellGap;

    const width = padding * 2 + rowLabelWidth + gridW;
    const height = padding * 2 + headerHeight + gridH;

    const { PNG } = PNGSync;
    const png = new PNG({ width, height });

    // fill transparent
    fillRect(png, 0, 0, width, height, 0, 0, 0, 0);

    // Draw grid cells only (simple fallback)
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = padding + rowLabelWidth + c * (cellSize + cellGap);
            const y = padding + headerHeight + r * (cellSize + cellGap);
            const colorHex = colAllTrue[c] ? gold : (matrix[r]?.[c] ? on : off);
            const color = hexToRgb(colorHex);
            fillRect(png, x, y, cellSize, cellSize, color[0], color[1], color[2], 255);
        }
    }

    const buffer = PNGSync.PNG.sync.write(png);
    return { buffer, width, height };
}

function fillRect(png: any, x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number) {
    const { width, height, data } = png;
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(width, x + w);
    const y1 = Math.min(height, y + h);
    for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
            const idx = (width * yy + xx) << 2;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = a;
        }
    }
}

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    const num = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}
