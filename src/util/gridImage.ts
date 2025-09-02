import { PNG } from 'pngjs';

export type GridImageOptions = {
    cellSize?: number; // pixels per cell
    cellGap?: number; // gap between cells
    padding?: number; // outer padding
    onColor?: [number, number, number]; // RGB for selected true
    offColor?: [number, number, number]; // RGB for selected false
    bgColor?: [number, number, number]; // background
};

export function renderGridPng(matrix: boolean[][], opts: GridImageOptions = {}): { buffer: Buffer; width: number; height: number } {
    const cellSize = opts.cellSize ?? 22;
    const cellGap = opts.cellGap ?? 2;
    const padding = opts.padding ?? 8;
    const on = opts.onColor ?? [46, 204, 113]; // green
    const off = opts.offColor ?? [210, 214, 219]; // light gray
    const bg = opts.bgColor ?? [255, 255, 255]; // white

    const rows = matrix.length;
    const firstRow: boolean[] = matrix[0] ?? [];
    const cols = rows > 0 ? firstRow.length : 0;

    const gridW = cols * cellSize + Math.max(0, cols - 1) * cellGap;
    const gridH = rows * cellSize + Math.max(0, rows - 1) * cellGap;

    const width = padding * 2 + gridW;
    const height = padding * 2 + gridH;

    const png = new PNG({ width, height });

    // Fill background
    fillRect(png, 0, 0, width, height, bg[0], bg[1], bg[2], 255);

    // Draw cells
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = padding + c * (cellSize + cellGap);
            const y = padding + r * (cellSize + cellGap);
            const val = !!matrix[r]?.[c];
            const color = val ? on : off;
            // draw cell rect with a 1px inner margin for subtle separation
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
