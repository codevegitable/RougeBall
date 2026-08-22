// ═══ 像素绘制基元 ═══
// 核心约定：所有坐标对齐到 PX 像素网格，禁用抗锯齿平滑，不使用圆角与阴影模糊。
// 这样 800×600 的画布看起来像 200×150 的像素画放大 4 倍。

import { ctx } from "./canvas.js";
import { PAL, PANEL, rgba } from "./palette.js";

// 逻辑像素尺寸：1 个"美术像素" = PX 个画布像素
export const PX = 4;

// 对齐到像素网格
export const snap = (v) => Math.round(v / PX) * PX;
export const snapUp = (v) => Math.ceil(v / PX) * PX;

// 关闭图像平滑，让缩放后的画布保持硬边
export function initPixelMode() {
    ctx.imageSmoothingEnabled = false;
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
}

// ── 基础矩形（对齐网格）────────────────────────────────
export function pRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(snap(x), snap(y), snapUp(w), snapUp(h));
}

// 不对齐的矩形，用于跟随物理位置的高速物体
export function pRectRaw(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// 像素描边（内描边，厚度以美术像素计）
export function pStroke(x, y, w, h, color, t = 1) {
    const b = t * PX;
    const X = snap(x), Y = snap(y), Wd = snapUp(w), Ht = snapUp(h);
    ctx.fillStyle = color;
    ctx.fillRect(X, Y, Wd, b);
    ctx.fillRect(X, Y + Ht - b, Wd, b);
    ctx.fillRect(X, Y + b, b, Ht - b * 2);
    ctx.fillRect(X + Wd - b, Y + b, b, Ht - b * 2);
}

// ── 切角矩形：像素风替代圆角 ──────────────────────────
// 四角各削掉 c 个美术像素，形成 45° 斜切，比圆角更符合像素审美
export function pChamferFill(x, y, w, h, color, c = 2) {
    const X = snap(x), Y = snap(y), Wd = snapUp(w), Ht = snapUp(h);
    ctx.fillStyle = color;
    const cut = c * PX;
    ctx.fillRect(X + cut, Y, Wd - cut * 2, Ht);
    ctx.fillRect(X, Y + cut, cut, Ht - cut * 2);
    ctx.fillRect(X + Wd - cut, Y + cut, cut, Ht - cut * 2);
    // 阶梯状斜角
    for (let i = 0; i < c; i++) {
        const off = i * PX;
        const len = (c - i) * PX;
        ctx.fillRect(X + off, Y + cut - off - PX, PX, PX);
        ctx.fillRect(X + Wd - off - PX, Y + cut - off - PX, PX, PX);
        ctx.fillRect(X + off, Y + Ht - cut + off, PX, PX);
        ctx.fillRect(X + Wd - off - PX, Y + Ht - cut + off, PX, PX);
        void len;
    }
}

// 切角描边
export function pChamferStroke(x, y, w, h, color, c = 2, t = 1) {
    const X = snap(x), Y = snap(y), Wd = snapUp(w), Ht = snapUp(h);
    const cut = c * PX;
    const b = t * PX;
    ctx.fillStyle = color;
    ctx.fillRect(X + cut, Y, Wd - cut * 2, b);
    ctx.fillRect(X + cut, Y + Ht - b, Wd - cut * 2, b);
    ctx.fillRect(X, Y + cut, b, Ht - cut * 2);
    ctx.fillRect(X + Wd - b, Y + cut, b, Ht - cut * 2);
    for (let i = 0; i < c; i++) {
        const o = i * PX;
        ctx.fillRect(X + o, Y + cut - o - PX, PX, PX);
        ctx.fillRect(X + Wd - o - PX, Y + cut - o - PX, PX, PX);
        ctx.fillRect(X + o, Y + Ht - cut + o, PX, PX);
        ctx.fillRect(X + Wd - o - PX, Y + Ht - cut + o, PX, PX);
    }
}

// ── 浮雕面板：UI 容器的统一外观 ────────────────────────
// 结构（由外到内）：硬黑描边 → 亮面高光（上左）→ 暗面阴影（下右）→ 填充
export function pPanel(x, y, w, h, opts = {}) {
    const {
        fill = PANEL.fill,
        border = PANEL.border,
        light = PANEL.bevelLight,
        dark = PANEL.bevelDark,
        chamfer = 2,
        inset = false,
    } = opts;
    const X = snap(x), Y = snap(y), Wd = snapUp(w), Ht = snapUp(h);

    pChamferFill(X, Y, Wd, Ht, border, chamfer);
    pChamferFill(X + PX, Y + PX, Wd - PX * 2, Ht - PX * 2, inset ? dark : light, chamfer - 1);
    // 斜面：亮在上左，暗在下右（inset 时反转，用于凹陷槽位）
    pChamferFill(X + PX * 2, Y + PX * 2, Wd - PX * 3, Ht - PX * 3, inset ? light : dark, chamfer - 1);
    pRect(X + PX * 2, Y + PX * 2, Wd - PX * 4, Ht - PX * 4, fill);
}

// 内嵌凹槽（技能槽、进度条底）
export function pSlot(x, y, w, h, fill = PAL.ink0) {
    pPanel(x, y, w, h, { fill, inset: true, chamfer: 2, light: PAL.stone1, dark: PAL.ink0 });
}

// ── 抖动/网点渐变：像素风的渐变替代方案 ────────────────
// 用 4×4 有序抖动矩阵在两色之间过渡，避免平滑渐变破坏像素感
const BAYER4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
];

// 垂直方向双色抖动填充
export function pDitherV(x, y, w, h, top, bottom) {
    const X = snap(x), Y = snap(y), Wd = snapUp(w), Ht = snapUp(h);
    const rows = Ht / PX;
    const cols = Wd / PX;
    for (let r = 0; r < rows; r++) {
        const t = rows <= 1 ? 0 : r / (rows - 1);
        for (let c = 0; c < cols; c++) {
            const th = (BAYER4[r & 3][c & 3] + 0.5) / 16;
            ctx.fillStyle = t > th ? bottom : top;
            ctx.fillRect(X + c * PX, Y + r * PX, PX, PX);
        }
    }
}

// 单色抖动遮罩：用于半透明感而不用 alpha
export function pDitherMask(x, y, w, h, color, density = 0.5) {
    const X = snap(x), Y = snap(y), Wd = snapUp(w), Ht = snapUp(h);
    ctx.fillStyle = color;
    for (let r = 0; r < Ht / PX; r++) {
        for (let c = 0; c < Wd / PX; c++) {
            if ((BAYER4[r & 3][c & 3] + 0.5) / 16 < density) {
                ctx.fillRect(X + c * PX, Y + r * PX, PX, PX);
            }
        }
    }
}

// ── 像素圆 / 环：用整数半径的填充算法，得到硬边圆 ───────
export function pCircle(cx, cy, r, color) {
    const C = PX;
    const gx = Math.round(cx / C), gy = Math.round(cy / C);
    const gr = Math.max(1, Math.round(r / C));
    ctx.fillStyle = color;
    for (let dy = -gr; dy <= gr; dy++) {
        const span = Math.floor(Math.sqrt(gr * gr - dy * dy + 0.25));
        if (span < 0) continue;
        ctx.fillRect((gx - span) * C, (gy + dy) * C, (span * 2 + 1) * C, C);
    }
}

export function pRing(cx, cy, r, color, t = 1) {
    const C = PX;
    const gx = Math.round(cx / C), gy = Math.round(cy / C);
    const gr = Math.max(1, Math.round(r / C));
    const gi = Math.max(0, gr - t);
    ctx.fillStyle = color;
    for (let dy = -gr; dy <= gr; dy++) {
        const outer = Math.floor(Math.sqrt(Math.max(0, gr * gr - dy * dy + 0.25)));
        const inner = Math.abs(dy) <= gi ? Math.floor(Math.sqrt(Math.max(0, gi * gi - dy * dy + 0.25))) : -1;
        if (inner < 0) {
            ctx.fillRect((gx - outer) * C, (gy + dy) * C, (outer * 2 + 1) * C, C);
        } else {
            const wLeft = outer - inner;
            ctx.fillRect((gx - outer) * C, (gy + dy) * C, wLeft * C, C);
            ctx.fillRect((gx + inner + 1) * C, (gy + dy) * C, wLeft * C, C);
        }
    }
}

// ── 文字 ──────────────────────────────────────────────
// 中文无法用位图字体覆盖，因此采用等宽像素字体栈 + 整数坐标 + 硬描边，
// 让中英文都保持锐利的像素观感。
export const FONT_STACK = `'Silkscreen','Press Start 2P','Zpix','Fusion Pixel','Unifont',
 'PingFang SC','Microsoft YaHei',monospace`;

export function pFont(size, bold = true) {
    // 字号取 PX 的整数倍，避免亚像素渲染导致的模糊
    const s = Math.max(PX * 2, Math.round(size / 2) * 2);
    ctx.font = `${bold ? "bold " : ""}${s}px ${FONT_STACK}`;
}

// 带硬像素描边的文字（像素风标准做法：1px 纯黑轮廓提升可读性）
export function pText(text, x, y, color, opts = {}) {
    const { size = 16, bold = true, align = "left", outline = PAL.ink0, ow = PX / 2 } = opts;
    pFont(size, bold);
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    const X = Math.round(x), Y = Math.round(y);
    if (outline) {
        ctx.fillStyle = outline;
        for (let dx = -ow; dx <= ow; dx += ow) {
            for (let dy = -ow; dy <= ow; dy += ow) {
                if (dx === 0 && dy === 0) continue;
                ctx.fillText(text, X + dx, Y + dy);
            }
        }
    }
    ctx.fillStyle = color;
    ctx.fillText(text, X, Y);
}

// 阴影文字：只在右下投一格黑影，比全描边更轻，用于正文
export function pTextShadow(text, x, y, color, opts = {}) {
    const { size = 14, bold = false, align = "left", shadow = PAL.ink0 } = opts;
    pFont(size, bold);
    ctx.textAlign = align;
    const X = Math.round(x), Y = Math.round(y);
    ctx.fillStyle = shadow;
    ctx.fillText(text, X + PX / 2, Y + PX / 2);
    ctx.fillStyle = color;
    ctx.fillText(text, X, Y);
}

// 自动换行（按字符宽度，兼容中文）
export function pWrap(text, cx, y, maxW, lineH, color, opts = {}) {
    const { size = 13, bold = false, align = "center", shadow = PAL.ink0 } = opts;
    pFont(size, bold);
    ctx.textAlign = align;
    let line = "";
    let ly = y;
    const flush = () => {
        ctx.fillStyle = shadow;
        ctx.fillText(line, Math.round(cx) + PX / 2, Math.round(ly) + PX / 2);
        ctx.fillStyle = color;
        ctx.fillText(line, Math.round(cx), Math.round(ly));
    };
    for (const ch of String(text)) {
        if (ch === "\n") { flush(); line = ""; ly += lineH; continue; }
        const test = line + ch;
        if (ctx.measureText(test).width > maxW && line.length > 0) {
            flush();
            line = ch;
            ly += lineH;
        } else {
            line = test;
        }
    }
    if (line) flush();
    return ly;
}

// 测量换行后占用的行数，供布局预留空间
export function pWrapLines(text, maxW, size = 13, bold = false) {
    pFont(size, bold);
    let line = "";
    let n = 1;
    for (const ch of String(text)) {
        if (ch === "\n") { n++; line = ""; continue; }
        const test = line + ch;
        if (ctx.measureText(test).width > maxW && line.length > 0) { n++; line = ch; }
        else line = test;
    }
    return n;
}

// ── 遮罩：界面弹出时压暗背景 ──────────────────────────────
// 用有序抖动的实色网点，而不是半透明填充：alpha 混合会在遮罩色与
// 背景色之间插值出大量调色板外的新颜色（实测可占画面 70%），
// 那会让像素画的色彩纪律彻底失效。
// density 越高，被涂成实色的格子越多，观感越暗。
export function pScrim(density = 0.72, tint = PAL.ink0) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    if (density >= 0.995) {
        ctx.fillStyle = tint;
        ctx.fillRect(0, 0, w, h);
        return;
    }
    pDitherMask(0, 0, w, h, tint, density);
}

// ── 伪辉光：像素风不用 shadowBlur，改用同心低密度抖动环 ──
export function pGlow(cx, cy, r, color, steps = 2) {
    for (let i = steps; i >= 1; i--) {
        const rr = r + i * PX;
        ctx.fillStyle = rgba(color, 0.16 * (1 - (i - 1) / (steps + 1)));
        pCircleRaw(cx, cy, rr, ctx.fillStyle);
    }
}

function pCircleRaw(cx, cy, r, color) {
    const C = PX;
    const gx = Math.round(cx / C), gy = Math.round(cy / C);
    const gr = Math.max(1, Math.round(r / C));
    ctx.fillStyle = color;
    for (let dy = -gr; dy <= gr; dy++) {
        const span = Math.floor(Math.sqrt(Math.max(0, gr * gr - dy * dy + 0.25)));
        ctx.fillRect((gx - span) * C, (gy + dy) * C, (span * 2 + 1) * C, C);
    }
}

// ── 位图图标：用 0/1 点阵绘制，彻底摆脱 emoji ──────────
// 每个图标是字符串数组，"." 透明，其余字符查 colorMap
export function pSprite(rows, x, y, colorMap, scale = PX) {
    const X = Math.round(x), Y = Math.round(y);
    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        for (let c = 0; c < row.length; c++) {
            const ch = row[c];
            if (ch === "." || ch === " ") continue;
            const col = colorMap[ch];
            if (!col) continue;
            ctx.fillStyle = col;
            ctx.fillRect(X + c * scale, Y + r * scale, scale, scale);
        }
    }
}

// 心形（生命值）：7×6 点阵
export const SPR_HEART = [
    ".XX.XX.",
    "XLLXLLX",
    "XLLLLLX",
    ".XLLLX.",
    "..XLX..",
    "...X...",
];

// 半心
export const SPR_HALF_HEART = [
    ".XX.XX.",
    "XLLX..X",
    "XLLL..X",
    ".XLL..X",
    "..XL.X.",
    "...X...",
];

// 骷髅（Boss / 游戏结束）
export const SPR_SKULL = [
    ".XXXXX.",
    "XLLLLLX",
    "XDLLLDX",
    "XLLLLLX",
    ".XLXLX.",
    "..XXX..",
];

// 星（稀有 / 解锁）
export const SPR_STAR = [
    "...X...",
    "..XLX..",
    "XXLLLXX",
    ".XLLLX.",
    "..XLX..",
    ".X...X.",
];

// 书（图鉴）
export const SPR_BOOK = [
    "XXXXXXX",
    "XLLXLLX",
    "XLLXLLX",
    "XLLXLLX",
    "XLLXLLX",
    "XXXXXXX",
];

// 齿轮（设置）
export const SPR_GEAR = [
    "..X.X..",
    ".XXXXX.",
    "XXLLLXX",
    "XLL.LLX",
    "XXLLLXX",
    ".XXXXX.",
    "..X.X..",
];

// 锁链（封印槽位）
export const SPR_CHAIN = [
    ".XXX...",
    "XL.LX..",
    ".XXXXX.",
    "..XL.LX",
    "..XXXX.",
];

export function heartMap(base, light, dark) {
    return { X: dark, L: light, D: base };
}

// 水平进度条（血条/冷却/经验）
export function pBar(x, y, w, h, ratio, fillColor, opts = {}) {
    const { bg = PAL.ink0, light = null, border = PAL.ink0 } = opts;
    const X = snap(x), Y = snap(y), Wd = snapUp(w), Ht = snapUp(h);
    pRect(X, Y, Wd, Ht, border);
    pRect(X + PX, Y + PX, Wd - PX * 2, Ht - PX * 2, bg);
    const inner = Wd - PX * 2;
    const fw = Math.max(0, Math.min(inner, Math.round((inner * Math.max(0, Math.min(1, ratio))) / PX) * PX));
    if (fw > 0) {
        pRect(X + PX, Y + PX, fw, Ht - PX * 2, fillColor);
        if (light) pRect(X + PX, Y + PX, fw, PX, light);
    }
}
