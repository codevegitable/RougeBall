import { W, H, GRID_Y, BLOCK_GAP } from "./constants.js";
import { mulberry32 } from "./utils.js";
import { state } from "./state.js";
import { PAL } from "./palette.js";
import { spawnParticles } from "./particles.js";
import { spawnRing, spawnFloatingText } from "./fx.js";
import { BLOCK_SIZE_TABLE, HP_TABLE, HP_TIER, ARMORED, BLOCK_COUNT, SPECIALS, ELITE_BLOCK, SPLITTER_BLOCK, BENEFIT_BLOCK, BENEFIT_SPAWN } from "./data/levels.js";

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
    target = Math.min(target, Math.floor(cols * maxRows * BLOCK_COUNT.capRatio));

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
    for (let r = 0; r < maxRows && placed < target; r++) {
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

    // 精英方块概率
    const eliteChance = num >= ELITE_BLOCK.minLevel
        ? Math.min(
            ELITE_BLOCK.baseChance + (num - ELITE_BLOCK.minLevel) * ELITE_BLOCK.perLevel,
            ELITE_BLOCK.maxChance
        )
        : 0;

    const bl = [];
    const splitterCandidates = []; // 用于后续强制转换为分裂方块

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
            // 重甲砖：带装甲，可抵挡攻击。不与移动方块叠加
            const armored = !indestructible && !moving && rng() < armoredChance;

            // 精英方块：血量×2.5，不与不可摧毁/移动叠加
            const elite = !indestructible && !moving && rng() < eliteChance;

            // 特殊方块：可叠加在普通/移动/重甲方块上（互相排斥，每种方块只能有一种特殊）
            const special = !indestructible ? rollSpecial(rng, num) : null;
            const hpBonus = (state.player.curseBlockHpBonus || 0);

            let totalHp = type + hpBonus;
            let finalW = bw;
            let finalH = bh;

            // 特殊方块HP处理
            if (special === "heal") {
                totalHp = SPECIALS.heal.hp;
            } else if (special === "impact") {
                totalHp = SPECIALS.impact.hp;
            } else if (elite) {
                totalHp = Math.round(totalHp * ELITE_BLOCK.hpMultiplier);
                finalW = Math.round(bw * ELITE_BLOCK.sizeMultiplier);
                finalH = Math.round(bh * ELITE_BLOCK.sizeMultiplier);
            }

            const block = {
                x, y, baseX: x, baseY: y, w: finalW, h: finalH,
                hp: indestructible ? Infinity : totalHp,
                maxHp: totalHp,
                originalHp: type,  // 保存原始HP，用于分裂方块生成球数
                indestructible, moving, armored,
                armorLeft: armored ? ARMORED.absorb : 0,
                // Lv30+装甲改为伤害吸收模式
                armorAbsorbMode: armored && num >= ARMORED.absorbDamageLevel,
                armorAbsorb: armored && num >= ARMORED.absorbDamageLevel
                    ? (num >= ARMORED.absorbDamageHighLevel ? ARMORED.absorbDamageHigh : ARMORED.absorbDamage)
                    : 0,
                elite,
                explosive: special === "explosive",
                heal: special === "heal",
                bounce: special === "bounce",
                chain: special === "chain",
                power: special === "power",
                spread: special === "spread",
                momentum: special === "momentum",
                impact: special === "impact",
            };

            bl.push(block);

            // 收集候选分裂方块（非不可摧毁、非特殊方块）
            if (!indestructible && !special && !elite && num >= SPLITTER_BLOCK.minLevel) {
                splitterCandidates.push(block);
            }
        }
    }

    // 强制生成分裂方块（Lv4+），数量随关卡提升递增
    if (num >= SPLITTER_BLOCK.minLevel && splitterCandidates.length > 0) {
        const extra = Math.floor((num - SPLITTER_BLOCK.minLevel) / 8);
        const count = Math.min(SPLITTER_BLOCK.minCount + extra + Math.floor(rng() * (SPLITTER_BLOCK.maxCount - SPLITTER_BLOCK.minCount + 1)), splitterCandidates.length);
        const selected = [];
        for (let i = 0; i < Math.min(count, splitterCandidates.length); i++) {
            const idx = Math.floor(rng() * splitterCandidates.length);
            selected.push(splitterCandidates[idx]);
            splitterCandidates.splice(idx, 1);
        }
        for (const block of selected) {
            block.splitter = true;
        }
    }

    // 奖励方块：5% 概率出现（整关判定一次），独立生成于网格空隙。
// bonusOnly 标记使其不计入关卡总方块数与通关条件（见 game.js 的 hasBreakable）。
    if (num >= SPECIALS.reward.minLevel && rng() < SPECIALS.reward.chance) {
        const rb = makeRewardBlock(bl, cols, bw, bh, gap, startX, num);
        if (rb) bl.push(rb);
    }
    return bl;
}

// 特殊方块随机 roll：不做多重判定（用权重区间一次落点），保证互斥
function rollSpecial(rng, num) {
    let total = 0;
    const entries = [];
    for (const [id, def] of Object.entries(SPECIALS)) {
        if (id === "reward" || num < def.minLevel) continue;
        entries.push([id, def.chance]);
        total += def.chance;
    }
    if (total === 0) return null;
    const roll = rng() * total;
    let acc = 0;
    for (const [id, w] of entries) {
        acc += w;
        if (roll < acc) return id;
    }
    return null;
}

// 奖励方块：占据半场一个空格，30 秒后自灭。击碎后必定获得一个稀有奖励。
function makeRewardBlock(existing, cols, bw, bh, gap, startX, num) {
    const rng = mulberry32(num * 617 + 89);
    const rows = Math.min(3, Math.floor((H - GRID_Y - 150) / (bh + gap)));
    for (let attempt = 0; attempt < 24; attempt++) {
        const col = Math.floor(rng() * cols);
        const row = Math.floor(rng() * Math.max(1, rows));
        const x = startX + col * (bw + gap);
        const y = GRID_Y + row * (bh + gap);
        const overlaps = existing.some(
            (b) => x < b.x + b.w && x + bw > b.x && y < b.y + b.h && y + bh > b.y
        );
        if (overlaps) continue;
        return {
            x, y, baseX: x, baseY: y, w: bw, h: bh,
            hp: SPECIALS.reward.hp, maxHp: SPECIALS.reward.hp,
            originalHp: SPECIALS.reward.hp,
            indestructible: false, moving: null, armored: false, armorLeft: 0,
            armorAbsorbMode: false, armorAbsorb: 0,
            elite: false,
            explosive: false, heal: false, bounce: false,
            chain: false, power: false, spread: false, momentum: false, impact: false, splitter: false,
            reward: true, bonusOnly: true,
            expireAt: state.time + SPECIALS.reward.life,
        };
    }
    return null;
}

// Boss 关收益方块：冰冻方块，击碎冻结全场敌弹 2 秒。生成于上半场、
// 避开 Boss 游走区，30s 后自灭；不计通关（Boss 关不清方块）。
export function createBenefitBlocks(level) {
    const count = 2 + (level >= 30 ? 1 : 0) + (level >= 45 ? 1 : 0);
    const def = BENEFIT_BLOCK.freeze;
    const blocks = [];
    for (let i = 0; i < count; i++) {
        for (let attempt = 0; attempt < 30; attempt++) {
            const x = 60 + Math.random() * (W - 60 - def.w - 60);
            const y = 90 + Math.random() * 240;
            // 避开 Boss 出生/游走区（中心 ±170，高度 < 300）
            if (Math.abs(x + def.w / 2 - W / 2) < 170) continue;
            const overlaps = blocks.some(
                (b) => x < b.x + b.w && x + def.w > b.x && y < b.y + b.h && y + def.h > b.y
            );
            if (overlaps) continue;
            blocks.push({
                x, y, baseX: x, baseY: y, w: def.w, h: def.h,
                hp: def.hp, maxHp: def.hp,
                originalHp: def.hp,
                indestructible: false, moving: null, armored: false, armorLeft: 0,
                armorAbsorbMode: false, armorAbsorb: 0,
                elite: false,
                explosive: false, heal: false, bounce: false,
                chain: false, power: false, spread: false, momentum: false, impact: false, splitter: false,
                reward: false,
                freeze: true, bonusOnly: true,
                expireAt: state.time + def.life,
            });
            break;
        }
    }
    return blocks;
}

// ═══ 周期收益方块（Boss 战中途随机补充） ═══
//
// 四款新收益方块不在开局一次性铺完：每 12~18 秒随机一波、每波 2 个，
// 落点在中下部场地随机选取（不生成在太靠前的位置——即 Boss 游走区）。
// 方块只补充不替代：冰冻方块仍按开局固定生成，是整场可预期的基线福利。
//
// 由 game.js 主循环在 Boss 战每帧调用。计时归零时尝试生波：
// 同场新方块已达上限则顺延到下一周期，避免场地被塞满。

// 层数解锁的新方块池（去重后不足 2 种时允许重复同款）
function benefitPoolFor(level) {
    return Object.keys(BENEFIT_BLOCK).filter(
        (k) => k !== "freeze" && level >= (BENEFIT_BLOCK[k].minLevel || 0)
    );
}

// 落点候选：随机 x/y，避开 Boss 游走中心列、现有方块、Boss 本体与召唤物
function tryPlaceBenefitBlock(def) {
    for (let attempt = 0; attempt < 30; attempt++) {
        const x = BENEFIT_SPAWN.padX + Math.random() * (W - BENEFIT_SPAWN.padX * 2 - def.w);
        const y = BENEFIT_SPAWN.minY + Math.random() * (BENEFIT_SPAWN.maxY - BENEFIT_SPAWN.minY);
        if (Math.abs(x + def.w / 2 - W / 2) < BENEFIT_SPAWN.bossAvoid) continue;
        const overlaps = state.blocks.some(
            (b) => x < b.x + b.w && x + def.w > b.x && y < b.y + b.h && y + def.h > b.y
        );
        if (overlaps) continue;
        // 避开 Boss 本体与召唤物/祭坛（它们都是圆形判定，半径 14~20）
        const cx = x + def.w / 2, cy = y + def.h / 2;
        const bad = (state.boss && Math.hypot(cx - state.boss.x, cy - state.boss.y) < state.boss.r + 30) ||
            (state.boss && state.boss.minions && state.boss.minions.some((m) => Math.hypot(cx - m.x, cy - m.y) < m.r + 20)) ||
            (state.boss && state.boss.altars && state.boss.altars.some((al) => Math.hypot(cx - al.x, cy - al.y) < al.r + 20));
        if (bad) continue;
        return { x, y };
    }
    return null;
}

export function updateBenefitSpawns() {
    state.benefitWaveTimer -= state.dt;
    if (state.benefitWaveTimer > 0) return;
    state.benefitWaveTimer =
        BENEFIT_SPAWN.minInterval + Math.random() * (BENEFIT_SPAWN.maxInterval - BENEFIT_SPAWN.minInterval);

    // 同场新方块数量上限（冰冻不计入）
    const active = state.blocks.filter((b) => b.bonusOnly && !b.freeze).length;
    if (active >= BENEFIT_SPAWN.maxActive) return;

    const pool = benefitPoolFor(state.player.level);
    if (pool.length === 0) return;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const types = [];
    for (const k of shuffled) {
        if (types.length >= BENEFIT_SPAWN.perWave) break;
        types.push(k);
    }
    while (types.length < BENEFIT_SPAWN.perWave) types.push(shuffled[0]);

    let spawned = 0;
    for (const type of types) {
        const def = BENEFIT_BLOCK[type];
        const pos = tryPlaceBenefitBlock(def);
        if (!pos) continue;
        const flags = { freeze: false, purify: false, assimilate: false, aegis: false, frenzy: false };
        flags[type] = true;
        state.blocks.push({
            x: pos.x, y: pos.y, baseX: pos.x, baseY: pos.y, w: def.w, h: def.h,
            hp: def.hp, maxHp: def.hp,
            originalHp: def.hp,
            indestructible: false, moving: null, armored: false, armorLeft: 0,
            armorAbsorbMode: false, armorAbsorb: 0,
            elite: false,
            explosive: false, heal: false, bounce: false, reward: false,
            chain: false, power: false, spread: false, momentum: false, impact: false, splitter: false,
            ...flags, bonusOnly: true,
            expireAt: state.time + def.life,
        });
        spawnParticles(pos.x + def.w / 2, pos.y + def.h / 2, PAL.gold2, 8);
        spawnRing(pos.x + def.w / 2, pos.y + def.h / 2, PAL.gold3);
        spawned++;
    }
    if (spawned > 0) {
        spawnFloatingText(W / 2, BENEFIT_SPAWN.maxY + 30, "收益方块出现！", PAL.gold2);
    }
}