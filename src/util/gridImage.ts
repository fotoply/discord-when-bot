// @ts-nocheck
import type { Buffer as NodeBuffer } from "node:buffer";
import { createRequire } from "node:module";

const requireCjs = createRequire(import.meta.url);

export type GridImageOptions = {
  cellSize?: number;
  cellGap?: number;
  padding?: number;
  headerHeight?: number;
  rowLabelWidth?: number;
  onColor?: string;
  offColor?: string;
  bgColor?: string;
  colHeaders?: string[];
  rowLabels?: string[];
  rowAvatars?: (NodeBuffer | undefined)[];
  fontFamily?: string;
};

let CanvasMod: any; // resolved lazily
let CanvasOverride: any = undefined;

export function __setCanvasModule(mod: any) {
  CanvasOverride = mod;
}

function getCanvasMod(): any {
  if (CanvasOverride !== undefined) return CanvasOverride;
  if (typeof CanvasMod === "undefined") {
    try {
      CanvasMod = requireCjs("canvas");
    } catch {
      CanvasMod = null;
    }
  }
  return CanvasMod;
}

export function renderGridPng(
  matrix: boolean[][],
  opts: GridImageOptions = {},
): { buffer: NodeBuffer; width: number; height: number } {
  const Canvas = getCanvasMod();
  if (!Canvas?.createCanvas) {
    throw new Error(
      "node-canvas is required but not available. Ensure Node 20 and install canvas.",
    );
  }
  return renderWithCanvas(matrix, opts, Canvas);
}

function renderWithCanvas(
  matrix: boolean[][],
  opts: GridImageOptions,
  CanvasLib: any,
): { buffer: NodeBuffer; width: number; height: number } {
  const { createCanvas, Image } = CanvasLib as any;

  // scale up defaults by ~50%
  const cellSize = opts.cellSize ?? 99;
  const cellGap = opts.cellGap ?? 9;
  const padding = opts.padding ?? 24;
  const headerHeight = opts.headerHeight ?? 72;
  const onColor = opts.onColor ?? "#2ecc71";
  const offColor = opts.offColor ?? "#d2d6db";
  const bgColor = opts.bgColor ?? "rgba(0,0,0,0)";
  const fontFamily = opts.fontFamily ?? "sans-serif";

  const rows = matrix.length;
  const cols = rows > 0 ? (matrix[0]?.length ?? 0) : 0;

  // Determine which rows represent users who picked at least one real date
  const rowHasAnyTrue: boolean[] = matrix.map(
    (row) => row?.some(Boolean) ?? false,
  );
  const votersRealCount = rowHasAnyTrue.filter(Boolean).length;

  // Compute columns where everyone (who picked any real date) is available
  const colAllTrue: boolean[] = Array.from(
    { length: cols },
    (_, c) =>
      votersRealCount > 0 &&
      matrix.every((row, r) => !rowHasAnyTrue[r] || !!row?.[c]),
  );
  const goldColor = "#FD69DE"; // vibrant pinkish gold for visibility

  // Measure row label width dynamically
  const measureCanvas = createCanvas(10, 10);
  const mctx = measureCanvas.getContext("2d");
  const rowFontSize = 33; // larger row labels
  mctx.font = `bold ${rowFontSize}px ${fontFamily}`;
  let maxLabelWidth = 0;
  const labels = opts.rowLabels ?? [];
  for (const label of labels) {
    const w = mctx.measureText((label ?? "").toString().toUpperCase()).width;
    if (w > maxLabelWidth) maxLabelWidth = w;
  }
  // compute the width of a single space in current font for trailing gap
  const spaceWidth = Math.ceil(
    mctx.measureText(" ").width || rowFontSize * 0.5,
  );

  // avatar + gaps
  const avatarSize = Math.min(Math.floor(cellSize * 0.8), 84);
  const labelGap = 21;
  const computedRowLabelWidth =
    opts.rowLabels && labels.length
      ? avatarSize + labelGap + Math.ceil(maxLabelWidth) + spaceWidth
      : Math.floor(cellSize * 1.8);
  const rowLabelWidth =
    opts.rowLabelWidth ?? Math.max(240, computedRowLabelWidth);

  const gridW = cols * cellSize + Math.max(0, cols - 1) * cellGap;
  const gridH = rows * cellSize + Math.max(0, rows - 1) * cellGap;

  const width = padding * 2 + rowLabelWidth + gridW;
  const height = padding * 2 + headerHeight + gridH;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.clearRect(0, 0, width, height);
  if (bgColor !== "rgba(0,0,0,0)") {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
  }

  // Column headers (support multi-line labels like 'Tue\n2/9')
  const headerFontSize = 30; // larger header
  if ((opts.colHeaders ?? []).length === cols) {
    ctx.fillStyle = "#b4b8bd";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${headerFontSize}px ${fontFamily}`;
    for (let c = 0; c < cols; c++) {
      const raw = (opts.colHeaders![c] ?? "").toString();
      const lines = raw.split(/\n/);
      const cellX = padding + rowLabelWidth + c * (cellSize + cellGap);
      // compute total text block height
      const lineHeight = headerFontSize + 3;
      const totalH = lineHeight * lines.length;
      const startY =
        padding +
        Math.floor((headerHeight - totalH) / 2) +
        Math.floor(lineHeight / 2);
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
    ctx.fillStyle = "#c8ccd1";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${rowFontSize}px ${fontFamily}`;
    for (let r = 0; r < rows; r++) {
      const label = (opts.rowLabels![r] ?? "").toString();
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
          ctx.drawImage(
            img,
            ax - avatarSize / 2,
            ay - avatarSize / 2,
            avatarSize,
            avatarSize,
          );
          ctx.restore();
        } catch {}
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.arc(ax, ay, Math.floor(avatarSize / 2), 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = "#99aab5";
        ctx.fill();
        ctx.restore();
      }

      ctx.fillStyle = "#c8ccd1";
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
      ctx.fillStyle = isGold ? goldColor : matrix[r]?.[c] ? onColor : offColor;
      ctx.fillRect(x, y, cellSize, cellSize);
    }
  }

  const buffer = canvas.toBuffer("image/png");
  return { buffer, width, height };
}
