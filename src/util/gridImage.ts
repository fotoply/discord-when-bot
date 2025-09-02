import { PNG } from 'pngjs';

export type GridImageOptions = {
    cellSize?: number;
    cellGap?: number;
    padding?: number;
    headerHeight?: number; // space for column headers
    rowLabelWidth?: number; // space for row labels (avatar + text)
    onColor?: [number, number, number];
    offColor?: [number, number, number];
    bgColor?: [number, number, number, number]; // RGBA, allow transparent background
    colHeaders?: string[]; // length = cols
    rowLabels?: string[]; // length = rows
};

// 5x7 bitmap font for A-Z, 0-9, space, '/'
const FONT_5x7: Record<string, number[]> = {
    ' ': [0,0,0,0,0,0,0],
    '/': [0,1,1,0,0,0,0], // simple slash placeholder
    '0': [0x1E,0x33,0x35,0x39,0x33,0x1E,0x00],
    '1': [0x0C,0x0E,0x0C,0x0C,0x0C,0x1E,0x00],
    '2': [0x1E,0x33,0x06,0x0C,0x18,0x3F,0x00],
    '3': [0x3F,0x06,0x0C,0x06,0x33,0x1E,0x00],
    '4': [0x06,0x0E,0x16,0x26,0x3F,0x06,0x00],
    '5': [0x3F,0x30,0x3E,0x03,0x33,0x1E,0x00],
    '6': [0x0E,0x18,0x3E,0x33,0x33,0x1E,0x00],
    '7': [0x3F,0x03,0x06,0x0C,0x18,0x18,0x00],
    '8': [0x1E,0x33,0x1E,0x33,0x33,0x1E,0x00],
    '9': [0x1E,0x33,0x33,0x1F,0x03,0x1E,0x00],
    'A': [0x0C,0x1E,0x33,0x33,0x3F,0x33,0x00],
    'B': [0x3E,0x33,0x3E,0x33,0x33,0x3E,0x00],
    'C': [0x1E,0x33,0x30,0x30,0x33,0x1E,0x00],
    'D': [0x3C,0x36,0x33,0x33,0x36,0x3C,0x00],
    'E': [0x3F,0x30,0x3E,0x30,0x30,0x3F,0x00],
    'F': [0x3F,0x30,0x3E,0x30,0x30,0x30,0x00],
    'G': [0x1E,0x33,0x30,0x37,0x33,0x1E,0x00],
    'H': [0x33,0x33,0x3F,0x33,0x33,0x33,0x00],
    'I': [0x1E,0x0C,0x0C,0x0C,0x0C,0x1E,0x00],
    'J': [0x0F,0x06,0x06,0x06,0x36,0x1C,0x00],
    'K': [0x33,0x36,0x3C,0x36,0x33,0x33,0x00],
    'L': [0x30,0x30,0x30,0x30,0x30,0x3F,0x00],
    'M': [0x33,0x3F,0x3F,0x33,0x33,0x33,0x00],
    'N': [0x33,0x3B,0x3F,0x37,0x33,0x33,0x00],
    'O': [0x1E,0x33,0x33,0x33,0x33,0x1E,0x00],
    'P': [0x3E,0x33,0x33,0x3E,0x30,0x30,0x00],
    'Q': [0x1E,0x33,0x33,0x33,0x36,0x1D,0x00],
    'R': [0x3E,0x33,0x33,0x3E,0x36,0x33,0x00],
    'S': [0x1F,0x30,0x1E,0x03,0x03,0x3E,0x00],
    'T': [0x3F,0x0C,0x0C,0x0C,0x0C,0x0C,0x00],
    'U': [0x33,0x33,0x33,0x33,0x33,0x1E,0x00],
    'V': [0x33,0x33,0x33,0x33,0x1E,0x0C,0x00],
    'W': [0x33,0x33,0x33,0x3F,0x3F,0x33,0x00],
    'X': [0x33,0x33,0x1E,0x1E,0x33,0x33,0x00],
    'Y': [0x33,0x33,0x1E,0x0C,0x0C,0x0C,0x00],
    'Z': [0x3F,0x03,0x06,0x0C,0x18,0x3F,0x00],
};

const FALLBACK_GLYPH: number[] = [0,0,0,0,0,0,0];

function drawChar(png: PNG, x: number, y: number, ch: string, color: [number, number, number, number], scale = 1) {
    const glyph = FONT_5x7[ch] ?? FONT_5x7[' '] ?? FALLBACK_GLYPH;
    for (let row = 0; row < 7; row++) {
        const bits = glyph[row] ?? 0;
        for (let col = 0; col < 5; col++) {
            if (bits & (1 << (4 - col))) {
                fillRect(png, x + col * scale, y + row * scale, scale, scale, color[0], color[1], color[2], color[3]);
            }
        }
    }
}

function drawText(png: PNG, x: number, y: number, text: string, color: [number, number, number, number], scale = 1) {
    let cx = x;
    for (const rawCh of text) {
        const ch = rawCh.toUpperCase();
        drawChar(png, cx, y, ch, color, scale);
        cx += (5 + 1) * scale; // 1px space
    }
}

function drawCircle(png: PNG, cx: number, cy: number, radius: number, color: [number, number, number, number]) {
    const r2 = radius * radius;
    for (let y = -radius; y <= radius; y++) {
        for (let x = -radius; x <= radius; x++) {
            if (x * x + y * y <= r2) {
                fillRect(png, cx + x, cy + y, 1, 1, color[0], color[1], color[2], color[3]);
            }
        }
    }
}

function colorFromString(s: string): [number, number, number] {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const r = (h & 0xFF);
    const g = (h >> 8) & 0xFF;
    const b = (h >> 16) & 0xFF;
    return [r, g, b];
}

export function renderGridPng(
    matrix: boolean[][],
    opts: GridImageOptions = {}
): { buffer: Buffer; width: number; height: number } {
    const cellSize = opts.cellSize ?? 22;
    const cellGap = opts.cellGap ?? 2;
    const padding = opts.padding ?? 8;
    const headerHeight = opts.headerHeight ?? 14;
    const rowLabelWidth = opts.rowLabelWidth ?? 90;
    const on = opts.onColor ?? [46, 204, 113];
    const off = opts.offColor ?? [210, 214, 219];
    const bg = opts.bgColor ?? [0, 0, 0, 0]; // transparent by default

    const rows = matrix.length;
    const firstRow: boolean[] = matrix[0] ?? [];
    const cols = rows > 0 ? firstRow.length : 0;

    const gridW = cols * cellSize + Math.max(0, cols - 1) * cellGap;
    const gridH = rows * cellSize + Math.max(0, rows - 1) * cellGap;

    const width = padding * 2 + rowLabelWidth + gridW;
    const height = padding * 2 + headerHeight + gridH;

    const png = new PNG({ width, height });

    // Background (transparent or custom RGBA)
    fillRect(png, 0, 0, width, height, bg[0], bg[1], bg[2], bg[3] ?? 0);

    // Column headers
    if ((opts.colHeaders ?? []).length === cols) {
        const textColor: [number, number, number, number] = [180, 184, 189, 255];
        const scale = 1; // small text
        for (let c = 0; c < cols; c++) {
            const label = (opts.colHeaders![c] ?? '').toUpperCase();
            const textWidth = label.length * (5 + 1) * scale - 1;
            const cellX = padding + rowLabelWidth + c * (cellSize + cellGap);
            const centerX = cellX + Math.floor((cellSize - textWidth) / 2);
            const topY = padding + Math.floor((headerHeight - 7 * scale) / 2);
            drawText(png, centerX, topY, label, textColor, scale);
        }
    }

    // Row labels (avatar placeholder + text)
    if ((opts.rowLabels ?? []).length === rows) {
        const textColor: [number, number, number, number] = [200, 204, 209, 255];
        const scale = 1;
        for (let r = 0; r < rows; r++) {
            const label = (opts.rowLabels![r] ?? '').toUpperCase();
            const y = padding + headerHeight + r * (cellSize + cellGap);
            const cy = y + Math.floor(cellSize / 2);
            const cx = padding + Math.floor(cellSize / 2);
            const [rr, gg, bb] = colorFromString(label);
            drawCircle(png, cx, cy, Math.floor(cellSize * 0.4), [rr, gg, bb, 255]);
            // text next to circle
            const textX = padding + cellSize + 6; // circle + margin
            const textY = y + Math.floor((cellSize - 7 * scale) / 2);
            drawText(png, textX, textY, label, textColor, scale);
        }
    }

    // Grid cells
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = padding + rowLabelWidth + c * (cellSize + cellGap);
            const y = padding + headerHeight + r * (cellSize + cellGap);
            const val = !!matrix[r]?.[c];
            const color = val ? on : off;
            fillRect(png, x, y, cellSize, cellSize, color[0], color[1], color[2], 255);
        }
    }

    const buffer = PNG.sync.write(png);
    return { buffer, width, height };
}

function fillRect(png: PNG, x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number) {
    const { width, height, data } = png as any;
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
