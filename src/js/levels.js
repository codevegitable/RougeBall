import { W, H, GRID_Y, BLOCK_GAP } from "./constants.js";
import { mulberry32 } from "./utils.js";
import { state } from "./state.js";
import { BLOCK_SIZE_TABLE, HP_TABLE, ARMORED } from "./data/levels.js";

// 方块尺寸随关卡递减（查表）
function blockSizeFor(level) {
    for (const row of BLOCK_SIZE_TABLE) {
        if (level <= row.maxLevel) return { w: row.w, h: row.h };
    }
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
    const tier = num <= 15 ? 0 : Math.min(HP_TABLE.length - 1, Math.floor((num - 16) / 5));

    // 前 3 关全部 1HP，不用概率表
    const force1HP = num <= 3;
    const table = HP_TABLE[tier];

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
    // 重甲砖概率：接替原射击方块的位置，"武装"诅咒在此加成
    const armoredChance = num >= ARMORED.minLevel
        ? Math.min(
            ARMORED.baseChance + (num - ARMORED.minLevel) * ARMORED.perLevel + (state.player.curseArmoredBonus || 0),
            ARMORED.maxChance + (state.player.curseArmoredBonus || 0)
        )
        : 0;

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
            // 重甲砖：额外叠血量的硬点。不与移动方块叠加，避免"追着打又打不烂"
            const armored = !indestructible && !moving && rng() < armoredChance;
            const hpBonus = (state.player.curseBlockHpBonus || 0) + (armored ? ARMORED.hpBonus : 0);
            const totalHp = type + hpBonus;

            bl.push({
                x, y, baseX: x, baseY: y, w: bw, h: bh,
                hp: indestructible ? Infinity : totalHp,
                // maxHp 记录实际总血量，裂纹与配色档位才能反映重甲砖的真实硬度。
                // 不可击碎方块保持有限值，避免 Infinity 流入配色/计分运算。
                maxHp: totalHp,
                indestructible, moving, armored,
            });
        }
    }
    return bl;
}