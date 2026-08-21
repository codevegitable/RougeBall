import { W, H, GRID_Y, BLOCK_GAP } from "./constants.js";
import { mulberry32 } from "./utils.js";
import { state } from "./state.js";

// 方块尺寸随关卡递减（整体更大，降幅更缓）
function blockSizeFor(level) {
    if (level <= 3) return { w: 110, h: 34 };
    if (level <= 6) return { w: 96, h: 30 };
    if (level <= 10) return { w: 84, h: 27 };
    if (level <= 15) return { w: 74, h: 24 };
    if (level <= 25) return { w: 68, h: 22 };
    if (level <= 40) return { w: 60, h: 19 };
    return { w: 54, h: 18 };
}

// 程序化关卡生成
export function generateLevel(num) {
    const { w: bw, h: bh } = blockSizeFor(num);
    const gap = BLOCK_GAP;
    const margin = 30;
    const cols = Math.floor((W - 2 * margin) / (bw + gap));
    const maxRows = Math.floor((H - GRID_Y - 150) / (bh + gap));
    const rng = mulberry32(num * 1337 + 991);

    // 目标方块数：第 1 关 10 个，后续递增
    let target;
    if (num === 1) {
        target = 10;
    } else {
        target = Math.round((10 + (num - 1) * 1.3) * (0.85 + rng() * 0.3));
    }
    target = Math.min(target, Math.floor(cols * maxRows * 0.75));

    // 血量档位（前 15 关固定 1HP，后续逐步提升）
    const tier = num <= 15 ? 0 : Math.min(3, Math.floor((num - 16) / 5));

    // 前 3 关全部 1HP，不用概率表
    const force1HP = num <= 3;
    const hpTable = [
        [1, 1, 1, 1, 2],
        [1, 1, 2, 2, 3],
        [1, 2, 2, 3, 3],
        [2, 2, 3, 3, 4],
    ];
    const table = hpTable[tier];

    // 逐行填充分块，每行至少 2 个空隙
    const grid = [];
    let placed = 0;
    for (let r = 0; r < maxRows && placed < target; r++) {
        const row = [];
        const gapCount = Math.min(2 + Math.floor(num / 8), Math.max(2, cols - 3));
        const gapCols = new Set();
        while (gapCols.size < gapCount) {
            gapCols.add(Math.floor(rng() * cols));
        }
        // 第 1 关：只放 2 行，每行 5 个
        const fillP = num === 1 ? 0.6 : Math.min(0.42 + (num - 1) * 0.006, 0.55) + (state.player.curseDensityBonus || 0);
        for (let c = 0; c < cols; c++) {
            if (gapCols.has(c)) { row.push(0); continue; }
            if (rng() > (num === 1 ? 0.65 : fillP)) { row.push(0); continue; }
            row.push(force1HP ? 1 : table[Math.floor(rng() * table.length)]);
            placed++;
            if (placed >= target) { /* 剩余填充 0 */ for (; c < cols - 1; c++) row.push(0); break; }
        }
        grid.push(row);
    }
    return grid;
}

// 生成方块对象，附带关卡机制
export function createBlocksFromGrid(grid, num = 1) {
    const { w: bw, h: bh } = blockSizeFor(num);
    const gap = BLOCK_GAP;
    const margin = 30;
    const cols = Math.floor((W - 2 * margin) / (bw + gap));
    const startX = margin + (W - 2 * margin - cols * (bw + gap) + gap) / 2;
    const rng = mulberry32(num * 715 + 335);

    const unbreakableChance = num > 10 ? Math.min(0.04 + (num - 10) * 0.004, 0.12) : 0;
    const movingChance = num >= 12 ? Math.min(0.05 + (num - 12) * 0.004, 0.18) : 0;
    const shooterChance = num >= 18 ? Math.min(0.04 + (num - 18) * 0.003, 0.1) : 0;

    const bl = [];
    for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < grid[row].length; col++) {
            const type = grid[row][col];
            if (type === 0) continue;
            const x = startX + col * (bw + gap);
            const y = GRID_Y + row * (bh + gap);

            const indestructible = rng() < unbreakableChance;
            const moving = !indestructible && rng() < movingChance
                ? { phase: rng() * Math.PI * 2, speed: 0.010 + rng() * 0.012, amp: 26 + rng() * 40 }
                : null;
            const shooter = !indestructible && !moving && rng() < shooterChance
                ? { interval: 220 + rng() * 140, tick: 60 + rng() * 180 }
                : null;
            const hpBonus = state.player.curseBlockHpBonus || 0;

            bl.push({
                x, y, baseX: x, baseY: y, w: bw, h: bh,
                hp: indestructible ? Infinity : type + hpBonus,
                maxHp: type,
                indestructible, moving, shooter,
            });
        }
    }
    return bl;
}