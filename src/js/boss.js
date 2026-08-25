import { W, H, STATE, PADDLE_BASE_W } from "./constants.js";
import { state, addScore, loseLife } from "./state.js";
import { ctx } from "./canvas.js";
import { spawnParticles } from "./particles.js";
import { screenShake, spawnRing, spawnFloatingText, playerHurt } from "./fx.js";
import { playBossHit, playBossShoot, playBossDeath, playVictory, playGameOver, playPlayerHit, playWallHit } from "./sound.js";
import { BOSS_CANDIDATES, BOSS_TIER_INDEX } from "./data/bosses.js";
import { PAL, rgba } from "./palette.js";
import { PX, pRectRaw, pRing, pBar, pText, pDitherMask, pCircle, pBlob } from "./pixel.js";
import { HUD_TOP_H } from "./layout.js";
import { drawIcon } from "./icons.js";
import { drawBossSprite, drawBossCrown } from "./boss_art.js";

// ─── Boss 遭遇记录（用于图鉴） ─────────────────────────────
const BOSS_LOG_KEY = "bounceRoguelikeBossLog";

function loadBossLog() {
    try { return new Set(JSON.parse(localStorage.getItem(BOSS_LOG_KEY) || "[]")); }
    catch { return new Set(); }
}

function saveBossLog(log) {
    try { localStorage.setItem(BOSS_LOG_KEY, JSON.stringify([...log])); }
    catch { /* ignore */ }
}

export function hasEncounteredBoss(name) {
    return loadBossLog().has(name);
}

export function getAllBosses() {
    const seen = loadBossLog();
    const result = [];
    for (const level of [10, 20, 30, 40, 50]) {
        for (const b of BOSS_CANDIDATES[level]) {
            result.push({ ...b, level, encountered: seen.has(b.name) });
        }
    }
    return result;
}

// 以任意中心绘制像素圆（pCircle 的别名，便于 boss 局部坐标系调用）
const pCircleAt = (cx, cy, r, color) => pCircle(cx, cy, r, color);

// 挡板受击区域（与 physics.js 同步）
function bossHitRect() {
    const p = state.paddle;
    const base = PADDLE_BASE_W * (1 + (state.player.curseHitPenalty || 0));
    const extra = p.width - base;
    return { x: p.x + extra / 2, w: base, y: p.y, h: p.height };
}

// 蜂巢专用底墙：挡板受击带的下沿（挡板 y=560 + 板高 14 = 574）。
//
// 取这条线而不是画布底 H：原判定 y>H+30=630 让残弹继续飘过挡板再穿过技能栏，
// 而 P2 玩家正需要贴着底部横向甩开自爆无人机——那些"已经躲过"的弹仍留在视野里干扰读图。
// 574 同时正好是 bossHitRect 的判定下界，因此按"弹丸上沿越过底墙"剔除时，
// 被剔除的弹在几何上必然已经不满足命中条件，不可能吃掉一次本该命中的判定。
function hiveFloorY() {
    return state.paddle.y + state.paddle.height;
}

// tier 威胁权重：把各项弹幕/召唤强度沿 tier 的增长放缓。
//
// 原实现所有项都按 tier 线性缩放（弹数 3+t、环形 6+2t、小怪血量 20+10t …），
// 七项同时线性增长 → 综合威胁系数 1.00/1.29/1.59/1.91。这个乘数再乘上
// 同样激增的 HP，使最终 Boss 冲到普通关直线的 5.25 倍。
//
// 改用 t^0.75 后综合威胁变成 1.00/1.23/1.40/1.54，增长更平缓：
// 难度的主要载体交回给 HP（可读、可预期），而不是叠满弹幕数量。
// 这样"斜率递增"依然成立，但不会陡到断层。
export function tierWeight(tier) {
    return Math.pow(Math.max(0, tier), 0.75);
}

// ═══ 机械蜂巢（tier 2）三阶段参数 ═══
//
// 改版起因：原实现弹幕过密，但根因不在弹幕参数，而在召唤物无上限——
// executeSummon 在 active 阶段每帧调用一次 spawnMinionForType（timer<8 共约 8 次），
// 而 hive 技能池只有 ["summon"]、周期仅 101 帧，minions 又没有任何数量上限。
// 实测 10s 后场上约 28 只（其中 turret 16 只 → 12.6 发/秒），20s 后 25 发/秒且不收敛。
// 闲时弹幕本身只有 1.79 发/秒，并不是主要来源。
//
// 数值全部由难度预算反解，而非直接填写：
//   HP 412；damageBoss 有 hitCooldown=25 帧 → 玩家最多 2.4 次/秒；
//   lv45 时 bossDefeated=2 → rewardScale=0.76，典型 ballDamage≈5
//   ⇒ 玩家 DPS ≈ 12/秒，全程理论最短 34s。
//
// 以下为逐帧仿真实测（12 DPS、i 帧照常、理想走位的玩家，跑完整场）：
//   全程 37.9s（机械蜂巢）/ 39.6s（蜂群母舰），与 34s 的理论下限相符；
//   阶段时长 P1 11.7s / P2 17.9s / P3 8.3s；
//   同屏弹量峰值 P1 17~19 发、P2 10 发、P3 0 发（改版前 P1 约 55 发）；
//   召唤物恒定 3 只（改版前 20s 后仍在涨）。
// P2 比预算长是因为护盾无人机的 50% 减伤——那是它该有的效果，不是失控。
const HIVE_PHASE_AT = [0.65, 0.30]; // HP 比例低于此值时进入下一阶段

// P1：只弹幕。周期 90 帧 × 4 发 → 2.67 发/秒，同屏约 12 发（原实现同屏约 55 发）
const HIVE_P1 = { volleyMin: 90, volleyRand: 30, fanCount: 4 };

// P2：召唤为主，弹幕退居次要。周期 135 帧 → 2.13 发/秒，总密度低于 P1。
// 威胁由召唤物承担，不靠加弹——这是"弹幕不宜过密"的落点。
const HIVE_P2 = {
    volleyMin: 135, volleyRand: 45, fanCount: 3,
    respawnDelay: 300,  // 召唤物死亡后延迟 5s 补位，而非立即
};

// 每型同屏限 1（总计 3）。原实现无上限，是弹幕过密的真正来源。
const HIVE_MINION_KINDS = ["turret", "shield", "bomber"];

// P3：只激光。周期 130 帧 = 2.2s（预警 55 + 开火 40 + 恢复 35），每波 2 道。
const LASER = {
    warn: 55,        // 预警帧数
    fire: 40,        // 开火帧数
    recover: 35,     // 恢复帧数（易伤窗口）
    halfW: 26,       // 束半宽 → 全宽 52px = 13 个美术像素
    warnHalfW: 3,    // 预警细线半宽
    beams: 2,        // 每波道数
    // 双束间距按"挡板平面上的落点距离"定义，而不是张角：
    // 安全走廊需容纳 挡板110 + 两侧各半束宽26×2=52 + 余量30 = 192px。
    // 在纵向射程 560-130=430px 上这等价于 atan(192/430)=24°（取整 25°），
    // 但直接写角度会在 Boss 漂到场边时退化成近水平的束——它在射到挡板平面前
    // 就出界了，"永远存在安全区"的前提反而失效。按落点定则几何上恒成立。
    gap: 192,
    edgePad: 60,     // 落点夹持，避免光束射到场外形同虚设
    // 打断做成"每次命中削掉一道束"，而不是"命中 N 次取消整波"。
    //
    // 阈值制在这里必然是断崖：球从挡板到 Boss 单程 430px÷5.5 = 78 帧、往返 156 帧，
    // 而预警窗只有 55 帧。实测阈值 2 时 1~3 球的打断率是 0%/0%/4%，到 5 球突然 93%；
    // 阈值 1 则 1 球 35%、2 球就 94%，P3 直接失去威胁。两种取值都没有中间地带。
    // 逐束削减让收益与投入成正比：单球偶尔削掉一道（安全区变宽），
    // 多球才能削光取消整波，且多球本来就更难兼顾走位，不会白拿。
    interruptRecover: 100, // 削光整波的奖励：长易伤窗口（常规恢复只有 35）
};

// 阶段切换时的喘息窗口：清场 + 易伤，让玩家有时间读懂"打法变了"
const HIVE_PHASE_BREATHER = 90;

// ═══ 终焉聚合体（tier 4）四阶段 ═══
//
// 设计目标：第 50 层的 Boss 不再是第四层司祭的"换皮加血"，而是一次
// 把前四层 Boss 的看家本领依次复刻成四个阶段的长局。玩家要在最终战里
// 按顺序应对四种已学过的打法，且每一种都带一点强化：
//   P1（HP>75%）钢铁甲壳：执行者式冲锋+跳砸，保留正面减伤/背面增伤
//   P2（75~50%）腐化内核：母体式召唤（治疗/毒/藤蔓×变种）
//   P3（50~25%）蜂群武装：蜂巢式主炮激光 + 低频追踪弹（比蜂巢 P3 多一层压力）
//   P4（25~0% ）司祭之眼：诅咒祭坛 + 可打断蓄力大招 + 冲锋
// 阶段推进与蜂巢同源（按 HP 阈值 while 推进），切换时清场 + 短暂易伤喘息。
// 弹速乘性随阶段递增（每阶 +10%），让终局的压迫感沿阶段爬升。
//
// 时长预算（玩家 DPS ≈12，与蜂巢注释同一套假设）：
// 每阶 150 HP 各约 12.5s，合计 ≈50s；阶段喘息与激光易伤窗提供 ×1.5 窗口，
// 实际约 45~55s——比蜂巢的 38s 长一档，符合最终战的期望体量。
const FINAL_PHASES = [
    { at: 0.75, skills: ["charge", "slam"], patterns: ["fan"], label: "一阶·钢铁甲壳" },
    { at: 0.50, skills: ["summon", "slam"], patterns: ["ring", "wave"], label: "二阶·腐化内核" },
    { at: 0.25, skills: [], patterns: ["homing"], label: "三阶·蜂群武装" },
    { at: 0, skills: ["altar", "ultimate", "charge"], patterns: ["split", "homing", "fan"], label: "终阶·司祭之眼" },
];

// P3 追踪弹节奏：周期拉到 150~190 帧、每波 2 发。
// 蜂巢 P3 是"纯激光"命题，终焉三阶则在其上叠一层低频追踪压迫，
// 周期拉长是为了给激光预警窗留出干净的读图空间。
const FINAL_P3 = { volleyMin: 150, volleyRand: 40, fanCount: 2 };

// 阶段切换喘息（60 帧：比蜂巢的 90 短——这是最终战，喘息不宜过度）
const FINAL_PHASE_BREATHER = 60;

export function createBoss(level) {
    const candidates = BOSS_CANDIDATES[level];
    const def = candidates[Math.floor(Math.random() * candidates.length)];
    state.boss = {
        // 基础
        level, name: def.name, color: def.color, bulletSpeed: def.bulletSpeed,
        hp: def.hp, maxHp: def.hp, skills: def.skills, patterns: def.patterns,
        bossType: def.bossType || "executor",
        desc: def.desc,
        x: W / 2, y: 130, r: 56, flash: 0, tier: BOSS_TIER_INDEX.indexOf(level),
t: 0,
        // 受击冷却：防止冲锋等技能与球连续碰撞造成瞬间多段伤害
        hitCooldown: 0,
        // 状态机
        action: null, // 当前技能 {type, phase, timer}
        actionCooldown: 20, // 技能间冷却（初始短，后续由恢复期设置）
        recoverTimer: 0, // 恢复阶段计时（易伤窗口）
        vulnerable: false, // 是否易伤
        // 冲锋
        chargeTarget: null,
        chargeSpeed: 0,
        // 跳砸
        slamTarget: null,
        slamWave: null,
        // 召唤物
        minions: [],
        // 祭坛（诅咒司祭专属）
        altars: [],
        // 蓄力大招
        chargeProgress: 0, // 0-100
        interrupted: false,
        // 阶段
        // 普通 Boss：0=第一, 1=第二(半血后)
        // 机械蜂巢（tier 2）：0=纯弹幕, 1=召唤, 2=激光，见 HIVE_PHASE_AT
        phase: 0,
        // 弹幕
        volleyTimer: 0,
        volleyIdx: 0,
        spiralFrames: 0, spiralAngle: 0, spiralTick: 0,
        homingQueue: 0, homingTick: 0,
        dash: null, dashCd: 0,
        // 激光（蜂巢三阶段 / 终焉三阶共用）
        lasers: [],        // 当前波次的束 {ang, x0, y0, hit}，空数组=闲置
        laserPhase: "",    // "warn" | "fire" | ""
        laserPhaseTimer: 0,
        laserTimer: 0,     // 距下一波的倒计时（含恢复期，保证波次周期恒定）
        laserHits: 0, // 本波预警期内已被削掉的束数（仅用于显示，机制见 tryInterruptLaser）
        // 召唤物补位冷却：按类型记名，实现"每型同屏限 1 + 延迟补位"
        minionRespawn: {},
    };
    state.bossBullets = [];
    state.bossDangerZones = [];
    // 开场弹幕
    state.boss.volleyTimer = 60;
    // 蜂巢 Boss 追踪弹间隔延长 1/3
    if (def.bossType === "hive") state.boss.homingInterval = 21;
    // 终焉聚合体：起始技能池/弹幕由阶段表决定（def 中的仅供图鉴展示）
    if (def.bossType === "final") {
        state.boss.skills = FINAL_PHASES[0].skills;
        state.boss.patterns = FINAL_PHASES[0].patterns;
    }
    // 记录遭遇（用于图鉴）
    const log = loadBossLog();
    log.add(def.name);
    saveBossLog(log);
}

export function updateBoss() {
    const boss = state.boss;
    if (!boss) return;
    // 时间暂停（The World）：Boss 本体、召唤物、弹幕全部冻结。
    // 但受击冷却与闪白必须继续递减——damageBoss 在 hitCooldown>0 期间拒绝伤害，
    // 冷却一旦跟着冻结，4 秒内除第一击外的所有命中都会被吞掉，
    // "时间暂停"就会反过来变成 Boss 的免伤盾。
    if (state.player.freezeTimer > 0) {
        const fdt = state.dt;
        boss.flash = Math.max(0, boss.flash - 0.08 * fdt);
        boss.hitCooldown = Math.max(0, boss.hitCooldown - fdt);
        return;
    }
    const dt = state.dt;
    boss.t += dt;
    boss.flash = Math.max(0, boss.flash - 0.08 * dt);
    boss.hitCooldown = Math.max(0, boss.hitCooldown - dt);

    // 同化方块产出的友军弹：持续追踪 Boss（见函数定义）
    updateFriendlyBullets(dt);

    // 飘移（仅在未执行移动类技能时：charge active / slam active 会自行控制位置）
    const movingAction = boss.action &&
        ((boss.action.type === "charge" && boss.action.phase === "active") ||
         (boss.action.type === "slam" && boss.action.phase === "active"));
    // 蜂巢激光波期间必须定住：Boss 的常态飘移是 ±140px 正弦，最大 1.68px/帧，
    // 40 帧开火期就能把束横移 67px——那正是"扫射"，会把已经躲对位置的玩家扫回去。
    // 定住 Boss 同时保证预警细线始终连在炮口上，玩家读得出光是从哪儿来的。
    // 终焉三阶复用同一套激光，"不许扫射"的约束同样成立。
    const laserLocked = (boss.bossType === "hive" || (boss.bossType === "final" && boss.phase === 2)) &&
        (boss.laserPhase === "warn" || boss.laserPhase === "fire");
    if (!movingAction && !laserLocked) {
        boss.x = W / 2 + Math.sin(boss.t * 0.012) * 140;
        boss.y = 130 + Math.sin(boss.t * 0.023) * 20;
    }

    // 机械蜂巢：三阶段各有独立节奏，不走通用技能状态机
    // （P1 只弹幕 / P2 只召唤 / P3 只激光，用技能轮换反而无法保证"某阶段不做某事"）
    if (boss.bossType === "hive") {
        updateHive(boss, dt);
        updateMinions(boss, dt);
        // 蜂巢不生成祭坛，但仍要调用——该函数同时负责把 altarDmgP/SpeedP/CdP
        // 复位成默认值，跳过它会让上一场 Boss 的诅咒残留在玩家身上。
        altarCurseEffects();
        updateBossBullets();
        updateDangerZones();
        return;
    }

    // 终焉聚合体：四阶段轮回（见 FINAL_PHASES）。与蜂巢同样走专属状态机——
    // 通用状态机只能从固定技能池轮换，表达不了"阶段内只做某些事"。
    if (boss.bossType === "final") {
        updateFinalBoss(boss, dt);
        updateMinions(boss, dt);
        altarCurseEffects();
        updateBossBullets();
        updateDangerZones();
        return;
    }

    // 恢复阶段（易伤窗口）
    if (boss.recoverTimer > 0) {
        boss.recoverTimer -= dt;
        boss.vulnerable = true;
        if (boss.recoverTimer <= 0) {
            boss.vulnerable = false;
            boss.action = null;
            // 第三层 Boss（tier 2）降低攻击频率：冷却延长 50%
            const cdMul = boss.tier === 2 ? 1.5 : 1;
            boss.actionCooldown = (20 + Math.random() * 15) * cdMul;
        }
        // 恢复阶段不执行其他动作
        updateBossBullets();
        updateDangerZones();
        return;
    }

    // 技能冷却
    if (boss.actionCooldown > 0) {
        boss.actionCooldown -= dt;
        if (boss.actionCooldown <= 0) {
            boss.actionCooldown = 0;
            pickNextAction(boss);
        }
    }

    // 执行当前技能
    if (boss.action) {
        executeAction(boss, dt);
    } else {
        // 闲时发射弹幕
        fireVolley(boss, dt);
        // 消费持续弹幕（追踪/螺旋），这些由 fireVolley 设置队列后在此排放
        tickSustainedPatterns(boss, dt);
    }

    // 更新召唤物
    updateMinions(boss, dt);
    // 应用祭坛诅咒效果
    altarCurseEffects();
    updateBossBullets();
    updateDangerZones();
}

// ═══ 机械蜂巢：三阶段驱动 ═══════════════════════════════════
//
// 与通用技能状态机并行存在，而不是复用它：通用机是"从技能池里轮换"，
// 无法表达"P1 绝不召唤 / P3 绝不发弹"这类硬约束——只要技能在池里就迟早会抽到。
// 三阶段各自是一条固定节奏线，读起来也更接近玩家实际感知的"打法换了"。
function updateHive(boss, dt) {
    hivePhaseCheck(boss);

    // 阶段切换喘息：清场 + 易伤，期间不做任何攻击
    if (boss.recoverTimer > 0) {
        boss.recoverTimer -= dt;
        boss.vulnerable = true;
        if (boss.recoverTimer <= 0) boss.vulnerable = false;
        return;
    }

    if (boss.phase === 0) {
        // P1：只弹幕。周期 90~120 帧，fan/split 交替。
        fireHiveVolley(boss, dt, HIVE_P1);
    } else if (boss.phase === 1) {
        // P2：召唤为主 + 低频弹幕（总弹密度低于 P1）
        hiveSummonTick(boss, dt);
        fireHiveVolley(boss, dt, HIVE_P2);
    } else {
        // P3：只激光，一发子弹都不打
        updateLasers(boss, dt);
    }
}

// 阶段推进：按 HP 比例跨过 HIVE_PHASE_AT 的阈值就进阶。
// 用 while 而非 if——一次超额伤害（易伤 ×1.5 + 穿透）足以跨过两个阈值，
// 用 if 会让 Boss 卡在 P2 直到再挨一下，表现为"血量早就见底了却还在召唤"。
function hivePhaseCheck(boss) {
    const ratio = boss.hp / boss.maxHp;
    while (boss.phase < HIVE_PHASE_AT.length && ratio < HIVE_PHASE_AT[boss.phase]) {
        boss.phase++;
        onHivePhaseEnter(boss);
    }
}

function onHivePhaseEnter(boss) {
    // 清场：残留的旧阶段威胁不该跨进新阶段，否则 P3"不发弹幕"会被上一阶段的
    // 存量子弹和炮台破坏，玩家读不出规则已经变了。
    state.bossBullets.length = 0;
    for (const m of boss.minions) spawnParticles(m.x, m.y, m.color || PAL.bone1, 10);
    boss.minions.length = 0;
    boss.minionRespawn = {};
    boss.lasers.length = 0;
    boss.laserPhase = "";
    boss.laserHits = 0;
    // 进入新阶段先给一次易伤喘息，让玩家有时间读懂新的攻击方式
    boss.recoverTimer = HIVE_PHASE_BREATHER;
    boss.vulnerable = true;
    // 第一波不要贴着喘息窗结束就来
    boss.volleyTimer = 60;
    boss.laserTimer = 40;
    const label = boss.phase === 1 ? "第二阶段：蜂群部署！无人机来袭" : "第三阶段：主炮充能！预警期击打可打断";
    spawnFloatingText(boss.x, boss.y - 60, label, boss.color);
    screenShake(8, 200);
    playBossShoot();
}

// ═══ 终焉聚合体：四阶段驱动 ═══════════════════════════════
function updateFinalBoss(boss, dt) {
    finalPhaseCheck(boss);

    // 阶段切换喘息：清场 + 易伤，期间不做任何攻击
    if (boss.recoverTimer > 0) {
        boss.recoverTimer -= dt;
        boss.vulnerable = true;
        if (boss.recoverTimer <= 0) {
            boss.vulnerable = false;
            boss.action = null;
            boss.actionCooldown = 15 + Math.random() * 15;
        }
        return;
    }

    if (boss.phase === 2) {
        // P3 蜂群武装：主炮激光（复用蜂巢 P3 全套机制）+ 低频追踪弹。
        // updateLasers 自带每波结束的易伤窗口（LASER.recover），
        // 会被上面的喘息门消费，节奏与蜂巢 P3 完全一致。
        updateLasers(boss, dt);
        fireHiveVolley(boss, dt, FINAL_P3);
        return;
    }

    // P1 / P2 / P4：通用技能状态机，技能池由 finalPhaseCheck 按阶段换装
    if (boss.actionCooldown > 0) {
        boss.actionCooldown -= dt;
        if (boss.actionCooldown <= 0) {
            boss.actionCooldown = 0;
            pickNextAction(boss);
        }
    }
    if (boss.action) {
        executeAction(boss, dt);
    } else {
        fireVolley(boss, dt);
        tickSustainedPatterns(boss, dt);
    }
}

function finalPhaseCheck(boss) {
    const ratio = boss.hp / boss.maxHp;
    while (boss.phase < FINAL_PHASES.length && ratio < FINAL_PHASES[boss.phase].at) {
        boss.phase++;
        onFinalPhaseEnter(boss);
    }
}

function onFinalPhaseEnter(boss) {
    // 清场：旧阶段的威胁不跨进新阶段（与蜂巢同理，让玩家读得出"打法换了"）。
    // 上一阶段正在放激光/冲锋时跨阈值，也要把残留的束与动作撤掉。
    state.bossBullets.length = 0;
    for (const m of boss.minions) spawnParticles(m.x, m.y, m.color || PAL.bone1, 10);
    boss.minions.length = 0;
    boss.minionRespawn = {};
    if (boss.altars) boss.altars.length = 0;
    boss.lasers.length = 0;
    boss.laserPhase = "";
    boss.laserHits = 0;
    boss.action = null;
    boss.homingQueue = 0;
    boss.spiralFrames = 0;

    // 换装：技能池与弹幕模式随阶段切换
    const cfg = FINAL_PHASES[boss.phase];
    boss.skills = cfg.skills;
    boss.patterns = cfg.patterns;

    // 喘息易伤窗 + 首波攻击延迟
    boss.recoverTimer = FINAL_PHASE_BREATHER;
    boss.vulnerable = true;
    boss.volleyTimer = 60;
    boss.laserTimer = 40;
    boss.actionCooldown = 15 + Math.random() * 15;

    spawnFloatingText(boss.x, boss.y - 60, cfg.label, boss.color);
    screenShake(8, 200);
    playBossShoot();
}

// ─── P1 / P2 弹幕 ─────────────────────────────────────────
// 不复用 fireVolley：那条路径带着 tier===2 的 ×1.4 补丁和固定的 90+rand*60 周期，
// 而三阶段需要每阶段各自的节奏参数。
function fireHiveVolley(boss, dt, cfg) {
    // spiral / homing 是持续性弹幕：它们在自己的活跃期内自行发射。
    // volleyTimer 仍然照常倒数——否则持续期会白白吃掉下一波的冷却，
    // 实测让"蜂群母舰"(patterns 全是这两项) 的弹量掉到同僚的一半。
    const sustained = tickSustainedPatterns(boss, dt);

    boss.volleyTimer -= dt;
    if (boss.volleyTimer > 0 || sustained) return;
    boss.volleyTimer = cfg.volleyMin + Math.random() * cfg.volleyRand;
    const pattern = boss.patterns[boss.volleyIdx % boss.patterns.length];
    boss.volleyIdx++;
    fireHivePattern(boss, pattern, cfg);
}

function fireHivePattern(boss, pattern, cfg) {
    const spd = boss.bulletSpeed;
    switch (pattern) {
        case "fan": aimedFan(boss, spd, cfg.fanCount); break;
        case "split": aimedFan(boss, spd, Math.max(2, cfg.fanCount - 1), { splitAt: 46 }); break;
        case "ring": ringBurst(boss, spd * 0.85, cfg.fanCount + 2); break;
        case "wave": aimedFan(boss, spd, cfg.fanCount, { wave: true }); break;
        // 下面两项在此前的实现里只写字段、无人消费，等于哑火（见 tickSustainedPatterns）。
        // 发数与 fan 对齐：spiral 每 9 帧 1 发、homing 每 14 帧 1 发，
        // 都产出 cfg.fanCount 发，四种 pattern 的每波弹量因此一致。
        case "homing": boss.homingQueue = cfg.fanCount; boss.homingTick = 0; break;
        case "spiral": boss.spiralFrames = cfg.fanCount * 9; boss.spiralTick = 0; boss.spiralAngle = Math.random() * Math.PI * 2; break;
        default: aimedFan(boss, spd, cfg.fanCount); break;
    }
    playBossShoot();
}

// spiral / homing 的实际发射逻辑。
//
// 这两个 pattern 原本只在 fireVolleySingle 里设置 spiralFrames / homingQueue，
// 却没有任何代码读取它们——"蜂群母舰"的 patterns 恰好是 ["spiral","homing"]，
// 于是它的闲时弹幕实测为 0 发。补上消费方后两艘 tier 2 Boss 的弹幕量才对齐。
// 返回 true 表示本帧正处在持续弹幕中，不应再排新波次。
function tickSustainedPatterns(boss, dt) {
    let busy = false;
    if (boss.spiralFrames > 0) {
        busy = true;
        boss.spiralFrames -= dt;
        boss.spiralTick -= dt;
        if (boss.spiralTick <= 0) {
            boss.spiralTick = 9; // 每 9 帧一发 → 与 fan 的每波发数同量级
            boss.spiralAngle += 0.62;
            fireBullet(boss, Math.cos(boss.spiralAngle), Math.sin(boss.spiralAngle), boss.bulletSpeed * 0.9, 6);
        }
    }
    if (boss.homingQueue > 0) {
        busy = true;
        boss.homingTick -= dt;
        if (boss.homingTick <= 0) {
            boss.homingTick = boss.homingInterval || 14;
            boss.homingQueue--;
            aimedFan(boss, boss.bulletSpeed * 0.8, 1, { homing: true });
        }
    }
    return busy;
}

// ─── P2 召唤：每型同屏限 1 ─────────────────────────────────
//
// 这是"弹幕过密"的真正修复点。原实现 executeSummon 在 active 期每帧调用一次
// spawnMinionForType 且 minions 无上限，10s 后场上约 28 只、turret 贡献 12.6 发/秒。
// 改为按类型定额：三型各恒定 1 只，死亡后延迟 respawnDelay 才补位。
// 数量确定后 P2 的弹幕产出也随之确定（turret 1 只 → 0.60 发/秒），可以进预算表。
function hiveSummonTick(boss, dt) {
    for (const kind of HIVE_MINION_KINDS) {
        if (boss.minions.some(m => m.type === kind)) {
            // 存活期间持续把冷却压满，这样计时才是"从死亡那刻起算 5s"。
            // 若只在生成时设一次，一只活了 4s 才被打掉的炮台会在 1s 后就补位。
            boss.minionRespawn[kind] = HIVE_P2.respawnDelay;
            continue;
        }
        const cd = boss.minionRespawn[kind] || 0;
        if (cd > 0) {
            boss.minionRespawn[kind] = cd - dt;
            continue;
        }
        spawnHiveMinion(boss, kind);
        spawnHiveMinion(boss, kind); // 二阶段召唤物数量 ×2
    }
}

function spawnHiveMinion(boss, kind) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 120 + Math.random() * 60;
    const mx = Math.max(40, Math.min(W - 40, boss.x + Math.cos(angle) * dist));
    const my = Math.max(80, Math.min(H - 60, boss.y + Math.sin(angle) * dist));
    const minionHp = Math.round((18 + tierWeight(boss.tier) * 8) / 2);
    const colors = { turret: PAL.ember2, shield: PAL.gold3, bomber: PAL.blood2 };
    const names = { turret: "炮台", shield: "护盾", bomber: "自爆" };
    boss.minions.push({
        x: mx, y: my, r: 14, hp: minionHp, maxHp: minionHp, type: kind,
        healTimer: 0, poisonTimer: 0,
        // 固定 100 帧而非 60+rand*30：数量已定额，射速再随机就无法做密度预算
        shootTimer: kind === "turret" ? 100 : 0,
        fireInterval: kind === "turret" ? 100 : 0,
        // bomber 的 seekTimer 是自毁计时，不是补位冷却；1.2 的速度见 updateMinions 注释
        seekTimer: kind === "bomber" ? 420 : 0,
        speed: kind === "bomber" ? 1.2 : 0,
        flash: 0, angle: Math.random() * Math.PI * 2, color: colors[kind],
    });
    spawnFloatingText(mx, my - 20, `部署：${names[kind]}`, colors[kind]);
    playBossShoot();
}

// ─── P3 激光 ──────────────────────────────────────────────
//
// 波次：预警 55 → 开火 40 → 恢复 35（周期 130 帧）。
// 预警期锁定挡板当前中心，之后不再追踪——玩家能靠"看见细线 → 走开"稳定应对，
// 追踪式激光则会退化成纯运气。
function updateLasers(boss, dt) {
    if (boss.laserPhase === "warn") {
        boss.laserPhaseTimer -= dt;
        if (boss.laserPhaseTimer <= 0) {
            boss.laserPhase = "fire";
            boss.laserPhaseTimer = LASER.fire;
            boss.laserHits = 0;
            screenShake(7, 180);
            playBossShoot();
        }
        return;
    }

    if (boss.laserPhase === "fire") {
        boss.laserPhaseTimer -= dt;
        // 束的起点与方向在预警时就固定了，开火期一律不动——Boss 的常态飘移
        // 已由 updateBoss 的 laserLocked 冻结，这里也不重算，"不扫射"才成立。
        checkLaserHit(boss);
        if (boss.laserPhaseTimer <= 0) {
            boss.lasers.length = 0;
            boss.laserPhase = "";
            // 恢复期＝易伤窗口：激光打完必然有一段破绽，这是 P3 的输出窗口。
            // 恢复结束即接下一波，故 laserTimer 归零——周期恰好 55+40+35=130 帧。
            boss.recoverTimer = LASER.recover;
            boss.vulnerable = true;
            boss.laserTimer = 0;
        }
        return;
    }

    // 闲置：等下一波。正常节奏下 laserTimer 已为 0，只有进入 P3 的首波
    // 和被打断后的惩罚期才会在这里真正等待。
    boss.laserTimer -= dt;
    if (boss.laserTimer <= 0) beginLaserWave(boss);
}

function beginLaserWave(boss) {
    boss.lasers.length = 0;
    boss.laserPhase = "warn";
    boss.laserPhaseTimer = LASER.warn;
    boss.laserHits = 0;

    // 第一道锁死挡板当前中心，第二道偏移 LASER.gap。
    //
    // 关键是"锁中心"而不是"左右夹住中心"：夹住的话原地不动永远安全，
    // 激光就退化成布景。锁中心则必须移动，而 gap 保证移动一定有目的地——
    // 背离第二道的方向上必然存在安全区（见 LASER.gap 的推导）。
    const py = state.paddle.y;
    const aim = state.paddle.x + state.paddle.width / 2;
    // 第二道朝较近的那面墙偏，把玩家往场地中央赶；否则玩家会被逼进墙角，
    // 那里没有第二次躲避的余地。
    const side = aim < W / 2 ? -1 : 1;
    const lo = LASER.edgePad, hi = W - LASER.edgePad;
    for (let i = 0; i < LASER.beams; i++) {
        const tx = Math.max(lo, Math.min(hi, aim + side * i * LASER.gap));
        boss.lasers.push({
            x0: boss.x, y0: boss.y,
            ang: Math.atan2(py - boss.y, tx - boss.x),
            hit: false, // 每束每波最多判定一次
        });
    }
    spawnFloatingText(boss.x, boss.y - 60, "主炮锁定！", PAL.blood3);
    playBossShoot();
}

// 点到射线的垂距。射线是单向的（t<0 即在 Boss 身后），所以要先夹 t≥0，
// 否则挡板站在 Boss 正上方时会被"背后的光束"判定命中。
function distToBeam(beam, px, py) {
    const dx = Math.cos(beam.ang), dy = Math.sin(beam.ang);
    const t = Math.max(0, (px - beam.x0) * dx + (py - beam.y0) * dy);
    return Math.hypot(beam.x0 + dx * t - px, beam.y0 + dy * t - py);
}

function checkLaserHit(boss) {
    const hr = bossHitRect();
    // 取受击区中心与左右端点三点检测：只测中心会让"半个板在束里"漏判，
    // 而完整的矩形-带状相交在这个精度需求下不值当。
    const cy = hr.y + hr.h / 2;
    const probes = [hr.x, hr.x + hr.w / 2, hr.x + hr.w];
    for (const beam of boss.lasers) {
        if (beam.hit) continue;
        if (probes.some(px => distToBeam(beam, px, cy) <= LASER.halfW)) {
            beam.hit = true;
            onLaserHit(beam);
        }
    }
}

// 命中惩罚与弹幕一致（1 命 + 90 帧无敌），并复用同一条护盾/反弹/格挡判定链——
// 新造一套会让玩家已有的防御类奖励在 P3 突然失效。
function onLaserHit(beam) {
    const pl = state.player;
    const px = state.paddle.x + state.paddle.width / 2;
    const py = state.paddle.y;
    if (pl.shieldTimer > 0) { spawnRing(px, py, PAL.arc3); playWallHit(); return; }
    if (state.aegisTimer > 0) { spawnRing(px, py, PAL.gold3); playWallHit(); return; }
    if (state.invulnTimer > 0) return;
    if (pl.bounceShield > 0 && Math.random() < pl.bounceShield) { spawnRing(px, py, PAL.gold3); playWallHit(); return; }
    if (Math.random() < pl.bossResist) { spawnFloatingText(px, py - 24, "格挡！", PAL.moss3); playWallHit(); return; }
    state.invulnTimer = 90;
    playerHurt();
    screenShake(11, 260);
    playPlayerHit();
    spawnParticles(px, py, PAL.blood3, 14);
    // 蜂巢激光伤害 3 点；终焉主炮 2 点（最终战给强化角色留出容错）
    if (state.boss?.bossType === "hive") loseLife(3);
    else if (state.boss?.bossType === "final") loseLife(2);
    else loseLife(1);
}

// 预警期内每次命中 Boss 削掉一道束；削光则取消本波并进入长易伤。由 damageBoss 调用。
//
// 削哪一道决定了这个机制的手感。试过"削离挡板最近的那道"——实测直接送安全：
// 三球节奏下站着不动都零掉命，因为被削掉的永远正是瞄着自己的那道，
// 而 Boss 战里球本来就在挡板与 Boss 之间往返，这次命中等于白拿。
// 改成从最外侧往里削：锁定挡板中心的那道（索引 0）永远会打出来，玩家仍必须走位；
// 被削掉的是封住退路的侧翼束，安全区因此变宽——奖励真实，但不替玩家把活干完。
function tryInterruptLaser(boss) {
    if (boss.laserPhase !== "warn" || boss.lasers.length === 0) return;
    // 索引 0 是主瞄束，最后一道是最外侧的侧翼束
    if (boss.lasers.length === 1) {
        // 只剩主瞄束：再命中一次才能整波取消，代价与收益都最大
        boss.lasers.length = 0;
        boss.laserPhase = "";
        boss.laserHits = 0;
        boss.laserTimer = LASER.interruptRecover;
        boss.recoverTimer = LASER.interruptRecover;
        boss.vulnerable = true;
        spawnFloatingText(boss.x, boss.y - 50, "主炮过载！", PAL.moss3);
        screenShake(6, 140);
        return;
    }
    const dead = boss.lasers.pop();
    boss.laserHits++;
    spawnParticles(dead.x0 + Math.cos(dead.ang) * 80, dead.y0 + Math.sin(dead.ang) * 80, PAL.arc3, 12);
    spawnFloatingText(boss.x, boss.y - 46, "击毁一门副炮！", PAL.arc3);
    playWallHit();
}

// ─── 技能选择 ─────────────────────────────────────────────
function pickNextAction(boss) {
    const ratio = boss.hp / boss.maxHp;
    if (ratio < 0.5 && boss.phase === 0) {
        boss.phase = 1;
        spawnFloatingText(boss.x, boss.y - 60, "第二阶段！", boss.color);
    }
    // 轮换技能，避免连续重复
    let available = boss.skills.filter(s => s !== boss._lastSkill);
    if (available.length === 0) available = [...boss.skills];
    let skill;
    // 诅咒司祭：祭坛技能权重提高（1.25 倍频率）
    if (boss.bossType === "priest" && available.includes("altar") && Math.random() < 0.6) {
        skill = "altar";
    } else {
        skill = available[Math.floor(Math.random() * available.length)];
    }
    boss._lastSkill = skill;
    boss.action = { type: skill, phase: "warn", timer: 0 };
    boss.chargeProgress = 0;
    boss.interrupted = false;
}

// ─── 技能执行 ─────────────────────────────────────────────
function executeAction(boss, dt) {
    const a = boss.action;
    if (!a) return;
    a.timer += dt;

    switch (a.type) {
        case "charge": executeCharge(boss, a, dt); break;
        case "slam": executeSlam(boss, a, dt); break;
        case "summon": executeSummon(boss, a, dt); break;
        case "ultimate": executeUltimate(boss, a, dt); break;
        case "altar": executeAltar(boss, a, dt); break;
        default: startRecovery(boss, 30); break;
    }
}

// ─── 冲锋 ─────────────────────────────────────────────────
function executeCharge(boss, a, dt) {
    if (a.phase === "warn") {
        // 预警：锁定玩家，显示路径
        boss.chargeTarget = { x: state.paddle.x + state.paddle.width / 2, y: state.paddle.y };
        if (a.timer > 30) {
            a.phase = "active";
            a.timer = 0;
            boss.chargeSpeed = 13 + tierWeight(boss.tier) * 1.0;
            playBossShoot();
        }
    } else if (a.phase === "active") {
        // 冲锋
        const dx = boss.chargeTarget.x - boss.x;
        const dy = boss.chargeTarget.y - boss.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 10) {
            const spd = boss.chargeSpeed * dt;
            boss.x += (dx / dist) * spd;
            boss.y += (dy / dist) * spd;
            // 撞墙检测
            if (boss.x < boss.r || boss.x > W - boss.r || boss.y < 60 || boss.y > H - 60) {
                // 撞墙眩晕
                onChargeWallHit(boss);
                startRecovery(boss, 90 + boss.tier * 15);
                return;
            }
            // 撞到挡板
            const hr = bossHitRect();
            if (boss.x + boss.r >= hr.x && boss.x - boss.r <= hr.x + hr.w &&
                boss.y + boss.r >= hr.y && boss.y + boss.r <= hr.y + hr.h + 20) {
                onDashHit();
                startRecovery(boss, 30);
                return;
            }
        } else {
            startRecovery(boss, 30);
        }
    }
}

function onChargeWallHit(boss) {
    screenShake(12, 200);
    spawnParticles(boss.x, boss.y, PAL.bone1, 20);
    spawnFloatingText(boss.x, boss.y - 30, "撞墙眩晕！全力输出", PAL.gold3);
    playWallHit();
}

function startRecovery(boss, frames) {
    boss.recoverTimer = frames;
    boss.vulnerable = true;
    boss.action = null;
    boss.actionCooldown = 0;
    spawnFloatingText(boss.x, boss.y - 50, "易伤！伤害 ×1.5", PAL.gold3);
}

// ─── 跳砸 ─────────────────────────────────────────────────
function executeSlam(boss, a, dt) {
    if (a.phase === "warn") {
        // 预警：显示落点
        boss.slamTarget = {
            x: Math.max(60, Math.min(W - 60, state.paddle.x + state.paddle.width / 2 + (Math.random() - 0.5) * 60)),
            y: Math.max(100, Math.min(H - 100, state.paddle.y + (Math.random() - 0.5) * 40)),
        };
        if (a.timer > 30) {
            a.phase = "active";
            a.timer = 0;
            boss.x = boss.slamTarget.x;
            boss.y = 30;
            playBossShoot();
        }
    } else if (a.phase === "active") {
        // 下落
        boss.y += 12 * dt;
        if (boss.y >= boss.slamTarget.y) {
            boss.y = boss.slamTarget.y;
            // 落地冲击
            screenShake(14, 300);
            spawnParticles(boss.x, boss.y, boss.color, 40);
            spawnRing(boss.x, boss.y, `rgba(255,${120 + boss.tier * 30},80,0.8)`);
            playBossHit();
            // 冲击波
            const waveSpeed = 4 + tierWeight(boss.tier) * 0.4;
            state.bossDangerZones.push({ x: boss.x, y: boss.y, r: 0, maxR: 180 + boss.tier * 20, life: 60, type: "shockwave", speed: waveSpeed });
            // 危险区：tier 0 不生成，tier 1 在落点生成较大红圈（持续2秒），tier 2+ 在落点生成标准红圈
            if (boss.tier >= 1) {
                const r = boss.tier === 1 ? 67 : 50 + boss.tier * 15;
                state.bossDangerZones.push({
                    x: boss.x, y: boss.y, r, life: boss.tier === 1 ? 120 : 240, type: "hazard", color: boss.color,
                });
                spawnFloatingText(boss.x, boss.y - 80, "危险区域！远离", PAL.blood3);
            }
            // 挡板在冲击波范围内则扣血
            const p = state.paddle;
            if (Math.hypot(p.x + p.width / 2 - boss.x, p.y - boss.y) < 180) {
                onSlamHit();
            }
            startRecovery(boss, 50 + boss.tier * 10);
        }
    }
}

function onSlamHit() {
    const pl = state.player;
    if (pl.shieldTimer > 0) { playWallHit(); return; }
    if (state.invulnTimer > 0) return;
    if (pl.bounceShield > 0 && Math.random() < pl.bounceShield) { playWallHit(); return; }
    state.invulnTimer = 100;
    playerHurt();
    screenShake(10, 200);
    playPlayerHit();
    loseLife(1);
}

// ─── 召唤 ─────────────────────────────────────────────────
function executeSummon(boss, a, dt) {
    if (a.phase === "warn") {
        if (a.timer > 20) {
            a.phase = "active";
            a.timer = 0;
        }
    } else if (a.phase === "active") {
        if (a.timer < 8) {
            spawnMinionForType(boss);
            playBossShoot();
        }
        if (a.timer > 10) {
            startRecovery(boss, 30);
        }
    }
}

// 召唤物类型池
// 母体（tier 1）：healer=治疗花 / poison=腐化花 / vine=藤蔓
const MOTHER_MINIONS = [
    ["healer", 1], ["poison", 1.5], ["poison", 1.5], ["vine", 1.2],
];
// 蜂巢（tier 2）：turret=弹幕无人机 / shield=护盾无人机 / bomber=自爆无人机（无回血）
const HIVE_MINIONS = [
    ["turret", 1.5], ["turret", 1.5], ["shield", 1.2], ["bomber", 1.2],
];

function spawnMinionForType(boss) {
    // 根据层级减少召唤频率：tier 1-2 有概率跳过
    if (boss.tier >= 1 && Math.random() < 0.4) return;
    const angle = Math.random() * Math.PI * 2;
    const dist = 120 + Math.random() * 60;
    const mx = Math.max(40, Math.min(W - 40, boss.x + Math.cos(angle) * dist));
    const my = Math.max(80, Math.min(H - 60, boss.y + Math.sin(angle) * dist));
    let kinds;
    if (boss.bossType === "mother") {
        kinds = MOTHER_MINIONS;
    } else if (boss.bossType === "hive") {
        kinds = HIVE_MINIONS;
    } else {
        kinds = MOTHER_MINIONS;
    }
    const totalW = kinds.reduce((s, k) => s + k[1], 0);
    let roll = Math.random() * totalW;
    let picked = kinds[0][0];
    for (const [kind, w] of kinds) {
        roll -= w;
        if (roll <= 0) { picked = kind; break; }
    }
    const colors = { healer: PAL.moss3, poison: PAL.vio3, vine: PAL.arc2, turret: PAL.ember2, shield: PAL.gold3, bomber: PAL.ember2 };
    const bossId = state.boss;
    // 血量沿 tierWeight 放缓增长。hp 与 maxHp 必须取同一个值——
    // 原来是 hp=20+t*10 / maxHp=15+t*8，hp 恒大于 maxHp，血条比例始终 >100%。
    const minionHp = Math.round((18 + tierWeight(boss.tier) * 8) / 2);
    boss.minions.push({
        x: mx, y: my, r: 14, hp: minionHp,
        maxHp: minionHp, type: picked,
        healTimer: picked === "healer" ? 180 : 0,
        poisonTimer: picked === "poison" ? 120 : 0,
        shootTimer: picked === "turret" ? 60 : 0,
        seekTimer: picked === "bomber" ? 90 : 0,
        flash: 0, angle: 0, color: colors[picked] || PAL.bone1,
    });
    spawnFloatingText(mx, my - 20, `召唤：${picked}`, colors[picked]);
}

function updateMinions(boss, dt) {
    for (let i = boss.minions.length - 1; i >= 0; i--) {
        const m = boss.minions[i];
        m.flash = Math.max(0, m.flash - 0.08 * dt);

        // 蜂巢召唤物触底即消。判定取"上沿越过底墙"（m.y - m.r > floor）而非"下沿触碰"：
        // 自爆无人机的目标就是挡板平面，下沿碰底墙的那一刻恰好是它该引爆的一刻，
        // 用下沿判定会在引爆前一帧把它删掉，等于废掉这一型召唤物。
        // 这里不走 m.hp<=0 分支，因此不触发"召唤物死亡反噬"的 -10 HP——
        // 它是自己飞出去的，不是玩家打掉的。
        if (boss.bossType === "hive" && m.y - m.r > hiveFloorY()) {
            spawnParticles(m.x, hiveFloorY(), m.color || PAL.moss3, 8);
            boss.minions.splice(i, 1);
            continue;
        }

        if (m.type === "healer") {
            m.healTimer -= dt;
            if (m.healTimer <= 0) {
                m.healTimer = 180;
                const healAmount = 2 + boss.tier;
                boss.hp = Math.min(boss.maxHp, boss.hp + healAmount);
                spawnFloatingText(m.x, m.y - 16, `治疗 +${healAmount}`, PAL.moss3);
            }
        }
        // 腐化花：定期生成毒区
        if (m.type === "poison") {
            m.poisonTimer -= dt;
            if (m.poisonTimer <= 0) {
m.poisonTimer = 120;
        const r = 40;
        state.bossDangerZones.push({ x: boss.x + (m.x - boss.x) * 0.25, y: m.y + 20, r, life: 180, type: "hazard", color: PAL.vio2, _poison: true });
        spawnFloatingText(m.x, m.y - 20, "毒雾扩散！伤害 -25%", PAL.vio3);
            }
        }
        // 藤蔓：束缚挡板（短暂移速降低）
        if (m.type === "vine" && Math.hypot(state.paddle.x - m.x, state.paddle.y - m.y) < 80) {
            state.player.curseMoveResist = (state.player.curseMoveResist || 0) + 0.3;
        }
        // 自爆无人机：追向挡板
        if (m.type === "bomber") {
            m.seekTimer -= dt;
            const dx = state.paddle.x + state.paddle.width / 2 - m.x;
            const dy = state.paddle.y - m.y;
            const len = Math.hypot(dx, dy) || 1;
            // 速度按"必须够得着挡板"反解：最坏情况纵向 560-80=480px，
            // 在 70% 寿命内走完 → 480/(0.7×420)=1.63，取 1.2 留出被击杀的窗口。
            // 母体的藤蔓型沿用原来的 0.6，不受影响。
            const spd = m.speed || 0.6;
            m.x += (dx / len) * spd * dt;
            m.y += (dy / len) * spd * dt;
            if (m.seekTimer <= 0 || len < 20) {
                state.boss.minions.splice(i, 1);
                if (len < 80) {
                    state.invulnTimer = 100;
                    loseLife(1);
                    screenShake(10, 200);
                    spawnFloatingText(m.x, m.y, "爆炸！", PAL.ember3);
                }
                continue;
            }
        }
        // 护盾无人机：不攻击，靠拢 Boss 提供减伤（减伤逻辑在 damageBoss）。
        // 让它贴着 Boss 而不是原地漂，是为了把"先拆盾还是先打本体"这个选择
        // 摆到同一片区域里——否则玩家可以两边分开处理，取舍就消失了。
        if (m.type === "shield") {
            m.angle += 0.02 * dt;
            const ox = boss.x + Math.cos(m.angle) * (boss.r + 34);
            const oy = boss.y + Math.sin(m.angle) * (boss.r + 34);
            m.x += (ox - m.x) * 0.04 * dt;
            m.y += (oy - m.y) * 0.04 * dt;
        }
        // 弹幕无人机：定期发射单发子弹
        if (m.type === "turret") {
            m.shootTimer -= dt;
            if (m.shootTimer <= 0) {
                // 蜂巢的炮台数量已定额（每型 1 只），射速再随机就无法做密度预算，
                // 故取固定 100 帧（0.60 发/秒）。其他 Boss 保留原来的随机区间。
                m.shootTimer = m.fireInterval || (60 + Math.random() * 30);
                const px = state.paddle.x + state.paddle.width / 2;
                const py = state.paddle.y;
                const ang = Math.atan2(py - m.y, px - m.x);
                const spd = 2.0 + tierWeight(boss.tier) * 0.16;
                state.bossBullets.push({
                    x: m.x, y: m.y,
                    vx: Math.cos(ang) * spd,
                    vy: Math.sin(ang) * spd,
                    r: 6, age: 0, homing: false, splitAt: 0, wave: null,
                });
                playBossShoot();
            }
        }
        // 受击（由 physics.js 处理碰撞）
        if (m.hp <= 0) {
            spawnParticles(m.x, m.y, m.color || PAL.moss3, 12);
            boss.minions.splice(i, 1);
            // 召唤物死亡削弱 Boss
            boss.hp -= 10;
            boss.flash = 1;
            spawnFloatingText(boss.x, boss.y - 40, "召唤物死亡反噬！", PAL.blood2);
        }
    }
}

// ─── 祭坛（诅咒司祭专属）──────────────────────────────────
function executeAltar(boss, a, dt) {
    if (a.phase === "warn") {
        // 预警 16 帧（1.25 倍频率）
        if (a.timer > 16) {
            a.phase = "active";
            a.timer = 0;
        }
    } else if (a.phase === "active") {
        if (a.timer < 8) {
            // 生成 1-5 个祭坛（普通三型共用一个上限）
            const count = 1 + Math.floor(Math.random() * 5);
            for (let n = 0; n < count; n++) {
                if (boss.altars.filter(x => !x.chasing).length < 4) {
                    spawnStaticAltar(boss);
                }
            }
            // 释放 1-4 个攻击祭坛（独立计数，上限 6）
            const chaseCount = 1 + Math.floor(Math.random() * 4);
            for (let n = 0; n < chaseCount; n++) {
                if (boss.altars.filter(x => x.chasing).length < 6) {
                    spawnChaseAltar(boss);
                }
            }
            playBossShoot();
        }
        if (a.timer > 10) {
            startRecovery(boss, 30);
        }
    }
}

// 普通静态祭坛
function spawnStaticAltar(boss) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 150 + Math.random() * 100;
    const ax = Math.max(50, Math.min(W - 50, boss.x + Math.cos(angle) * dist));
    const ay = Math.max(100, Math.min(H - 80, boss.y + Math.sin(angle) * dist));
    const kinds = ["dmg", "speed", "cd"];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    // 原来对象字面量里 hp 出现两次（15+t*8 与 12+t*6），后者覆盖前者才恰好
    // 等于 maxHp。这里合并为单一变量，去掉这个容易误读的重复键。
    const altarHp = Math.round(12 + tierWeight(boss.tier) * 5);
    boss.altars.push({
        x: ax, y: ay, r: 20, hp: altarHp,
        maxHp: altarHp, type: kind, flash: 0, chasing: false,
    });
    spawnFloatingText(ax, ay - 20, "诅咒祭坛出现！", PAL.vio2);
}

// 追踪祭坛：半场生成，缓慢移向玩家
// 攻击祭坛：直线向下移动，触碰挡板扣 1.5 命并消失
// 出现在 1/3 ～ 3/5 屏幕宽度，距玩家越近概率越低
function spawnChaseAltar(boss) {
    const px = state.paddle.x + state.paddle.width / 2;
    const minX = Math.round(W * 1 / 3);
    const maxX = Math.round(W * 3 / 5);
    // 加权随机：权重 = 1 / (距离 + 100)，距离越大概率越低
    const samples = 10;
    let bestX = minX, bestWeight = 0;
    for (let i = 0; i < samples; i++) {
        const cx = minX + Math.random() * (maxX - minX);
        const dist = Math.abs(cx - px);
        const w = 1 / (dist + 100);
        if (w > bestWeight || i === 0) {
            bestWeight = w;
            bestX = cx;
        }
    }
    const ax = Math.round(bestX / 2) * 2; // 对齐到偶数像素
    const ay = -20 - Math.random() * 30; // 从画面上方外进入
    const chaseHp = Math.round(10 + tierWeight(boss.tier) * 4);
    boss.altars.push({
        x: ax, y: ay, r: 16, hp: chaseHp,
        maxHp: chaseHp, flash: 0, chasing: true,
    });
    spawnFloatingText(ax, ay + 20, "攻击祭坛！", PAL.ember2);
}

// 祭坛持续的诅咒效果（每帧应用）
function altarCurseEffects() {
    const boss = state.boss;
    const p = state.player;
    if (!boss || !boss.altars) {
        if (p.altarDmgP !== 0 || p.altarSpeedP !== 1 || p.altarCdP !== 1) {
            p.altarDmgP = 0;
            p.altarSpeedP = 1;
            p.altarCdP = 1;
        }
        return;
    }
    // 攻击祭坛：直线向下移动，触碰挡板扣血并消失
    const dt = state.dt;
    for (let i = boss.altars.length - 1; i >= 0; i--) {
        const al = boss.altars[i];
        if (!al.chasing) continue;
        // 向下移动（速度 0.8 px/帧，约 48 px/s）
        al.y += 0.8 * dt;
        // 碰到底部或超出画面 → 消失
        if (al.y > H + 30 || al.y < -60) {
            boss.altars.splice(i, 1);
            continue;
        }
        // 碰撞挡板检测
        const hr = bossHitRect();
        if (al.x + al.r >= hr.x && al.x - al.r <= hr.x + hr.w &&
            al.y + al.r >= hr.y && al.y - al.r <= hr.y + hr.h) {
            boss.altars.splice(i, 1);
            // 扣除 1.5 命
            const pl = state.player;
            if (!pl.shieldTimer && !state.invulnTimer) {
                state.invulnTimer = 60;
                playerHurt();
                screenShake(8, 150);
                playPlayerHit();
                state.player.lives -= 1.5;
                if (state.player.lives <= 0) {
                    state.gameState = STATE.GAME_OVER;
                    playGameOver();
                }
            }
            spawnParticles(al.x, al.y, PAL.ember2, 12);
            continue;
        }
    }
    const hasDmg = boss.altars.some(x => x.type === "dmg");
    const hasSpeed = boss.altars.some(x => x.type === "speed");
    const hasCd = boss.altars.some(x => x.type === "cd");
    // dmg：玩家伤害 -1
    p.altarDmgP = hasDmg ? 1 : 0;
    // speed：球速 +10%
    p.altarSpeedP = hasSpeed ? 1.1 : 1;
    // cd：玩家技能CD +50%
    p.altarCdP = hasCd ? 1.5 : 1;
}

// ─── 净化方块：摧毁全场召唤物与祭坛 ─────────────────────────
// 返回被净化数量，由 physics.js 换算成对 Boss 的伤害（每单位 3 点）。
// 摧毁祭坛后必须重跑 altarCurseEffects，立即解除残留在玩家身上的诅咒。
export function purgeBossSummons() {
    const boss = state.boss;
    if (!boss) return 0;
    let n = 0;
    for (const m of boss.minions) {
        spawnParticles(m.x, m.y, m.color || PAL.moss3, 10);
        spawnRing(m.x, m.y, PAL.moss3);
        n++;
    }
    boss.minions.length = 0;
    boss.minionRespawn = {};
    if (boss.altars) {
        for (const al of boss.altars) {
            spawnParticles(al.x, al.y, PAL.vio2, 12);
            spawnRing(al.x, al.y, PAL.vio3);
            n++;
        }
        boss.altars.length = 0;
    }
    altarCurseEffects();
    return n;
}

// ─── 同化方块产的友军弹 ────────────────────────────────────
// 敌弹被反转后不停飞向挡板，而是追踪 Boss。每帧最多结算一次合并伤害，
// 防止几十发同时命中时把 hitCooldown 之外的额外伤害整帧吞光。
function updateFriendlyBullets(dt) {
    const bu = state.friendlyBullets;
    if (bu.length === 0) return;
    const boss = state.boss;
    if (!boss) { bu.length = 0; return; }
    let hits = 0;
    for (let i = bu.length - 1; i >= 0; i--) {
        const f = bu[i];
        f.life -= dt;
        if (f.life <= 0 || f.x < -30 || f.x > W + 30 || f.y < -30 || f.y > H + 30) {
            bu.splice(i, 1);
            continue;
        }
        const dx = boss.x - f.x;
        const dy = boss.y - f.y;
        const dist = Math.hypot(dx, dy) || 1;
        const spd = Math.hypot(f.vx, f.vy) || 4;
        const cur = Math.atan2(f.vy, f.vx);
        const want = Math.atan2(dy, dx);
        let diff = want - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const na = cur + Math.max(-0.05 * dt, Math.min(0.05 * dt, diff));
        f.vx = Math.cos(na) * spd;
        f.vy = Math.sin(na) * spd;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (dist < boss.r + f.r) {
            spawnParticles(f.x, f.y, PAL.vio3, 4);
            hits++;
            bu.splice(i, 1);
        }
    }
    if (hits > 0) {
        // 友军弹是玩家收益：压短受击冷却，让这一帧的合并伤害能打出去
        boss.hitCooldown = Math.min(boss.hitCooldown, 1);
        damageBoss(Math.min(hits, 5));
    }
}

// 画在敌弹之上：金色脉动环是"友军"的通用语言，与敌弹的暗轮廓区分
export function drawFriendlyBullets() {
    for (const f of state.friendlyBullets) {
        const r = Math.max(12, f.r * 2);
        pBlob(f.x, f.y, r + PX, PAL.ink0, "circle");
        pBlob(f.x, f.y, r, PAL.vio1, "circle");
        pBlob(f.x, f.y, r - PX, PAL.vio3, "circle");
        pRectRaw(f.x - PX / 2, f.y - PX / 2, PX, PX, PAL.bone1);
        const on = Math.floor(f.life / 5) % 2 === 0;
        pRing(f.x, f.y, r + PX * 2, on ? PAL.gold3 : PAL.gold2, 1);
    }
}

// ─── 可打断蓄力大招 ───────────────────────────────────────
function executeUltimate(boss, a, dt) {
    if (a.phase === "warn") {
        // 蓄力阶段
        boss.chargeProgress = Math.min(100, boss.chargeProgress + 1.2 * dt);
        // 暴露弱点（boss 中心闪烁）
        if (boss.chargeProgress >= 100) {
            if (!boss.interrupted) {
                // 大招释放：多波高强度弹幕
                a.phase = "active";
                a.timer = 0;
                a._waves = 0;
                spawnFloatingText(boss.x, boss.y - 50, "蓄力完成！大招释放！", PAL.blood2);
            }
        }
    } else if (a.phase === "active") {
        // 每 15 帧发射一波
        a._waves = a._waves || 0;
        if (a.timer > a._waves * 15) {
            const count = 8 + Math.round(tierWeight(boss.tier) * 2.4);
            const speed = 3.0 + tierWeight(boss.tier) * 0.25;
            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 * i) / count + a._waves * 0.3;
                state.bossBullets.push({
                    x: boss.x, y: boss.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    r: 7, age: 0, homing: false, splitAt: 0, wave: null,
                });
            }
            playBossShoot();
            a._waves++;
            // 3 波后结束
            if (a._waves >= 3) {
                startRecovery(boss, 50);
            }
        }
        if (a.timer > 60) {
            startRecovery(boss, 50);
        }
    }
}

// 打断蓄力（由 physics.js 碰撞检测调用）
export function interruptBossUltimate() {
    const boss = state.boss;
    if (!boss || !boss.action || boss.action.type !== "ultimate" || boss.action.phase !== "warn") return;
    boss.interrupted = true;
    boss.chargeProgress = 0;
    spawnFloatingText(boss.x, boss.y - 50, "大招被打断！", PAL.moss3);
    screenShake(6, 100);
    startRecovery(boss, 120); // 更长易伤
}

// ─── 弹幕（辅助技能，闲时发射） ────────────────────────────
function fireVolley(boss, dt) {
    boss.volleyTimer -= dt;
    if (boss.volleyTimer <= 0) {
        boss.volleyTimer = 90 + Math.random() * 60;
        // 第三层 Boss 降低弹幕频率
        if (boss.tier === 2) boss.volleyTimer *= 1.4;
        const pattern = boss.patterns[boss.volleyIdx % boss.patterns.length];
        boss.volleyIdx++;
        fireVolleySingle(boss, pattern);
    }
}

function fireVolleySingle(boss, pattern) {
    // 普通 Boss 二阶段 +10% 弹速；终焉四阶段每阶 +10%，压迫感沿阶段爬升
    const phasePush = boss.bossType === "final" ? Math.min(3, boss.phase) : boss.phase;
    const spd = boss.bulletSpeed * (1 + phasePush * 0.1);
    switch (pattern) {
        case "fan": aimedFan(boss, spd, 3 + Math.round(tierWeight(boss.tier) * 0.8)); break;
        case "ring": ringBurst(boss, spd * 0.85, 6 + Math.round(tierWeight(boss.tier) * 1.6)); break;
        case "split": aimedFan(boss, spd, 3, { splitAt: 46 }); break;
        case "wave": aimedFan(boss, spd, 4, { wave: true }); break;
        case "homing": boss.homingQueue = 2; boss.homingTick = 8; break;
        case "spiral": boss.spiralFrames = 36; boss.spiralAngle = Math.random() * Math.PI * 2; break;
        default: aimedFan(boss, spd, 3); break;
    }
    playBossShoot();
}

function fireBullet(boss, dx, dy, speed, r, opt = {}) {
    const len = Math.hypot(dx, dy) || 1;
    state.bossBullets.push({
        x: boss.x + (dx / len) * 10, y: boss.y + (dy / len) * 10,
        vx: (dx / len) * speed, vy: (dy / len) * speed, r, age: 0,
        homing: !!opt.homing, splitAt: opt.splitAt || 0,
        wave: opt.wave ? { phase: Math.random() * Math.PI * 2, amp: 26, freq: 0.06, bx: boss.x, by: boss.y, dirX: dx / len, dirY: dy / len } : null,
    });
}

function aimedFan(boss, speed, count, opt = {}) {
    const px = state.paddle.x + state.paddle.width / 2;
    const py = state.paddle.y;
    const base = Math.atan2(py - boss.y, px - boss.x);
    for (let i = 0; i < count; i++) {
        const spread = (i - (count - 1) / 2) * 0.13;
        const a = base + spread;
        fireBullet(boss, Math.cos(a), Math.sin(a), speed, 6, opt);
    }
}

function ringBurst(boss, speed, count) {
    const offset = Math.random() * Math.PI;
    for (let i = 0; i < count; i++) {
        const a = offset + (Math.PI * 2 * i) / count;
        fireBullet(boss, Math.cos(a), Math.sin(a), speed, 5);
    }
}

// ─── 伤害与死亡 ───────────────────────────────────────────
export function damageBoss(dmg, silent = false) {
    const boss = state.boss;
    if (!boss) return;
    // 受击冷却：冲锋等持续接触技能期间防止连续多段伤害
    if (boss.hitCooldown > 0) return;
    boss.hitCooldown = 25; // 约 0.4 秒
    let finalDmg = dmg;
    // 易伤阶段额外伤害
    if (boss.vulnerable) finalDmg = Math.round(finalDmg * 1.5);
    // 蜂巢：护盾无人机存活时 Boss 减伤
    if (boss.minions && boss.minions.some(m => m.type === "shield")) {
        finalDmg = Math.round(finalDmg * 0.5);
    }
    boss.hp -= finalDmg;
    boss.flash = 1;
    if (!silent) {
        playBossHit();
        addScore(10);
        spawnFloatingText(boss.x, boss.y - boss.r - 14, `-${finalDmg}`, boss.vulnerable ? PAL.gold3 : PAL.ember3);
    }
    // 蓄力时受伤可打断
    if (boss.action && boss.action.type === "ultimate" && boss.action.phase === "warn") {
        if (Math.random() < 0.3) interruptBossUltimate();
    }
    // 蜂巢 P3、终焉三阶：预警期打够次数可打断本波激光（确定性，非概率——
    // 玩家要为此主动把球送上去，不该再赌一次骰子）
    if ((boss.bossType === "hive" && boss.phase === 2) ||
        (boss.bossType === "final" && boss.phase === 2)) tryInterruptLaser(boss);
    if (boss.hp <= 0) defeatBoss();
}

function defeatBoss() {
    const boss = state.boss;
    spawnParticles(boss.x, boss.y, boss.color, 80);
    spawnParticles(boss.x, boss.y, PAL.bone1, 40);
    for (let i = 0; i < 3; i++) spawnRing(boss.x, boss.y, PAL.gold3);
    screenShake(14, 400);
    state.boss = null; state.bossBullets = []; state.enemyBullets = []; state.bossDangerZones = [];
    state.friendlyBullets = []; state.aegisTimer = 0; state.frenzyTimer = 0;
    playBossDeath();
    if (state.player.level >= 50) { state.player.score += 1000; state.gameState = STATE.VICTORY; playVictory(); }
    else state.gameState = STATE.BOSS_CLEAR;
}

// ─── 子弹更新 ─────────────────────────────────────────────
function updateBossBullets() {
    // 冰冻方块：全场敌弹冻结。跳过弹的全部更新（不移动、不追踪、不分裂、
    // 不命中挡板），冰冻期间弹仍可被球击毁。
    if (state.bulletFreezeTimer > 0) return;
    const dt = state.dt;
    const bullets = state.bossBullets;
    if (bullets.length > 150) bullets.splice(0, bullets.length - 150);
    const px = state.paddle.x + state.paddle.width / 2;
    const py = state.paddle.y;
    const isHive = state.boss && state.boss.bossType === "hive";
    const floorY = hiveFloorY();

    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.age += dt;

        if (b.homing) {
            const cur = Math.atan2(b.vy, b.vx);
            const want = Math.atan2(py - b.y, px - b.x);
            let diff = want - cur;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            const na = cur + Math.max(-0.016 * dt, Math.min(0.016 * dt, diff));
            const spd = Math.hypot(b.vx, b.vy);
            // 保留最小纵向分量，防止子弹完全水平追踪无法消失
            const vySign = Math.sign(b.vy) || 1;
            const minVy = Math.min(spd * 0.18, Math.abs(b.vy) || 1);
            b.vx = Math.cos(na) * spd;
            b.vy = Math.sin(na) * spd;
            if (Math.abs(b.vy) < minVy) b.vy = vySign * minVy;
        }

        if (b.splitAt && b.age >= b.splitAt) {
            const spd = Math.hypot(b.vx, b.vy);
            const a = Math.atan2(b.vy, b.vx);
            for (const da of [-0.42, 0.42]) {
                bullets.push({ x: b.x, y: b.y, vx: Math.cos(a + da) * spd, vy: Math.sin(a + da) * spd, r: 5, age: 0, homing: false, splitAt: 0, wave: null });
            }
            bullets.splice(i, 1); continue;
        }

        if (b.wave) {
            b.wave.bx += b.vx * dt;
            b.wave.by += b.vy * dt;
            const perpX = -b.wave.dirY;
            const perpY = b.wave.dirX;
            const off = Math.sin(b.age * b.wave.freq + b.wave.phase) * b.wave.amp;
            b.x = b.wave.bx + perpX * off;
            b.y = b.wave.by + perpY * off;
        } else {
            b.x += b.vx * dt;
            b.y += b.vy * dt;
        }

        if (b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) { bullets.splice(i, 1); continue; }

        // 追踪弹接近挡板时消失，避免水平无限追踪
        if (b.homing && b.y > py - 15) { bullets.splice(i, 1); continue; }

        // 蜂巢：触底即消。判定用弹丸上沿（y - r）越过底墙，
        // 因此剔除时该弹已不可能满足下面的命中条件，不会吞掉一次本该生效的判定。
        if (isHive && b.y - b.r > floorY) {
            bullets.splice(i, 1);
            spawnParticles(b.x, floorY, bulletColor(b), 5);
            continue;
        }

        const p = state.paddle;
        const hr = bossHitRect();
        if (b.x + b.r >= hr.x && b.x - b.r <= hr.x + hr.w && b.y + b.r >= hr.y && b.y - b.r <= hr.y + hr.h) {
            bullets.splice(i, 1);
            onPaddleHit(b);
            spawnParticles(b.x, b.y, bulletColor(b), 8);
        }
    }
}

// ─── 危险区更新 ───────────────────────────────────────────
function updateDangerZones() {
    const dt = state.dt;
    const zones = state.bossDangerZones;
    for (let i = zones.length - 1; i >= 0; i--) {
        const z = zones[i];
        z.life -= dt;
        if (z.type === "shockwave" && z.r < z.maxR) z.r += z.speed * dt;
        if (z.life <= 0) { zones.splice(i, 1); continue; }
        // 挡板在危险区中扣血（仅对 hazard 类型）
        if (z.type === "hazard") {
            const p = state.paddle;
            if (Math.hypot(p.x + p.width / 2 - z.x, p.y - z.y) < z.r) {
                // 每帧检查，但加冷却防止秒杀
                z._dmgTick = (z._dmgTick || 0) - dt;
                if (z._dmgTick <= 0) {
                    z._dmgTick = 30;
                    const pl = state.player;
                    if (!pl.shieldTimer && !state.invulnTimer) {
                        state.invulnTimer = 60;
                        playerHurt();
                        playPlayerHit();
                        loseLife(1);
                    }
                }
            }
        }
    }
}

// ─── 受击处理 ─────────────────────────────────────────────
function onPaddleHit(bullet) {
    const pl = state.player;
    if (pl.shieldTimer > 0) { spawnRing(bullet.x, bullet.y, PAL.arc3); playWallHit(); return; }
    if (state.aegisTimer > 0) { spawnRing(bullet.x, bullet.y, PAL.gold3); playWallHit(); return; }
    if (state.invulnTimer > 0) return;
    if (pl.bounceShield > 0 && Math.random() < pl.bounceShield) { spawnRing(bullet.x, bullet.y, PAL.gold3); playWallHit(); return; }
    if (Math.random() < pl.bossResist) { spawnFloatingText(state.paddle.x + state.paddle.width / 2, state.paddle.y - 24, "格挡！", PAL.moss3); playWallHit(); return; }
    const extraDmg = pl.curseBulletExtraDmg || 0;
    if (pl.thorns > 0 && state.boss) damageBoss(pl.thorns, true);
    state.invulnTimer = 100;
    playerHurt();
    screenShake(9, 220);
    playPlayerHit();
    loseLife(1 + extraDmg);
}

function onDashHit() {
    const pl = state.player;
    if (pl.shieldTimer > 0) { spawnRing(state.paddle.x, state.paddle.y, PAL.arc3); playWallHit(); return; }
    if (state.invulnTimer > 0) return;
    if (pl.bounceShield > 0 && Math.random() < pl.bounceShield) { spawnRing(state.paddle.x, state.paddle.y, PAL.gold3); playWallHit(); return; }
    if (Math.random() < pl.bossResist) { spawnFloatingText(state.paddle.x + state.paddle.width / 2, state.paddle.y - 24, "格挡！", PAL.moss3); playWallHit(); return; }
    state.invulnTimer = 100;
    playerHurt();
    screenShake(12, 220);
    playPlayerHit();
    loseLife(1);
}

// ─── 绘制 ─────────────────────────────────────────────────
export function drawBoss() {
    const boss = state.boss;
    if (!boss) return;
    ctx.save();
    ctx.translate(boss.x, boss.y);

    // 冲锋预警：像素虚线（等距方块），闪烁用离散帧
    if (boss.action?.type === "charge" && boss.action.phase === "warn" && boss.chargeTarget) {
        const dx = boss.chargeTarget.x - boss.x;
        const dy = boss.chargeTarget.y - boss.y;
        const dist = Math.hypot(dx, dy);
        const steps = Math.floor(dist / (PX * 4));
        const on = Math.floor(boss.t / 5) % 2 === 0;
        for (let i = 1; i <= steps; i++) {
            if (i % 2 === (on ? 0 : 1)) continue;
            const px = Math.round((dx * (i / steps)) / PX) * PX;
            const py = Math.round((dy * (i / steps)) / PX) * PX;
            pRectRaw(px - PX, py - PX, PX * 2, PX * 2, PAL.blood2);
        }
    }

    // 跳砸落点：像素同心环 + 网点填充
    if (boss.action?.type === "slam" && boss.action.phase === "warn" && boss.slamTarget) {
        const sx = boss.slamTarget.x - boss.x;
        const sy = boss.slamTarget.y - boss.y;
        const pulse = Math.floor(boss.t / 8) % 2 === 0 ? 0 : PX;
        pRing(sx, sy, 30 + pulse, PAL.blood2, 1);
        pRing(sx, sy, 20 + pulse, PAL.blood1, 1);
        pRectRaw(sx - PX, sy - PX * 4, PX * 2, PX * 8, PAL.blood1);
        pRectRaw(sx - PX * 4, sy - PX, PX * 8, PX * 2, PAL.blood1);
    }

    // 蓄力进度：环形改为顶部像素条 + 百分比
    if (boss.action?.type === "ultimate" && boss.action.phase === "warn") {
        const bw = boss.r * 2;
        pBar(-bw / 2, -boss.r - PX * 8, bw, PX * 3, boss.chargeProgress / 100, PAL.gold2, {
            bg: PAL.ink0, light: PAL.gold3,
        });
        pText(`${Math.round(boss.chargeProgress)}%`, 0, -boss.r - PX * 10, PAL.gold3, {
            size: 12, bold: true, align: "center",
        });
    }

    // 召唤物：像素圆 + 类型点阵图标 + 顶部血条
    const MINION_ICONS = { healer: "flower", poison: "potion", vine: "vine", turret: "target", shield: "shield", bomber: "bomb" };
    for (const m of boss.minions) {
        const mx = m.x - boss.x;
        const my = m.y - boss.y;
        const mc = m.color || PAL.moss3;
        pCircleAt(mx, my, m.r, PAL.ink0);
        pCircleAt(mx, my, m.r - PX, mc);
        drawIcon(MINION_ICONS[m.type] || "star", mx, my, 2, PAL.ink0);
        if (m.flash > 0.02) {
            ctx.globalAlpha = Math.min(1, m.flash * 0.8);
            pCircleAt(mx, my, m.r - PX, PAL.bone1);
            ctx.globalAlpha = 1;
        }
        pBar(mx - m.r, my - m.r - PX * 3, m.r * 2, PX * 2, m.hp / m.maxHp, mc, { bg: PAL.ink0 });
    }

    // 祭坛：石座 + 悬浮符文（攻击祭坛用红色调标记，无 type 即攻击型）
    const ALTAR_ICONS = { dmg: "sword", speed: "lightning", cd: "hourglass" };
    for (const al of boss.altars) {
        const ax = al.x - boss.x;
        const ay = al.y - boss.y;
        const ringCol = al.chasing ? PAL.ember2 : PAL.vio1;
        const orbCol = al.chasing ? PAL.ember3 : PAL.vio3;
        pCircleAt(ax, ay, al.r, PAL.ink0);
        pCircleAt(ax, ay, al.r - PX, ringCol);
        // 旋转符文点：三个绕祭坛公转的像素点
        for (let i = 0; i < 3; i++) {
            const a = boss.t * 0.03 + (Math.PI * 2 * i) / 3;
            pRectRaw(ax + Math.cos(a) * (al.r + PX) - PX / 2, ay + Math.sin(a) * (al.r + PX) - PX / 2, PX, PX, orbCol);
        }
        // 攻击祭坛：骷髅标记；普通祭坛：诅咒符文
        if (al.chasing) {
            drawIcon("skull", ax, ay, 2, PAL.ember3);
        } else {
            drawIcon(ALTAR_ICONS[al.type] || "candle", ax, ay, 2, orbCol);
        }
        if (al.flash > 0.02) {
            ctx.globalAlpha = Math.min(1, al.flash * 0.8);
            pCircleAt(ax, ay, al.r - PX, PAL.bone1);
            ctx.globalAlpha = 1;
        }
        pBar(ax - al.r, ay - al.r - PX * 3, al.r * 2, PX * 2, al.hp / al.maxHp, ringCol, { bg: PAL.ink0 });
    }

    // 尖刺环：像素方块沿圆周排布，替代描线尖刺
    const spikeN = 12;
    for (let i = 0; i < spikeN; i++) {
        const a = (Math.PI * 2 * i) / spikeN + boss.t * 0.008;
        const sr = boss.r + PX * 2 + (Math.floor(boss.t / 20) % 2 === 0 ? PX : 0);
        const sx = Math.round((Math.cos(a) * sr) / PX) * PX;
        const sy = Math.round((Math.sin(a) * sr) / PX) * PX;
        pRectRaw(sx - PX, sy - PX, PX * 2, PX * 2, boss.phase > 0 ? PAL.blood2 : boss.color);
    }

    // 主体像素造型
    const { cell } = drawBossSprite(boss.bossType, boss.color, boss.r, boss.t, {
        phase2: boss.phase > 0,
        flash: boss.flash,
        vulnerable: boss.vulnerable,
    });

    // 最终 Boss 加冠
    if (boss.level >= 50) drawBossCrown(boss.r, cell);

    ctx.restore();
}

// Boss 血条：紧贴顶栏下沿，居中；名称与状态标签在条内，避免占用额外纵向空间
export function drawBossBar() {
    const boss = state.boss;
    if (!boss) return;
    const bw = 440;
    const bx = Math.round((W - bw) / 2);
    const by = HUD_TOP_H + 8;
    const ratio = Math.max(0, boss.hp / boss.maxHp);

    // 名称 + 状态
    let label = boss.name;
    if (boss.bossType === "final") {
        label += ` · ${FINAL_PHASES[Math.min(boss.phase, FINAL_PHASES.length - 1)].label}`;
    } else if (boss.phase > 0) {
        label += " · 二阶段";
    }
    if (boss.vulnerable) label += " · 易伤";
    pText(label, W / 2, by - PX, boss.vulnerable ? PAL.gold3 : PAL.bone1, {
        size: 13, bold: true, align: "center",
    });

    // 血条：分段刻度，像素风更易读
    pBar(bx, by + PX, bw, PX * 4, ratio, boss.phase > 0 ? PAL.blood2 : boss.color, {
        bg: PAL.ink1, light: boss.phase > 0 ? PAL.blood3 : PAL.bone1, border: PAL.ink0,
    });
    // 每 25% 一道分隔刻线
    for (let i = 1; i < 4; i++) {
        pRectRaw(bx + (bw * i) / 4, by + PX, PX, PX * 4, PAL.ink0);
    }
}

// Boss 弹幕：实心菱形弹。
//
// 三个此前的可读性问题，逐个对应修复：
//  1. 太小 —— 原本只画十字骨架（横竖各 PX*2 厚），r=6 的弹在混战里只有约
//     10px 的亮部。现在画实心菱形并把最小视觉半径提到 PX*3，亮部约 24px。
//  2. 白色难分辨 —— 原本核心恒为 bone1(#f4eee2)、主体为 blood3(#f07d84)，
//     在骨白文字、金色球、亮色地板前都糊成一片。现在按弹种取高饱和暖色，
//     白色只留作 1px 的高光点缀，不再充当主色。
//  3. 弹种无从判断 —— homing/split/wave 与普通弹外观完全相同。现在各有配色
//     与标记（追踪=紫环、分裂=十字芯、波动=侧翼点）。
//
// 分层顺序：暗轮廓 → 主体 → 亮内芯 → 高光，保证任何背景上都有明暗边界。
// 四个弹种各占一个色系，且都不以骨白为主色——骨白是文字与主球的颜色，
// 弹幕再用白就会和它们糊在一起（这正是"白色子弹不易分辨"的来源）。
const BULLET_KIND = {
    normal: { edge: PAL.ember0, body: PAL.ember2, core: PAL.ember3 },
    homing: { edge: PAL.vio0, body: PAL.vio2, core: PAL.vio3 },
    split: { edge: PAL.blood0, body: PAL.blood2, core: PAL.blood3 },
    wave: { edge: PAL.arc0, body: PAL.arc2, core: PAL.arc3 },
};

function bulletKind(b) {
    if (b.homing) return BULLET_KIND.homing;
    if (b.splitAt > 0) return BULLET_KIND.split;
    if (b.wave) return BULLET_KIND.wave;
    return BULLET_KIND.normal;
}

// 供 physics.js 生成击毁碎屑用，保证碎屑与弹体同色
export function bulletColor(b) {
    return bulletKind(b).body;
}

export function drawBossBullets() {
    for (const b of state.bossBullets) {
        const k = bulletKind(b);
        // 视觉半径下限 9px（直径 ~20px）。碰撞半径只有 5~6，按碰撞半径画必然
        // 小到看不清；放大的部分是外圈暗轮廓与光晕，亮色主体仍贴着碰撞体，
        // 玩家据主体判断走位不会吃亏。
        // 菱形只有外接方形一半的面积，同样半径下亮部远小于方形弹，
        // 因此下限取 14px（直径 28px），实测亮部约 400px，混战中足够醒目。
        const r = Math.max(14, b.r * 2);
        pBlob(b.x, b.y, r + PX, PAL.ink0, "diamond");   // 暗轮廓：任何背景都压出边界
        pBlob(b.x, b.y, r, k.body, "diamond");
        // 内芯只缩 1 格：菱形每缩一格就掉两圈面积，缩 2 格会塌成单像素，
        // 亮色内芯等于没画（实测只剩 16px）。
        pBlob(b.x, b.y, r - PX, k.core, "diamond");
        pRectRaw(b.x - PX / 2, b.y - PX / 2, PX, PX, PAL.bone1);  // 中心高光点（仅 1 格）

        // 冰冻方块生效时：弹体包一圈冰环，读作"这颗弹已被冻住"
        if (state.bulletFreezeTimer > 0) {
            pRing(b.x, b.y, r + PX, PAL.teal2, 1);
        }

        // 弹种标记：用形状而非仅靠颜色区分，色盲玩家同样能读。
        // 标记一律取本弹种的亮色档，不用骨白——避免又变成"白弹"。
        // 所有标记都画在暗轮廓以内，否则亮点会在浅色地板上脱离弹体单独漂浮。
        if (b.homing) {
            const on = Math.floor(b.age / 6) % 2 === 0;   // 脉动环："会跟着你走"
            pRing(b.x, b.y, r + PX * 2, on ? PAL.vio3 : PAL.vio1, 1);
        } else if (b.splitAt > 0) {
            // 横贯十字："会炸成多发"
            pRectRaw(b.x - r + PX, b.y - PX / 2, r * 2 - PX * 2, PX, k.core);
        } else if (b.wave) {
            // 两侧翼点：走蛇形
            pRectRaw(b.x - r + PX, b.y - PX / 2, PX, PX, k.core);
            pRectRaw(b.x + r - PX * 2, b.y - PX / 2, PX, PX, k.core);
        }
    }
}

// ─── 蜂巢主炮激光 ─────────────────────────────────────────
//
// 必须是独立导出的世界坐标绘制函数，不能塞进 drawBoss——后者内部
// ctx.translate(boss.x, boss.y) 建立了 Boss 局部坐标系，激光会整体偏移。
//
// 预警与开火的视觉差刻意做到极大（细线 ↔ 13 格宽的实心束 + 震屏）：
// 玩家只有 55 帧反应时间，预警必须"一眼看见"，但又不能粗到看着像已经开火了。
export function drawBossLasers() {
    const boss = state.boss;
    if (!boss || !boss.lasers || boss.lasers.length === 0) return;
    const warning = boss.laserPhase === "warn";
    // 束长取对角线以上，保证任何角度都射到场外，不会在半空中断掉
    const LEN = Math.hypot(W, H) + 120;

    for (const beam of boss.lasers) {
        ctx.save();
        ctx.translate(beam.x0, beam.y0);
        ctx.rotate(beam.ang);

        if (warning) {
            // 预警：细红线 + 沿线奔向落点的行进光点，暗示"这条线上马上有东西"
            const hw = LASER.warnHalfW;
            pRectRaw(0, -hw, LEN, hw * 2, PAL.blood1);
            pRectRaw(0, -PX / 2, LEN, PX / 2, PAL.blood3);
            // 充能刻度：每 PX*10 一格，越接近开火跑得越快
            const prog = 1 - boss.laserPhaseTimer / LASER.warn;
            const step = PX * 10;
            const off = (boss.t * (2 + prog * 6)) % step;
            for (let d = off; d < LEN; d += step) {
                pRectRaw(d, -PX, PX * 2, PX * 2, PAL.ember3);
            }
        } else {
            // 开火：暗轮廓 → 主体 → 亮芯 → 白热中线，四段明度坡，
            // 与球/弹幕同一套分层语言，读起来是同一个世界的东西。
            const hw = LASER.halfW;
            pRectRaw(0, -hw - PX, LEN, (hw + PX) * 2, PAL.ink0);
            pRectRaw(0, -hw, LEN, hw * 2, PAL.blood2);
            pRectRaw(0, -hw + PX * 2, LEN, (hw - PX * 2) * 2, PAL.ember2);
            pRectRaw(0, -hw + PX * 4, LEN, (hw - PX * 4) * 2, PAL.ember3);
            pRectRaw(0, -PX, LEN, PX * 2, PAL.bone1);
        }
        ctx.restore();

        // 炮口辉光：让束和 Boss 视觉上连成一体，而不是凭空出现在身前
        if (!warning) {
            pCircleAt(beam.x0, beam.y0, LASER.halfW + PX * 2, PAL.ember3);
            pCircleAt(beam.x0, beam.y0, LASER.halfW - PX, PAL.bone1);
        }
    }
}

// 地面危险区：像素环 + 网点填充，保持地面可读
export function drawBossDangerZones() {
    for (const z of state.bossDangerZones) {
        if (z.type === "shockwave") {
            ctx.globalAlpha = Math.max(0, Math.min(1, (z.life / 60) * 0.9));
            pRing(z.x, z.y, z.r, PAL.ember2, 2);
            pRing(z.x, z.y, z.r - PX * 2, PAL.ember1, 1);
            ctx.globalAlpha = 1;
        } else if (z.type === "hazard") {
            const a = Math.max(0, Math.min(1, z.life / 240));
            // 毒雾用紫色，与中毒后变紫的球对应；其他 hazard 仍是血红。
            // 配色一致玩家才能把"踩到这个"和"球变紫了"联系起来。
            const fill = z._poison ? PAL.vio1 : PAL.blood1;
            const ring = z._poison ? PAL.vio2 : PAL.blood2;
            const d = a * 0.35;
            if (d > 0.02) drawZoneFill(z.x, z.y, z.r, fill, d);
            ctx.globalAlpha = Math.min(1, a * 1.2);
            pRing(z.x, z.y, z.r, ring, 1);
            ctx.globalAlpha = 1;
        }
    }
}

// 圆形网点填充：逐行裁剪到圆内。
// pDitherMask 填的是正方形，会溢出到圆环之外，让"圆形危险区"的边界失真——
// 而这个边界正是玩家判断进出的依据。
function drawZoneFill(cx, cy, r, color, density) {
    const gx = Math.round(cx / PX), gy = Math.round(cy / PX);
    const gr = Math.max(1, Math.round(r / PX));
    ctx.fillStyle = color;
    for (let dy = -gr; dy <= gr; dy++) {
        const span = Math.floor(Math.sqrt(Math.max(0, gr * gr - dy * dy)));
        for (let dx = -span; dx <= span; dx++) {
            if ((ZONE_BAYER[(dy + gr) & 3][(dx + gr) & 3] + 0.5) / 16 >= density) continue;
            ctx.fillRect((gx + dx) * PX, (gy + dy) * PX, PX, PX);
        }
    }
}

const ZONE_BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
];

// 方块射出的子弹：方形弹丸 + 尾迹。
// 原实现 r=5 经 round(5/4)*4 量化成 4，整颗弹只有 8×8 且大半是黑边，
// 亮部不到 6px——这就是"子弹太小看不清"的直接原因。
// 现在视觉半径下限 PX*2.5（约 20px footprint），并用方形轮廓与 Boss 的
// 菱形弹拉开区分：玩家扫一眼就知道威胁来自方块还是 Boss。
export function drawEnemyBullets() {
    for (const b of state.enemyBullets) {
        const r = Math.max(10, b.r * 2);   // 视觉半径下限 10px → 直径 20px

        // 运动尾迹：沿速度反方向拖两段，让高速小物体在视觉上"拉长"更易追踪。
        // 偏移必须大于弹体半径 + 轮廓厚度，否则尾迹会整段被弹体自己的暗轮廓盖掉。
        const len = Math.hypot(b.vx, b.vy) || 1;
        const ux = b.vx / len, uy = b.vy / len;
        const off = r + PX * 2;
        pBlob(b.x - ux * (off + PX * 3), b.y - uy * (off + PX * 3), r * 0.35, PAL.ember0, "square");
        pBlob(b.x - ux * off, b.y - uy * off, r * 0.6, PAL.ember1, "square");

        pBlob(b.x, b.y, r + PX, PAL.ink0, "square");     // 暗轮廓
        pBlob(b.x, b.y, r, PAL.ember2, "square");
        pBlob(b.x, b.y, r - PX, PAL.ember3, "square");
        pRectRaw(b.x - PX / 2, b.y - PX / 2, PX, PX, PAL.bone1);  // 中心高光

        // 冰冻方块生效时：弹体包一圈冰环
        if (state.bulletFreezeTimer > 0) {
            pRing(b.x, b.y, r + PX, PAL.teal2, 1);
        }
    }
}