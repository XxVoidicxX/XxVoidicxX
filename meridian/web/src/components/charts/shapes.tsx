type Corner = { tl: number; tr: number; br: number; bl: number };

export function roundedRectPath(x: number, y: number, w: number, h: number, c: Corner): string {
  if (w <= 0 || h <= 0) return "";
  const m = Math.min(w / 2, h / 2);
  const tl = Math.min(c.tl, m), tr = Math.min(c.tr, m), br = Math.min(c.br, m), bl = Math.min(c.bl, m);
  return [
    `M${x + tl},${y}`,
    `H${x + w - tr}`,
    tr ? `A${tr},${tr} 0 0 1 ${x + w},${y + tr}` : "",
    `V${y + h - br}`,
    br ? `A${br},${br} 0 0 1 ${x + w - br},${y + h}` : "",
    `H${x + bl}`,
    bl ? `A${bl},${bl} 0 0 1 ${x},${y + h - bl}` : "",
    `V${y + tl}`,
    tl ? `A${tl},${tl} 0 0 1 ${x + tl},${y}` : "",
    "Z",
  ].join(" ");
}

interface ShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: Record<string, unknown>;
  fillOpacity?: number;
}

export function stackedShape(dataKey: string, topKeyField: string, layout: "vertical" | "horizontal", radius = 4, gap = 2) {
  return function StackShape(props: unknown) {
    const { x = 0, y = 0, width = 0, height = 0, fill, payload } = props as ShapeProps;
    if (!width || !height) return <g />;
    const isTop = payload?.[topKeyField] === dataKey;
    const r = isTop ? radius : 0;
    if (layout === "vertical") {
      const w = isTop ? width : Math.max(0, width - gap);
      return <path d={roundedRectPath(x, y, w, height, { tl: 0, tr: r, br: r, bl: 0 })} fill={fill} />;
    }
    const top = isTop ? y : y + gap;
    const h = isTop ? height : Math.max(0, height - gap);
    return <path d={roundedRectPath(x, top, width, h, { tl: r, tr: r, br: 0, bl: 0 })} fill={fill} />;
  };
}

export function withTopKey<T extends Record<string, unknown>>(rows: T[], keys: readonly string[], field = "__top"): (T & Record<string, unknown>)[] {
  return rows.map((r) => {
    let top: string | null = null;
    for (const k of keys) if (Number(r[k] ?? 0) > 0) top = k;
    return { ...r, [field]: top };
  });
}
