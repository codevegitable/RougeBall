import { W, H, GRID_Y, BLOCK_GAP, SPEED_ZONE_Y } from "./constants.js";
import { mulberry32 } from "./utils.js";
import { state } from "./state.js";
import { BLOCK_SIZE_TABLE, HP_TABLE, HP_TIER, ARMORED, BLOCK_COUNT } from "./data/levels.js";

// 方块尺寸随关卡递减（查表）
function blockSizeFor(level) {
    for (const row of BLOCK_SIZE_TABLE) {
        if (level <= row.maxLevel) return { w: row.w, h: row.h };
    }
    const last = BLOCK_SIZE_TABLE[BLOCK_SIZE_TABLE.length - 1];
    return { w: last.w, h: last.h };
}

// 程序化关卡生成
export function generateLevel(num) {
    const { w: bw, h: bh } = blockSizeFor(num);
    const gap = BLOCK_GAP;
    const margin = 30;
    const cols = Math.floor((W - 2 * margin) / (bw + gap));
    const maxRows = Math.floor((H - GRID_Y - 150) / (bh + gap));
    // 方块不能低于速度区间边界
    const zoneRows = Math.floor((SPEED_ZONE_Y - GRID_Y - bh) / (bh + gap));
    const limitedRows = Math.min(maxRows, Math.max(1, zoneRows));
    const rng = mulberry32(num * 1337 + 991);

    // 目标方块数：对数增长（见 data/levels.js 的 BLOCK_COUNT 说明）。
    // 用对数而非线性，是为了抵消「血量档位 × 命中难度」的乘性增长，
    // 让普通关的总难度落在直线上而不是凸曲线上。
    let target;
    if (num === 1) {
        target = BLOCK_COUNT.base;
    } else {
        const grow = BLOCK_COUNT.base + BLOCK_COUNT.k * Math.log(1 + (num - 1) / BLOCK_COUNT.shift);
        const jitter = 1 - BLOCK_COUNT.variance / 2 + rng() * BLOCK_COUNT.variance;
        target = Math.round(grow * jitter);
    }
    target = Math.min(target, Math.floor(cols * limitedRows * BLOCK_COUNT.capRatio));

    // 血量档位：从 HP_TIER.startLevel 起每 step 关升一档。
    // 原为"第 16 关起每 5 关一档"，前 15 关血量恒为 1，
    // 前段难度斜率只有中段的 1/4，曲线成不了直线。
    const tier = num < HP_TIER.startLevel
        ? 0
        : Math.min(HP_TABLE.length - 1, 1 + Math.floor((num - HP_TIER.startLevel) / HP_TIER.step));

    // 开局教学关全 1HP，不用概率表
    const force1HP = num <= HP_TIER.force1HpUntil;
    const table = HP_TABLE[tier];

    // 逐行填充分块，每行至少 2 个空隙。
    //
    // 空隙数原为 2 + floor(num/8)，随层数无上限增长：到 50 层是 8 个空隙，
    // 而该层只有 12 列——每行仅剩 4 列可用，再乘 0.55 的填充率，
    // 单行期望不到 2.2 个方块。这让实际方块数被死死压在 35 上下，
    // 无论目标值给多大都填不满（实测 50 层目标 64、实放 35）。
    // 结果是后段难度曲线被压平甚至回落，与"直线"目标相反。
    //
    // 改为按列数比例封顶（最多占 1/3 列，且不超过 4 个），
    // 空隙的作用是留出球路，不该反过来成为难度的天花板。
    const grid = [];
    let placed = 0;
    const gapCount = Math.min(
        2 + Math.floor(num / 8),
        Math.max(2, Math.floor(cols / 3)),
        BLOCK_COUNT.maxGaps
    );
    // 填充率上限从 0.55 提到 0.70：0.55 在 lv23 就封顶，
    // 与网格容量一起让后段方块数无法继续增长。
    const fillP = num === 1
        ? 0.6
        : Math.min(BLOCK_COUNT.fillBase + (num - 1) * BLOCK_COUNT.fillPerLevel, BLOCK_COUNT.fillCap)
          + (state.player.curseDensityBonus || 0);
    for (let r = 0; r < limitedRows && placed < target; r++) {
        const row = [];
        const gapCols = new Set();
        while (gapCols.size < gapCount) {
            gapCols.add(Math.floor(rng() * cols));
        }
        for (let c = 0; c < cols; c++) {
            if (gapCols.has(c)) { row.push(0); continue; }
            if (rng() > (num === 1 ? 0.65 : fillP)) { row.push(0); continue; }
            row.push(force1HP ? 1 : table[Math.floor(rng() * table.length)]);
            placed++;
            if (placed >= target) { /* 剩余填充 0 */ for (; c < cols - 1; c++) row.push(0); break; }
        }
        grid.push(row);
    }

    // 后处理：消除 1 格宽的口袋（两个纵向障碍之间只有 1 格通路时，移除该方块）
    // 场景：某列 row[r][c] 非空，且 row[r-1][c] 也非空，且相邻列 row[r][c-1]/row[r][c+1]
    // 为空但 row[r-1][c-1]/row[r-1][c+1] 非空 → 形成 1 格宽的纵向通道 → 移除方块
    for (let r = 1; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            if (grid[r][c] === 0) continue;
            // 上方有方块
            if (grid[r - 1][c] === 0) continue;
            // 检查左侧：c-1 为空但 c-1 上方有方块
            if (c > 0 && grid[r][c - 1] === 0 && grid[r - 1][c - 1] > 0) {
                grid[r][c] = 0;
                placed--;
                continue;
            }
            // 检查右侧：c+1 为空但 c+1 上方有方块
            if (c < cols - 1 && grid[r][c + 1] === 0 && grid[r - 1][c + 1] > 0) {
                grid[r][c] = 0;
                placed--;
            }
        }
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
            // 血量加成随层数增长：第 18 关 +2，每 6 关 +1，上限 +6
            const armorBonus = armored ? Math.min(6, 2 + Math.floor((num - 18) / 6)) : 0;
            const hpBonus = (state.player.curseBlockHpBonus || 0) + armorBonus;
            const totalHp = type + hpBonus;

            bl.push({
                x, y, baseX: x, baseY: y, w: bw, h: bh,
                hp: indestructible ? Infinity : totalHp,
                maxHp: totalHp,
                indestructible, moving, armored,
            });
        }
    }
    return bl;
}