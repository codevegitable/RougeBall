// ═══ 像素美术调色板 ═══
// 风格参考：《以撒的结合》地下室的阴郁土色 + 《杀戮尖塔》的石板蓝紫与暖金
// 受限调色板（32 色），所有绘制只允许使用这里的颜色，保证画面统一。

export const PAL = {
    // 暗部：背景与面板底
    ink0: "#0a0810",
    ink1: "#120f1a",
    ink2: "#1b1624",
    ink3: "#261f31",

    // 石material：墙体、边框、不可击碎方块
    stone0: "#372e42",
    stone1: "#493d56",
    stone2: "#5d5069",
    stone3: "#75677f",

    // 灰白：次要文字
    mist0: "#8d8199",
    mist1: "#b0a4b8",

    // 骨白：主要文字
    bone0: "#ded3c4",
    bone1: "#f4eee2",

    // 暖金：主强调色、稀有、标题
    gold0: "#6f5119",
    gold1: "#a87c27",
    gold2: "#e0af38",
    gold3: "#f7dc8c",

    // 血红：危险、扣血、诅咒
    blood0: "#4f1a22",
    blood1: "#8c2e38",
    blood2: "#cf4455",
    blood3: "#f07d84",

    // 苔绿：治疗、1HP 方块、成功
    moss0: "#1e4433",
    moss1: "#37704c",
    moss2: "#63a563",
    moss3: "#95d38c",

    // 秘蓝：罕见、护盾、冰冻
    arc0: "#242a63",
    arc1: "#3d4a96",
    arc2: "#6a80d4",
    arc3: "#9fb4f0",

    // 紫罗兰：4HP 方块、魔法、祭坛
    vio0: "#371f4e",
    vio1: "#633a86",
    vio2: "#a464c4",
    vio3: "#cfa0e4",

    // 炭橙：2HP 方块、火焰、射手
    ember0: "#7d3510",
    ember1: "#c2641d",
    ember2: "#ee933b",
    ember3: "#ffc27a",

    // 青：特殊状态
    teal1: "#1f6b6b",
    teal2: "#4bbcbc",

    white: "#ffffff",
    black: "#000000",
};

// 方块血量档位配色（1HP → 4HP），每档三色用于像素高光/主体/阴影
export const BLOCK_TIERS = [
    { light: PAL.moss3, base: PAL.moss2, dark: PAL.moss1, shadow: PAL.moss0 },
    { light: PAL.ember3, base: PAL.ember2, dark: PAL.ember1, shadow: PAL.ember0 },
    { light: PAL.blood3, base: PAL.blood2, dark: PAL.blood1, shadow: PAL.blood0 },
    { light: PAL.vio3, base: PAL.vio2, dark: PAL.vio1, shadow: PAL.vio0 },
];

// 稀有度配色
export const RARITY_PAL = {
    common: { base: PAL.mist0, light: PAL.mist1, dark: PAL.stone2 },
    uncommon: { base: PAL.arc2, light: PAL.arc3, dark: PAL.arc1 },
    rare: { base: PAL.gold2, light: PAL.gold3, dark: PAL.gold1 },
};

// 面板主题：所有 UI 容器共用同一套边框色，保证视觉统一
export const PANEL = {
    fill: PAL.ink2,
    fillAlt: PAL.ink1,
    border: PAL.ink0,
    bevelLight: PAL.stone2,
    bevelDark: PAL.ink1,
    accent: PAL.gold2,
};

// rgba 化：像素风里只用于遮罩与淡出，避免任意插值色
export function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
