import {
    BLOCK_W,
    BLOCK_H,
    BLOCK_GAP,
    GRID_COLS,
    GRID_X,
    GRID_Y,
} from "./constants.js";
import { mulberry32 } from "./utils.js";

// Manual level designs - 10 levels, carefully crafted to be completable
// Design rules: always leave paths for the ball to reach all blocks
const MANUAL_LEVELS = [
    // ── Level 1: "入门" ── 4 rows, all 1HP, wide gaps, easy intro
    [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],

    // ── Level 2: "棋盘" ── checkerboard, 5 rows, teaches angle play
    [
        [1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
        [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
        [1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
        [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
        [1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    ],

    // ── Level 3: "走廊" ── open middle corridor, blocks on sides
    [
        [1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
        [1, 1, 0, 0, 0, 0, 0, 0, 1, 1],
        [1, 0, 0, 0, 1, 1, 0, 0, 0, 1],
        [1, 1, 0, 0, 0, 0, 0, 0, 1, 1],
        [1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
    ],

    // ── Level 4: "坚固" ── introduces 2HP blocks, 5 rows
    [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
        [1, 0, 2, 0, 0, 0, 0, 2, 0, 1],
        [1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],

    // ── Level 5: "双塔" ── two towers with central gap, 5 rows
    [
        [1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
        [1, 2, 1, 0, 0, 0, 0, 1, 2, 1],
        [1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
        [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],

    // ── Level 6: "金字塔" ── pyramid shape, 6 rows
    [
        [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
        [0, 0, 0, 1, 2, 2, 1, 0, 0, 0],
        [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
        [1, 1, 0, 0, 0, 0, 0, 0, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],

    // ── Level 7: "迷宫" ── maze-like pattern, 6 rows
    [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1, 1, 0, 0, 0, 1],
        [1, 0, 1, 0, 0, 0, 0, 1, 0, 1],
        [1, 0, 0, 0, 1, 1, 0, 0, 0, 1],
        [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],

    // ── Level 8: "堡垒" ── fortress with 3HP core, 6 rows
    [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 1, 0, 0, 0, 0, 1, 0, 1],
        [1, 0, 1, 2, 1, 1, 2, 1, 0, 1],
        [1, 0, 1, 1, 3, 3, 1, 1, 0, 1],
        [1, 0, 1, 2, 1, 1, 2, 1, 0, 1],
        [1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
    ],

    // ── Level 9: "箭头" ── arrow/V pattern, 7 rows
    [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 1, 0, 0, 0, 0, 0, 0, 1, 1],
        [1, 2, 1, 0, 0, 0, 0, 1, 2, 1],
        [1, 1, 1, 1, 0, 0, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 1, 0, 0, 0, 0, 1, 0, 1],
    ],

    // ── Level 10: "最终试炼" ── challenging finale, 7 rows
    [
        [1, 2, 1, 2, 0, 0, 2, 1, 2, 1],
        [2, 1, 2, 1, 2, 2, 1, 2, 1, 2],
        [1, 2, 0, 0, 3, 3, 0, 0, 2, 1],
        [0, 0, 1, 2, 3, 3, 2, 1, 0, 0],
        [1, 2, 0, 0, 2, 2, 0, 0, 2, 1],
        [2, 1, 2, 1, 0, 0, 1, 2, 1, 2],
        [1, 2, 1, 2, 1, 1, 2, 1, 2, 1],
    ],
];

// 程序化生成：11 关以后（Boss 关除外）
export function generateLevel(num) {
    if (num <= MANUAL_LEVELS.length) {
        return MANUAL_LEVELS[num - 1];
    }
    const rows = Math.min(5 + Math.floor(num * 0.35), 12);
    const grid = [];
    const rng = mulberry32(num * 1337);

    // 血量档位随关数提升
    const tier = Math.min(3, Math.floor((num - 11) / 5));
    const hpTable = [
        [1, 1, 1, 1, 2],
        [1, 1, 2, 2, 3],
        [1, 2, 2, 3, 3],
        [2, 2, 3, 3, 4],
    ];
    const table = hpTable[tier];

    for (let r = 0; r < rows; r++) {
        const row = [];
        // Ensure at least 2 gaps per row so ball can always pass through
        const gapCols = new Set();
        gapCols.add(Math.floor(rng() * GRID_COLS));
        gapCols.add(Math.floor(rng() * GRID_COLS));
        for (let c = 0; c < GRID_COLS; c++) {
            if (gapCols.has(c)) {
                row.push(0);
                continue;
            }
            // 密度随关数缓增（前期更稀疏，方便无能力时清场）
            const density = Math.min(0.42 + (num - 10) * 0.006, 0.52);
            if (rng() > density) {
                row.push(0);
                continue;
            }
            row.push(table[Math.floor(rng() * table.length)]);
        }
        grid.push(row);
    }
    return grid;
}

// 生成方块对象，附带关卡机制（不可击碎 / 移动 / 攻击）
export function createBlocksFromGrid(grid, num = 1) {
    const rng = mulberry32(num * 715);
    const bl = [];

    // 机制出现概率随关数变化
    const unbreakableChance = num > 10 ? Math.min(0.04 + (num - 10) * 0.004, 0.12) : 0;
    const movingChance = num >= 12 ? Math.min(0.05 + (num - 12) * 0.004, 0.18) : 0;
    const shooterChance = num >= 18 ? Math.min(0.04 + (num - 18) * 0.003, 0.1) : 0;

    for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < grid[row].length; col++) {
            const type = grid[row][col];
            if (type === 0) continue;
            const x = GRID_X + col * (BLOCK_W + BLOCK_GAP);
            const y = GRID_Y + row * (BLOCK_H + BLOCK_GAP);

            const indestructible = rng() < unbreakableChance;
            const moving = !indestructible && rng() < movingChance
                ? { phase: rng() * Math.PI * 2, speed: 0.010 + rng() * 0.012, amp: 26 + rng() * 40 }
                : null;
            const shooter = !indestructible && !moving && rng() < shooterChance
                ? { interval: 220 + rng() * 140, tick: 60 + rng() * 180 }
                : null;

            bl.push({
                x,
                y,
                baseX: x,
                baseY: y,
                w: BLOCK_W,
                h: BLOCK_H,
                hp: indestructible ? Infinity : type,
                maxHp: type,
                indestructible,
                moving,
                shooter,
            });
        }
    }
    return bl;
}