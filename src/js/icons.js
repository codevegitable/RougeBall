// ═══ 像素图标库 ═══
// emoji 在像素风里是异物：字体渲染带抗锯齿、各平台造型不一。
// 这里用统一的点阵图标替换全部 emoji，居中绘制在给定坐标。
//
// 点阵字符含义：
//   . 透明   K 描边(最暗)   D 暗部   B 主体   L 高光
// 颜色由调用方给定的主色推导，保证与稀有度/状态色一致。

import { ctx } from "./canvas.js";
import { PAL } from "./palette.js";

const G = {
    // ── 战斗类 ──
    sword: [
        "....KL.",
        "...KLB.",
        "..KLB..",
        ".KLB...",
        "KDB....",
        "KK.....",
        ".K.....",
    ],
    shield: [
        ".KKKKK.",
        "KLBBBLK",
        "KLBBBLK",
        "KDBBBDK",
        ".KDBDK.",
        "..KBK..",
        "...K...",
    ],
    ball: [
        "..KKK..",
        ".KLBBK.",
        "KLBBBBK",
        "KBBBBBK",
        "KBBBBBK",
        ".KBBBK.",
        "..KKK..",
    ],
    pierce: [
        "K......",
        ".K..BB.",
        "..K.B..",
        "BBBKBBB",
        "..B.K..",
        ".BB..K.",
        "......K",
    ],
    timer: [
        ".KKKKK.",
        "KLBBBLK",
        ".KBLBK.",
        "..KBK..",
        ".KBLBK.",
        "KLBBBLK",
        ".KKKKK.",
    ],
    // ── 状态类 ──
    ghost: [
        "..KKK..",
        ".KLLLK.",
        "KLBKBLK",
        "KLBBBLK",
        "KLBBBLK",
        "KBKBKBK",
        ".K.K.K.",
    ],
    freeze: [
        "K..K..K",
        ".K.B.K.",
        "..KBK..",
        "KBBLBBK",
        "..KBK..",
        ".K.B.K.",
        "K..K..K",
    ],
    charge: [
        "...KK..",
        "..KLK..",
        ".KLK...",
        "KLLLLK.",
        "...KLK.",
        "..KLK..",
        "..KK...",
    ],
    bomb: [
        "....KL.",
        "...K...",
        ".KKK...",
        "KLBBK..",
        "KBBBBK.",
        "KBBBBK.",
        ".KKKK..",
    ],
    sealed: [
        ".KKKK..",
        "KL..LK.",
        "KK.KKKK",
        "...KL.L",
        "...KKKK",
    ],
    curse: [
        "K.....K",
        ".K.K.K.",
        "..KKK..",
        ".KBLBK.",
        "..KKK..",
        ".K.K.K.",
        "K.....K",
    ],
    // ── 界面类 ──
    book: [
        "KKKKKKK",
        "KLBKBLK",
        "KLBKBLK",
        "KLBKBLK",
        "KLBKBLK",
        "KDBKBDK",
        "KKKKKKK",
    ],
    gear: [
        "..K.K..",
        ".KKKKK.",
        "KLBBBLK",
        "KB.K.BK",
        "KLBBBLK",
        ".KKKKK.",
        "..K.K..",
    ],
    star: [
        "...K...",
        "..KLK..",
        "KKLLLKK",
        ".KLLLK.",
        "..KLK..",
        ".K...K.",
    ],
    skull: [
        ".KKKKK.",
        "KLBBBLK",
        "KDBBBDK",
        "KLBBBLK",
        ".KDKDK.",
        "..KKK..",
    ],
    heart: [
        ".KK.KK.",
        "KLLKLLK",
        "KLBBBLK",
        ".KBBBK.",
        "..KBK..",
        "...K...",
    ],
    palette: [
        ".KKKK..",
        "KLBBLK.",
        "KBDBDBK",
        "KLBBBLK",
        ".KBBBK.",
        "..KKKK.",
    ],
    coin: [
        "..KKK..",
        ".KLLLK.",
        "KLBKBLK",
        "KLKKKLK",
        "KLBKBLK",
        ".KLLLK.",
        "..KKK..",
    ],
    potion: [
        "..KKK..",
        "..KLK..",
        ".KBBBK.",
        "KLBBBLK",
        "KBBLBBK",
        "KLBBBLK",
        ".KKKKK.",
    ],
    fire: [
        "...K...",
        "..KLK..",
        ".KLBLK.",
        "KLBBBLK",
        "KBBLBBK",
        "KLBBBLK",
        ".KKKKK.",
    ],
    lightning: [
        "...KK..",
        "..KLK..",
        ".KLK...",
        ".KLLK..",
        "..KLK..",
        "..KK...",
        ".KK....",
    ],
    lock: [
        ".KKKK..",
        "KL..LK.",
        "KK..KK.",
        "KLBBBLK",
        "KBBKBBK",
        "KLBBBLK",
        ".KKKKK.",
    ],
    plus: [
        "..KKK..",
        "..KLK..",
        "KKKLKKK",
        "KLLLLLK",
        "KKKLKKK",
        "..KLK..",
        "..KKK..",
    ],
    arrowL: [
        "...K...",
        "..KK...",
        ".KKKKKK",
        "KLLLLLL",
        ".KKKKKK",
        "..KK...",
        "...K...",
    ],
    arrowR: [
        "...K...",
        "...KK..",
        "KKKKKK.",
        "LLLLLLK",
        "KKKKKK.",
        "...KK..",
        "...K...",
    ],
    eye: [
        ".KKKKK.",
        "KLBBBLK",
        "KBKKKBK",
        "KBKLKBK",
        "KBKKKBK",
        "KLBBBLK",
        ".KKKKK.",
    ],
    scroll: [
        "KKKKKKK",
        "KLLLLLK",
        "KBKKKBK",
        "KLLLLLK",
        "KBKKKBK",
        "KLLLLLK",
        "KKKKKKK",
    ],
    crown: [
        "K..K..K",
        "KL.KL.K",
        "KLKLKLK",
        "KLLLLLK",
        "KBBBBBK",
        "KKKKKKK",
    ],
    vine: [
        "...KK..",
        "..KLK..",
        ".KLK.KK",
        "KLK.KLK",
        ".KLKLK.",
        "..KLK..",
        "...K...",
    ],
    flower: [
        "..KKK..",
        ".KLBLK.",
        "KBLKLBK",
        ".KLBLK.",
        "..KKK..",
        "...K...",
        "..KKK..",
    ],
    wrench: [
        "....KK.",
        "...KLLK",
        "..KLKK.",
        ".KLK...",
        "KLK....",
        "KKK....",
        ".K.....",
    ],
    candle: [
        "...K...",
        "..KLK..",
        "...K...",
        ".KBBBK.",
        ".KLBLK.",
        ".KBBBK.",
        ".KKKKK.",
    ],
    hourglass: [
        "KKKKKKK",
        "KLBBBLK",
        ".KBLBK.",
        "..KLK..",
        ".KBLBK.",
        "KLBBBLK",
        "KKKKKKK",
    ],
    dice: [
        "KKKKKKK",
        "KLKBKBK",
        "KBBBBBK",
        "KBKLKBK",
        "KBBBBBK",
        "KBKBKLK",
        "KKKKKKK",
    ],
};

// 主色 → 四档配色。查表而非算术推导，避免生成调色板外的中间色。
const RAMPS = {
    [PAL.moss1]: [PAL.moss0, PAL.moss1, PAL.moss2], [PAL.moss2]: [PAL.moss1, PAL.moss2, PAL.moss3],
    [PAL.moss3]: [PAL.moss1, PAL.moss3, PAL.bone1],
    [PAL.arc1]: [PAL.arc0, PAL.arc1, PAL.arc2], [PAL.arc2]: [PAL.arc1, PAL.arc2, PAL.arc3],
    [PAL.arc3]: [PAL.arc1, PAL.arc3, PAL.bone1],
    [PAL.vio1]: [PAL.vio0, PAL.vio1, PAL.vio2], [PAL.vio2]: [PAL.vio1, PAL.vio2, PAL.vio3],
    [PAL.vio3]: [PAL.vio1, PAL.vio3, PAL.bone1],
    [PAL.blood1]: [PAL.blood0, PAL.blood1, PAL.blood2], [PAL.blood2]: [PAL.blood1, PAL.blood2, PAL.blood3],
    [PAL.blood3]: [PAL.blood1, PAL.blood3, PAL.bone1],
    [PAL.gold1]: [PAL.gold0, PAL.gold1, PAL.gold2], [PAL.gold2]: [PAL.gold1, PAL.gold2, PAL.gold3],
    [PAL.gold3]: [PAL.gold1, PAL.gold3, PAL.bone1],
    [PAL.ember1]: [PAL.ember0, PAL.ember1, PAL.ember2], [PAL.ember2]: [PAL.ember1, PAL.ember2, PAL.ember3],
    [PAL.ember3]: [PAL.ember1, PAL.ember3, PAL.bone1],
    [PAL.mist0]: [PAL.stone2, PAL.mist0, PAL.mist1], [PAL.mist1]: [PAL.stone3, PAL.mist1, PAL.bone0],
    [PAL.stone1]: [PAL.stone0, PAL.stone1, PAL.stone2], [PAL.stone2]: [PAL.stone1, PAL.stone2, PAL.stone3],
    [PAL.stone3]: [PAL.stone1, PAL.stone3, PAL.mist1],
    [PAL.bone0]: [PAL.mist0, PAL.bone0, PAL.bone1], [PAL.bone1]: [PAL.mist1, PAL.bone1, PAL.white],
    [PAL.teal2]: [PAL.teal1, PAL.teal2, PAL.bone1],
    [PAL.ink0]: [PAL.ink0, PAL.ink1, PAL.ink3],
};

function ramp(color) {
    const r = RAMPS[color] || [PAL.stone1, PAL.stone2, PAL.stone3];
    return { K: PAL.ink0, D: r[0], B: r[1], L: r[2] };
}

// emoji → 图标名的兼容映射：沿用 data/*.js 已有的 icon 字段，无需改数据文件。
// 按语义归类到上面的点阵图标，未覆盖的走 fallback。
const EMOJI_MAP = {
    // 武器 / 伤害
    "🗡️": "sword", "🗡": "sword", "⚔️": "sword", "⚔": "sword", "🔴": "sword",
    "🏹": "pierce", "🎯": "pierce", "📏": "pierce", "🔫": "sword", "🦾": "sword",
    "🌵": "pierce", "💢": "lightning", "🩸": "heart", "🦴": "skull",
    // 防御 / 生命
    "🛡️": "shield", "🛡": "shield", "🟢": "shield", "🛐": "shield", "💺": "shield",
    "❤️": "heart", "❤": "heart", "💖": "heart", "🔆": "star",
    // 火 / 爆炸
    "🔥": "fire", "💥": "bomb", "💣": "bomb", "🧨": "bomb", "🌋": "fire",
    "☄️": "fire", "☄": "fire", "🎆": "star", "🎇": "star", "💫": "star",
    // 电 / 速度
    "⚡": "lightning", "⚡⚡⚡": "lightning", "💨": "lightning", "🌠": "lightning",
    "🛸": "lightning", "💠": "lightning", "🐌": "hourglass", "🐢": "hourglass",
    // 冰 / 时间
    "❄️": "freeze", "❄": "freeze", "🧊": "freeze", "⏳": "hourglass", "⏰": "timer",
    "⏱️": "timer", "⏱": "timer", "🕸️": "hourglass", "🕸": "hourglass",
    // 球 / 分裂
    "🔵": "ball", "🪐": "ball", "🌍": "ball", "🧬": "ball", "🔔": "ball", "🫧": "ball",
    // 财富 / 稀有
    "💰": "coin", "🪙": "coin", "💎": "coin", "🏆": "crown", "👑": "crown",
    "⭐": "star", "🌟": "star", "✨": "star", "★": "star", "🍀": "star", "🎉": "crown",
    // 神秘 / 诅咒
    "👻": "ghost", "👥": "ghost", "🧛": "ghost", "☠️": "skull", "☠": "skull",
    "💀": "skull", "🌑": "curse", "🌀": "curse", "🕳️": "curse", "🕳": "curse",
    "🔮": "potion", "🧙": "curse", "🌫️": "curse", "🌫": "curse", "🕶️": "curse", "🕶": "curse",
    "⚠️": "curse", "⚠": "curse", "🍂": "curse", "🦀": "curse", "🏜️": "curse", "🏜": "curse",
    "🚦": "curse", "💧": "curse", "🔊": "curse",
    // 自然
    "🌿": "vine", "🌸": "flower", "🌼": "flower",
    // 界面
    "📖": "book", "📚": "book", "📜": "scroll", "⚙️": "gear", "⚙": "gear",
    "🎨": "palette", "🎲": "dice", "🧪": "potion", "👁️": "eye", "👁": "eye",
    "🧭": "eye", "🔒": "lock", "🔐": "lock", "🔓": "lock", "⛓️": "sealed", "⛓": "sealed",
    "🛠️": "wrench", "🛠": "wrench", "🕯️": "candle", "🕯": "candle",
    "⛲": "potion", "🏕️": "fire", "🏕": "fire", "🟡": "coin", "✅": "star",
};

// 关键词兜底：诅咒/奖励名里常见的字，用于没登记的 emoji
const KEYWORD_FALLBACK = [
    [/[火焰烧爆殉]/, "fire"],
    [/[冰冻寒霜缓]/, "freeze"],
    [/[电雷速迅疾]/, "lightning"],
    [/[盾护甲固]/, "shield"],
    [/[血心命]/, "heart"],
    [/[剑刃刺穿伤]/, "sword"],
    [/[金财宝富运]/, "coin"],
    [/[时钟刻]/, "hourglass"],
    [/[封印锁]/, "lock"],
    [/[影暗虚咒厄]/, "curse"],
    [/[球弹]/, "ball"],
];

export function resolveIcon(name, label = "") {
    if (!name) return "star";
    if (G[name]) return name;
    if (EMOJI_MAP[name]) return EMOJI_MAP[name];
    // 去掉变体选择符再试一次（❤️ → ❤）
    const bare = String(name).replace(/️/g, "");
    if (EMOJI_MAP[bare]) return EMOJI_MAP[bare];
    if (G[bare]) return bare;
    for (const [re, icon] of KEYWORD_FALLBACK) {
        if (re.test(label)) return icon;
    }
    return "star";
}

// 居中绘制图标。scale 为点阵放大倍数，label 用于关键词兜底。
export function drawIcon(name, cx, cy, scale = 2, color = PAL.bone1, label = "") {
    const key = resolveIcon(name, label);
    const rows = G[key];
    if (!rows) return;
    const map = ramp(color);
    const w = rows[0].length * scale;
    const h = rows.length * scale;
    const x = Math.round(cx - w / 2);
    const y = Math.round(cy - h / 2);
    for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
            const ch = rows[r][c];
            if (ch === "." || ch === " ") continue;
            const col = map[ch];
            if (!col) continue;
            ctx.fillStyle = col;
            ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
        }
    }
}

export const ICON_NAMES = Object.keys(G);
