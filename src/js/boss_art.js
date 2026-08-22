// ═══ Boss 像素美术 ═══
// 四种 bossType 各有独立造型，全部用点阵绘制，风格参考《以撒》的怪物：
// 轮廓厚重、对称、单一强调色 + 高对比高光，配合呼吸/眨眼的逐帧动画。
//
// 点阵字符：. 透明  K 轮廓  D 暗部  B 主体  L 高光  E 眼白  P 瞳孔  A 强调
// 造型基于 boss.r=56 设计，绘制时按 r 自动缩放。

import { ctx } from "./canvas.js";
import { PAL } from "./palette.js";

// ── 铁壁执行者 / 回旋机兵：装甲机械看守 ──
const EXECUTOR = [
    "....KKKKKKKKK....",
    "..KKDDDDDDDDDKK..",
    ".KDDBBBBBBBBBDDK.",
    "KDBBBLLLLLLLBBBDK",
    "KDBBLKKKKKKKLBBDK",
    "KDBLKEEEPEEEKLBDK",
    "KDBLKEEEPEEEKLBDK",
    "KDBBLKKKKKKKLBBDK",
    "KDBBBLLLLLLLBBBDK",
    "KDDBBBAAAAABBBDDK",
    ".KDDBBBAAABBBDDK.",
    "..KKDDBBBBBDDKK..",
    "....KKDDDDDKK....",
    "......KKKKK......",
];

// ── 腐化母体 / 剧毒核心：臃肿肉块，多眼 ──
const MOTHER = [
    "...KKKKKKKKKKK...",
    ".KKDDDDDDDDDDDKK.",
    "KDDBBBBBBBBBBBDDK",
    "KDBBLLBBBBBLLBBDK",
    "KDBLKEKBBBKEKLBDK",
    "KDBBKPKBLBKPKBBDK",
    "KDBBLKKBLBKKLBBDK",
    "KDBBBBBKEKBBBBBDK",
    "KDBBAABKPKBAABBDK",
    "KDDBAAAKKKAAABDDK",
    ".KDDBAAAAAAABDDK.",
    "..KKDDBAAABDDKK..",
    "....KKDDDDDKK....",
    "......KKKKK......",
];

// ── 机械蜂巢 / 蜂群母舰：六边巢室集群 ──
const HIVE = [
    "....KKKKKKKKK....",
    "..KKDDDDDDDDDKK..",
    ".KDDBAABBBAABDDK.",
    "KDBBAKKABAKKABBDK",
    "KDBAKLLKAKLLKABDK",
    "KDBAKLEKAKELKABDK",
    "KDBBAKKABAKKABBDK",
    "KDBBBAABBBAABBBDK",
    "KDBAKKABBBAKKABDK",
    "KDBAKLEKAKELKABDK",
    ".KDBAKKABAKKABDK.",
    "..KKDBAABBBADKK..",
    "....KKDDDDDKK....",
    "......KKKKK......",
];

// ── 诅咒司祭 / 虚空司祭：兜帽祭司，中央独眼 ──
const PRIEST = [
    "......KKKKK......",
    "....KKDDDDDKK....",
    "..KKDDBBBBBDDKK..",
    ".KDDBBBLLLBBBDDK.",
    "KDDBBBLKKKLBBBDDK",
    "KDBBBLKEEEKLBBBDK",
    "KDBBBLKEPEKLBBBDK",
    "KDBBBLKEEEKLBBBDK",
    "KDBBBBLKKKLBBBBDK",
    "KDBBAABBBBBAABBDK",
    "KDBAAABBBBBAAABDK",
    ".KDAAAABBBAAAADK.",
    "..KKAAAAAAAAAKK..",
    "....KKKKKKKKK....",
];

const SPRITES = { executor: EXECUTOR, mother: MOTHER, hive: HIVE, priest: PRIEST };

// 每个色系的四档明暗都直接取自调色板，而不是算术推导——
// 推导出的中间色会落在调色板之外，让画面出现"脏色"。
const RAMPS = {
    [PAL.moss2]: { D: PAL.moss0, B: PAL.moss2, L: PAL.moss3, A: PAL.moss1 },
    [PAL.arc2]: { D: PAL.arc0, B: PAL.arc2, L: PAL.arc3, A: PAL.arc1 },
    [PAL.vio2]: { D: PAL.vio0, B: PAL.vio2, L: PAL.vio3, A: PAL.vio1 },
    [PAL.vio3]: { D: PAL.vio1, B: PAL.vio3, L: PAL.bone1, A: PAL.vio2 },
    [PAL.blood2]: { D: PAL.blood0, B: PAL.blood2, L: PAL.blood3, A: PAL.blood1 },
    [PAL.blood3]: { D: PAL.blood1, B: PAL.blood3, L: PAL.bone1, A: PAL.blood2 },
    [PAL.gold2]: { D: PAL.gold0, B: PAL.gold2, L: PAL.gold3, A: PAL.gold1 },
    [PAL.ember2]: { D: PAL.ember0, B: PAL.ember2, L: PAL.ember3, A: PAL.ember1 },
};

const FALLBACK_RAMP = { D: PAL.stone0, B: PAL.stone2, L: PAL.stone3, A: PAL.stone1 };

function bossRamp(color, phase2) {
    const r = RAMPS[color] || FALLBACK_RAMP;
    return {
        K: PAL.ink0,
        D: r.D,
        B: r.B,
        L: r.L,
        // 二阶段强调色转为血红，直观传达"狂暴"
        A: phase2 ? PAL.blood2 : r.A,
        E: PAL.bone1,
        P: phase2 ? PAL.blood2 : PAL.ink0,
    };
}

// 绘制 Boss 本体。cx/cy 为中心，r 为半径，t 为帧计数。
export function drawBossSprite(bossType, color, r, t, opts = {}) {
    const { phase2 = false, flash = 0, vulnerable = false } = opts;
    const rows = SPRITES[bossType] || EXECUTOR;
    const cols = rows[0].length;
    // 每个点阵格的边长：直径 / 格数，吸附为偶数像素保持锐利
    const cell = Math.max(2, Math.round((r * 2) / cols / 2) * 2);
    const w = cols * cell;
    const h = rows.length * cell;
    const ox = -Math.round(w / 2);
    const oy = -Math.round(h / 2);

    // 呼吸：每 40 帧纵向压缩 1 格，营造活物感
    const breathe = Math.floor(t / 30) % 2 === 0 ? 0 : cell;
    // 眨眼：每 180 帧闭眼 12 帧
    const blink = t % 180 < 12;

    const map = bossRamp(color, phase2);

    for (let ry = 0; ry < rows.length; ry++) {
        const row = rows[ry];
        for (let rx = 0; rx < row.length; rx++) {
            let ch = row[rx];
            if (ch === "." || ch === " ") continue;
            // 眨眼时眼白与瞳孔替换为暗部
            if (blink && (ch === "E" || ch === "P")) ch = "D";
            let col = map[ch];
            if (!col) continue;
            // 易伤：主体染上金色脉动
            if (vulnerable && (ch === "B" || ch === "L") && Math.floor(t / 6) % 2 === 0) {
                col = ch === "L" ? PAL.gold3 : PAL.gold2;
            }
            ctx.fillStyle = col;
            const yy = oy + ry * cell + (ry > rows.length / 2 ? breathe : 0);
            ctx.fillRect(ox + rx * cell, yy, cell, cell);
        }
    }

    // 受击闪白：整体覆盖一层白，保留轮廓
    if (flash > 0.02) {
        ctx.globalAlpha = Math.min(1, flash * 0.8);
        for (let ry = 0; ry < rows.length; ry++) {
            for (let rx = 0; rx < rows[ry].length; rx++) {
                const ch = rows[ry][rx];
                if (ch === "." || ch === " " || ch === "K") continue;
                ctx.fillStyle = PAL.bone1;
                ctx.fillRect(ox + rx * cell, oy + ry * cell, cell, cell);
            }
        }
        ctx.globalAlpha = 1;
    }

    return { w, h, cell };
}

// Boss 皇冠：标记最终 Boss（第 50 关）
export function drawBossCrown(r, cell) {
    const c = cell || 4;
    const rows = [
        "A.A.A",
        "AAAAA",
        "ALLLA",
        "AAAAA",
    ];
    const w = rows[0].length * c * 2;
    const ox = -Math.round(w / 2);
    const oy = -Math.round(r) - rows.length * c * 2 - c * 2;
    const map = { A: PAL.gold2, L: PAL.gold3 };
    for (let y = 0; y < rows.length; y++) {
        for (let x = 0; x < rows[y].length; x++) {
            const ch = rows[y][x];
            if (ch === "." ) continue;
            ctx.fillStyle = map[ch];
            ctx.fillRect(ox + x * c * 2, oy + y * c * 2, c * 2, c * 2);
        }
    }
}
