import {
    W,
    H,
    STATE,
    isBossLevel,
    TOTAL_LEVELS,
    BALL_BASE_SPEED,
    BALL_RADIUS,
    MAX_SKILLS,
    PADDLE_BASE_W,
    PADDLE_H,
} from "./constants.js";
import { GAME_CONFIG } from "./config.js";
import { state, addScore, loseLife } from "./state.js";
import { createBlocksFromGrid, generateLevel, createBenefitBlocks, updateBenefitSpawns } from "./levels.js";
import { BENEFIT_SPAWN } from "./data/levels.js";
import {
    getRewardChoices,
    getInitialRewardChoices,
    getBossRewardChoices,
    applyReward,
    replaceSkill,
    recalcStats,
    spawnExtraBalls,
    useSkillFromGame,
    restoreTimeScale,
    currentSpeedScale,
    REWARD_MAP,
} from "./rewards.js";
import { updatePaddle, updateBalls, updateEnemies } from "./physics.js";
import { createBoss, updateBoss } from "./boss.js";
import { pickEvent, clearEvent, grantEventReward, describeReward, EVENTS } from "./events.js";
import { updateParticles } from "./particles.js";
import { updateStars } from "./stars.js";
import { spawnFloatingText } from "./fx.js";
import { playLaunch, playLevelComplete, playEventOpen, playVictory } from "./sound.js";
import { RARITY } from "./constants.js";
import { rollCursePool, applyCurseStack, BOSS_CURSES } from "./curses.js";
import { getSelectedSkin, skinDef } from "./unlocks.js";
import { PAL } from "./palette.js";
import { queueGuideOnce, checkPendingGuides, clearGuides } from "./tutorial.js";

// ─── 存档 ─────────────────────────────────────────────────
const SAVE_KEY = "bounceRoguelikeSave";

export function saveProgress(extra = {}) {
    try {
        const p = state.player;
        localStorage.setItem(
            SAVE_KEY,
            JSON.stringify({
                level: p.level,
                score: p.score,
                lives: p.lives,
                perks: p.perks,
                skills: p.skills.map((s) => s.id),
                curses: p.curses || [],
                ...extra,
            })
        );
    } catch (e) {
        /* localStorage 不可用时忽略 */
    }
}

export function loadSaveData() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

export function clearProgressSave() {
    try {
        localStorage.removeItem(SAVE_KEY);
    } catch (e) {
        /* ignore */
    }
}

// ─── 初始化 / 重置 ────────────────────────────────────────
export function resetPlayer() {
    // 重置 Boss Rush 状态（防止秘籍残留导致普通模式提前通关）
    state._bossRush = undefined;
    state.player = {
        lives: 3,
        score: 0,
        level: 1,
        perks: {}, // 加成/能力的堆叠计数
        skills: [], // 主动技能 [{id, cd}]
        // 以下派生属性由 recalcStats 计算
        ballDamage: 1,
        ballSpeedMul: 1,
        paddleBonus: 0,
        scoreMul: 1,
        healChance: 0,
        bossResist: 0,
        thorns: 0,
        maxPiercing: 0,
        extraChoices: 0,
        skillCdMul: 1,
        startBalls: 1,
        ballRadiusMul: 1,
        lifesaverLeft: 0,
        entryBonus: 0,
        // Buff 计时
        ghostTimer: 0,
        shieldTimer: 0,
        strikeTimer: 0,
        explosiveTimer: 0,
        freezeTimer: 0,
        slowFactor: 1,
        slowTill: 0,
        rewardBoost: null,
        breakCount: 0,
        bossDefeated: 0,
        siphonTimer: 0,
        _wealthTimer: 0,
        // 初始奖励（开局独立池）效果字段
        shatterChance: 0, // 碎裂余波：击碎方块时对左右相邻造成伤害的概率
        weakpointDmg: 0, // 弱点打击：对满血方块额外伤害
        deflectRadius: 0, // 弹幕偏转：挡板附近敌弹减速范围
        precisionDmg: 0, // 精准打击：空中累积伤害加成
        precisionMax: 0, // 精准打击：伤害上限
        surgeCounter: 0, // 能量涌动：击碎计数
        surgeBonus: 0, // 能量涌动：下一击伤害加成
        surgeNeed: 5, // 能量涌动：需要击碎数
        regenCounter: 0, // 再生：关卡计数，每 5 关恢复 1 命
        tenacityUsed: 0, // 不屈：本局是否已触发过（0=未触发，1=已触发）
        _shieldGranted: 0, // 守卫核心：本关是否已发放过护盾
        comboPower: 0, // 弹射连击：当前叠加的伤害加成（最高 +4）
        comboTimer: 0, // 弹射连击：加成剩余帧数（3 秒内未续上则清零）
    };
    recalcStats();
}

export function resetPaddle() {
    const baseW = Math.min(320, PADDLE_BASE_W * (1 + state.player.paddleBonus));
    state.paddle = { x: W / 2 - baseW / 2, y: H - 40, width: baseW, height: PADDLE_H, baseWidth: PADDLE_BASE_W, flash: 0 };
}

export function resetBall() {
    const baseSpeed = BALL_BASE_SPEED * state.player.ballSpeedMul * currentSpeedScale();
    state.balls = [
        {
            x: state.paddle.x + state.paddle.width / 2,
            y: state.paddle.y - 10,
            vx: 0,
            vy: 0,
            speed: baseSpeed,
            radius: BALL_RADIUS * state.player.ballRadiusMul,
            launched: false,
            piercingLeft: state.player.maxPiercing,
            trail: [],
            blockHits: 0,
            poisonTimer: 0,
            poisonImmune: 0,
            airFrames: 0, // 精准打击：空中累计帧数
            // 主球（金色球）。身份固定：落地即扣血并回到挡板，永不由分裂球顶替。
            isMain: true,
        },
    ];
    // 开局额外球：双球开局/祝福开局
    if (state.player.startBalls > 1) {
        spawnExtraBalls(state.player.startBalls - 1);
        for (const b of state.balls) {
            if (!b.isMain) b.launched = false;
        }
    }
}

export function loadLevel(num, skipCurse = false) {
    if (state.player.entryBonus > 0) addScore(state.player.entryBonus);
    const grid = generateLevel(num);
    state.blocks = createBlocksFromGrid(grid, num);
    state.particles = [];
    state.rings = [];
    state.floatingTexts = [];
    state.freeze = 0;
    state.invulnTimer = 0;
    state.bulletFreezeTimer = 0; // 冰冻方块效果不跨关
    state.aegisTimer = 0; // 圣盾方块效果不跨关
    state.frenzyTimer = 0; // 狂澜方块效果不跨关
    state.powerBlockTimer = 0; // 强化方块效果不跨关
    state.momentumTimer = 0; // 加速方块效果不跨关
    state.friendlyBullets = []; // 同化弹不跨关
    state.boss = null;
    state.bossBullets = [];
    state.enemyBullets = [];
    state.bossDangerZones = [];
    state.challenge = null;
    recalcStats(); // 每关刷新救生圈等按关重置的属性
    // 重置每关计数
    if (state.player) {
        state.player.surgeCounter = 0;
        state.player.surgeBonus = 0;
        state.player._shieldGranted = 0; // 守卫核心：每关重置
        state.player.comboPower = 0; // 弹射连击：每关重置
        state.player.comboTimer = 0;
    }
    state.breakCounter = 0; // 分裂计数每关重置
    // 普通关卡时间限制：随关卡递增，需击碎比例从 50% 升至 90%
    if (state.player && !isBossLevel(num)) {
        const breakable = state.blocks.filter(b => !b.indestructible && !b.bonusOnly).length;
        const pct = Math.min(0.9, 0.5 + (num - 1) / 49 * 0.4);
        state.levelTimerTarget = Math.max(1, Math.ceil(breakable * pct));
        state.levelTimerTotal = breakable;
        // 时间随关卡递增，增幅递减：45s → 约 65s
        const extraTime = 20 * (1 - Math.pow(0.92, num));
        state.levelTimer = Math.round((45 + extraTime) * 60);
        state.levelTimerStarted = false; // 发射主球后才开始倒计时
    } else {
        state.levelTimer = 0;
        state.levelTimerStarted = false;
        state.levelTimerTarget = 0;
    }
    resetPaddle();
    resetBall();
    // Boss 战与限时挑战由各自函数处理
    saveProgress();
    checkPendingGuides(); // 按场上要素补引导（基本操作/技能/方块机制）
}

// ─── 流程：开局 ───────────────────────────────────────────
export function startGameRun() {
    clearProgressSave();
    clearGuides(); // 清掉可能的残留引导，避免盖住开局选卡
    // 清空上一局残留的视觉特效与危险区
    state.particles = [];
    state.rings = [];
    state.floatingTexts = [];
    state.boss = null;
    state.bossBullets = [];
    state.enemyBullets = [];
    state.bossDangerZones = [];
    state.challenge = null;
    resetPlayer();
    // 给予皮肤开场技能（从 REWARD_MAP 中查找）
    const skinIdx = getSelectedSkin();
    const sDef = skinDef(skinIdx);
    if (sDef && sDef.skill) {
        const skillDef = REWARD_MAP[sDef.skill];
        if (skillDef) {
            // 直接推送技能到槽位，不走 applyReward（避免 recalc 干扰）
            state.player.skills.push({ id: skillDef.id, cd: 0 });
        }
    }
    state.gameState = STATE.START_REWARD;
    state.rewardTitle = "选择你的开局奖励";
    state.rareOnly = false;
    state.levelChoices = getInitialRewardChoices(3 + state.player.extraChoices);
    state.player.rewardBoost = null;
    queueGuideOnce("startReward"); // 首次开局解释选卡规则
}

export function handleStartRewardPick(def) {
    applyReward(def);
    state.player.level = 1;
    loadLevel(1);
    state.gameState = STATE.PLAYING;
}

// ─── 流程：继续上次冒险 ───────────────────────────────────
export function continueFromSave() {
    const s = loadSaveData();
    if (!s) return;
    resetPlayer();
    const p = state.player;
    p.level = s.level || 1;
    p.score = s.score || 0;
    p.lives = s.lives ?? 3;
    p.perks = s.perks || {};
    p.skills = (s.skills || []).map((id) => ({ id, cd: 0 }));
    p.curses = s.curses || [];
    recalcStats();
    // 退出时正停留在事件房：回到刚遇到该事件的时候
    if (s.atEvent) {
        state.currentEvent = EVENTS.find((e) => e.id === s.atEvent) || pickEvent();
        state.eventResult = null;
        state.pendingChallenge = false;
        state.gameState = STATE.EVENT;
        playEventOpen();
        queueGuideOnce("event"); // 首次进入事件房时解释规则
        return;
    }
    if (isBossLevel(p.level)) {
        startBossFight();
    } else {
        loadLevel(p.level, true);
    }
    state.gameState = STATE.PLAYING;
}

// ─── 流程：关卡通过后 ─────────────────────────────────────
export function clearLevel() {
    const cleared = state.player.level;
    state.player.level++;

    // 再生：每过 5 关恢复 1 条命
    if (state.player.perks?.init_regen) {
        state.player.regenCounter = (state.player.regenCounter || 0) + 1;
        if (state.player.regenCounter >= 5) {
            state.player.regenCounter = 0;
            state.player.lives += 1;
            spawnFloatingText(400, 240, "再生！生命 +1", PAL.moss3);
        }
    }

    if (cleared >= TOTAL_LEVELS) {
        state.gameState = STATE.VICTORY;
        playVictory();
        return;
    }

    state.rewardTitle = isBossLevel(cleared) ? "Boss 击破！" : `第 ${cleared} 关 通过！`;
    state.rareOnly = false;
    state.levelChoices = getRewardChoices(3 + state.player.extraChoices);
    state.player.rewardBoost = null; // 圣光洗礼在本次选卡生效后清除
    state.gameState = STATE.LEVEL_REWARD;
    playLevelComplete();
    saveProgress();
}

// Boss 击破后的结算（必掉 Boss 专属奖励 + 获得 Boss 诅咒）
export function bossRewardScreen() {
    state.player.level++;
    state.player.bossDefeated = (state.player.bossDefeated || 0) + 1;
    // Boss 诅咒待选（不自动应用，留给后续三选一界面）
    state.pendingBossCurse = true;
    state.rewardTitle = `第 ${state.player.level - 1} 关 Boss 击破！专属奖励`;
    state.rareOnly = true;
    state.levelChoices = getBossRewardChoices(3 + state.player.extraChoices);
    state.gameState = STATE.LEVEL_REWARD;
    saveProgress();
}

export function handleRewardPick(def) {
    const effectiveMax = Math.max(1, MAX_SKILLS - (state.player.curseSkillSlotPenalty || 0));
    if (def.type === "skill" && state.player.skills.length >= effectiveMax) {
        state.pendingSkillDef = def;
        state.gameState = STATE.SKILL_SWAP;
        return;
    }
    applyReward(def);
    finalizeRewardStage();
}

export function skipReward() {
    finalizeRewardStage();
}

export function cancelSkillSwap() {
    state.pendingSkillDef = null;
    state.gameState = STATE.LEVEL_REWARD;
}

export function confirmSkillSwap(oldIndex) {
    const def = state.pendingSkillDef;
    if (!def) {
        state.gameState = STATE.LEVEL_REWARD;
        return;
    }
    replaceSkill(oldIndex, def);
    state.pendingSkillDef = null;
    finalizeRewardStage();
}

// 奖励阶段结束：进入 Boss / 事件房 / 下一关
function finalizeRewardStage() {
    const lv = state.player.level;
    // Boss 诅咒三选一（优先于普通诅咒）
    if (state.pendingBossCurse) {
        state.pendingBossCurse = false;
        setupBossCurseSelect();
        return;
    }
    // 普通诅咒：击败第一个 Boss 后每关一次
    const shouldCurse = lv > 10;
    if (shouldCurse) {
        setupCurseSelect();
        return;
    }
    // 直接进入下一阶段
    const next = lv;
    if (isBossLevel(next)) { startBossFight(); return; }
    // 事件房概率（诅咒「厄运」会降低概率，最低 0%）
    const eventChance = Math.max(0, GAME_CONFIG.event.chance - (state.player.curseEventReduce || 0));
    if (Math.random() < eventChance) {
        state.currentEvent = pickEvent();
        state.gameState = STATE.EVENT;
        playEventOpen();
        spawnFloatingText(400, 260, `事件：${state.currentEvent.name}`, PAL.gold3);
        queueGuideOnce("event"); // 首次进入事件房时解释规则
        return;
    }
    loadLevel(next);
    state.gameState = STATE.PLAYING;
}

// Boss 诅咒三选一
function setupBossCurseSelect() {
    const bossCurses = [...BOSS_CURSES].sort(() => Math.random() - 0.5);
    const penalty = state.player.curseChoicePenalty || 0;
    state.curseChoices = bossCurses.slice(0, Math.max(1, 3 - penalty));
    state.curseStrength = 1;
    state.gameState = STATE.CURSE_SELECT;
    queueGuideOnce("curse"); // 首次承受诅咒时解释规则
    spawnFloatingText(400, 200, state.curseChoices.length === 1 ? "命运封印！强制诅咒" : "选择一项 Boss 诅咒", PAL.blood3);
}

function setupCurseSelect() {
    const lv = state.player.level;
    const pool = rollCursePool(lv);
    // 排除攻击力已为 1 时的锈蚀诅咒
    const filtered = pool.filter(c => !(c.id === "rust" && state.player.ballDamage <= 1));
    let shuffled = [...filtered].sort(() => Math.random() - 0.5);
    // 诅咒「诅咒回响」&「命运封印」减少可选项（最少 1 项）
    const penalty = state.player.curseChoicePenalty || 0;
    state.curseChoices = shuffled.slice(0, Math.max(1, 3 - penalty));
    state.curseStrength = 1 + Math.floor((lv - 1) * 0.1);
    state.gameState = STATE.CURSE_SELECT;
    queueGuideOnce("curse"); // 首次承受诅咒时解释规则
    spawnFloatingText(400, 200, state.curseChoices.length === 1 ? "命运封印！强制诅咒" : "选择一个诅咒", PAL.blood3);
}

export function confirmCursePick(index) {
    const c = state.curseChoices[index];
    if (!c) return false;
    applyCurseStack(c.id, state.curseStrength, state.player);
    recalcStats();
    state.curseChoices = [];
    spawnFloatingText(400, 260, `获得诅咒：${c.icon} ${c.name} ×${state.curseStrength}`, PAL.blood3);
    // Boss Rush 模式（仅当进行中且未打完 4 个 Boss 时）
    if (typeof state._bossRush === "number" && state._bossRush < 4) {
        proceedBossRush();
        return true;
    }
    // 进入下一阶段
    const next = state.player.level;
    if (isBossLevel(next)) {
        startBossFight();
        return true;
    }
    // 事件房概率（诅咒「厄运」会降低概率，最低 0%）
    const eventChance = Math.max(0, GAME_CONFIG.event.chance - (state.player.curseEventReduce || 0));
    if (Math.random() < eventChance) {
        state.currentEvent = pickEvent();
        state.gameState = STATE.EVENT;
        playEventOpen();
        spawnFloatingText(400, 260, `事件：${state.currentEvent.name}`, PAL.gold3);
        queueGuideOnce("event"); // 首次事件房时解释规则
        return true;
    }
    loadLevel(next);
    state.gameState = STATE.PLAYING;
    return true;
}

// Boss Rush 模式：击败当前 Boss 后进入下一 Boss
export function proceedBossRush() {
    const bossLevels = [10, 20, 30, 40, 50];
    const idx = state._bossRush || 0;
    if (idx >= bossLevels.length) {
        state.gameState = STATE.VICTORY;
        playVictory();
        return;
    }
    state.player.level = bossLevels[idx];
    state._bossRush = idx + 1;
    startBossFight();
    spawnFloatingText(400, 200, `Boss Rush ${idx + 1}/4`, PAL.blood2);
}

export function startBossFight() {
    createBoss(state.player.level);
    state.blocks = createBenefitBlocks(state.player.level);
    state.particles = [];
    state.rings = [];
    state.floatingTexts = [];
    state.freeze = 0;
    state.invulnTimer = 0;
    state.bulletFreezeTimer = 0; // 冰冻方块效果不跨关
    state.aegisTimer = 0; // 圣盾方块效果不跨关
    state.frenzyTimer = 0; // 狂澜方块效果不跨关
    state.powerBlockTimer = 0; // 强化方块效果不跨关
    state.momentumTimer = 0; // 加速方块效果不跨关
    state.friendlyBullets = []; // 同化弹不跨关
    state.benefitWaveTimer = BENEFIT_SPAWN.firstAt; // 收益方块第一波：开局 8 秒后
    state.challenge = null;
    resetPaddle();
    resetBall();
    state.gameState = STATE.PLAYING;
    if (state.player.entryBonus > 0) addScore(state.player.entryBonus);
    state.player._shieldGranted = 0; // 守卫核心：Boss 战重置
    state.player.comboPower = 0; // 弹射连击：Boss 战重置
    state.player.comboTimer = 0;
    state.breakCounter = 0; // 分裂计数 Boss 战重置
    playEventOpen();
    spawnFloatingText(400, 200, "BOSS 来袭", PAL.blood3);
    saveProgress();
    checkPendingGuides(); // 首次 Boss 战 / 首次技能 / 首次基本操作等多条同步触发
}

// ─── 流程：事件房 ─────────────────────────────────────────
export function finishEvent() {
    clearEvent();
    if (state.pendingChallenge) {
        beginChallengeRun();
        return;
    }
    loadLevel(state.player.level);
    state.gameState = STATE.PLAYING;
}

// 事件房中按 ESC：保存现场并退回主菜单，继续时回到刚遇事件时
export function quitEventToMenu() {
    saveProgress({ atEvent: state.currentEvent ? state.currentEvent.id : null });
    clearEvent();
    clearGuides();
    state.gameState = STATE.MENU;
}

// ─── 限时挑战房 ───────────────────────────────────────────
export function beginChallengeRun() {
    const lv = state.player.level;
    state.pendingChallenge = false;
    state.challenge = {
        limit: 25 * 60, // 25 秒
        target: 12,
        initialBreakable: 0,
    };
    state.blocks = createBlocksFromGrid(buildChallengeGrid(lv), 1);
    state.challenge.initialBreakable = state.blocks.filter((b) => !b.indestructible && !b.bonusOnly).length;
    state.particles = [];
    state.rings = [];
    state.floatingTexts = [];
    state.freeze = 0;
    state.invulnTimer = 0;
    state.bulletFreezeTimer = 0;
    state.boss = null;
    state.bossBullets = [];
    state.enemyBullets = [];
    state.bossDangerZones = [];
    state.breakCounter = 0;
    state.player.comboPower = 0;
    state.player.comboTimer = 0;
    resetPaddle();
    resetBall();
    state.gameState = STATE.PLAYING;
    spawnFloatingText(400, 300, "限时挑战开始！", PAL.ember2);
    queueGuideOnce("challenge"); // 首次限时挑战时解释规则
}

function buildChallengeGrid(level) {
    const rows = 4;
    // 使用第一关的方块尺寸计算列数，确保方块不超出画面
    const bw = 107, gap = 4, margin = 30;
    const cols = Math.floor((W - 2 * margin) / (bw + gap));
    const grid = [];
    for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) {
            if (Math.random() < 0.25) {
                row.push(0);
                continue;
            }
            if (level <= 15) row.push(1);
            else if (level <= 30) row.push(Math.random() < 0.65 ? 1 : 2);
            else row.push(Math.random() < 0.5 ? 2 : 3);
        }
        grid.push(row);
    }
    return grid;
}

function endChallenge(success, broke) {
    const c = state.challenge;
    state.challenge = null;
    state.pendingChallenge = false;
    if (success) {
        const def = grantEventReward(RARITY.UNCOMMON);
        state.eventResult = {
            text: `限时挑战成功！击破 ${broke} 个方块\n获得罕见奖励：${describeReward(def)}`,
            color: PAL.moss3,
        };
        spawnFloatingText(400, 260, "挑战成功！", PAL.moss3);
    } else {
        // 时间到但未达成目标：强制进入下一关，不给奖励
        if (state.gameState === STATE.GAME_OVER) return;
        state.eventResult = {
            text: `挑战失败！仅击破 ${broke}/${c.target} 个方块\n未获得奖励`,
            color: PAL.blood3,
        };
        spawnFloatingText(400, 260, "挑战失败", PAL.blood3);
    }
    state.gameState = STATE.EVENT;
    state.currentEvent = null;
}

// ─── 暂停 ─────────────────────────────────────────────────
export function togglePause() {
    if (state.gameState === STATE.PLAYING) state.gameState = STATE.PAUSED;
    else if (state.gameState === STATE.PAUSED) state.gameState = STATE.PLAYING;
}

export function resumeGame() {
    if (state.gameState === STATE.PAUSED) state.gameState = STATE.PLAYING;
}

export function pauseRestart() {
    startGameRun();
}

export function pauseQuitToMenu() {
    saveProgress();
    clearGuides();
    state.gameState = STATE.MENU;
}

export function quitToMenu() {
    clearProgressSave();
    clearGuides();
    state.gameState = STATE.MENU;
}

// ─── 发射未发射的球 ───────────────────────────────────────
export function launchBalls() {
    let launchedAny = false;
    for (const b of state.balls) {
        if (!b.launched) {
            launchedAny = true;
            b.launched = true;
            const angle = ((Math.random() * 20 - 10 - 90) * Math.PI) / 180;
            b.vx = Math.cos(angle) * b.speed;
            b.vy = Math.sin(angle) * b.speed;
        }
    }
    if (launchedAny) {
        playLaunch();
        // 主球（黄球）发射后，普通关卡倒计时才开始
        if (state.balls.some((bl) => bl.isMain && bl.launched)) {
            state.levelTimerStarted = true;
        }
        // 守卫核心：首次发射后给予护盾
        if (state.player.perks?.guardian_core > 0 && !state.player._shieldGranted) {
            state.player.shieldTimer = 120;
            state.player._shieldGranted = true;
        }
    }
}

export function tryUseSkill(index) {
    // 主球未发射时不能使用技能
    if (state.balls.every(b => !b.launched)) return;
    useSkillFromGame(index);
}

// ─── 主循环逻辑更新 ───────────────────────────────────────
export function update(ts = 0) {
    // 引导期间暂停一切物理与流程
    if (state.guide) return;
    if (state.gameState !== STATE.PLAYING) return;
    // 帧率无关 dt
    if (state.lastTs === 0) state.lastTs = ts;
    state.dt = Math.min(3, Math.max(0.05, (ts - state.lastTs) / 16.6667));
    state.lastTs = ts;
    state.time += state.dt;

    tickTimers();

    // 顿帧：暂停物理，只更新特效
    if (state.freeze > 0) {
        state.freeze = Math.max(0, state.freeze - state.dt);
        updateParticles();
        updateStars();
        return;
    }

    updatePaddle();
    updateEnemies();
    updateBoss();
    if (state.boss) updateBenefitSpawns();
    updateBalls();
    updateParticles();
    updateStars();

    // 帧内死亡/胜利 → 清除存档
    if (state.gameState === STATE.GAME_OVER || state.gameState === STATE.VICTORY) {
        clearProgressSave();
        return;
    }

    // Boss 刚被击破：进入 BOSS_CLEAR 结算（不可再走普通清关流程）
    if (state.gameState === STATE.BOSS_CLEAR) {
        return;
    }

    // 限时挑战房
    if (state.challenge) {
        const c = state.challenge;
        c.limit -= state.dt;
        const breakable = state.blocks.filter((b) => !b.indestructible && !b.bonusOnly).length;
        const broke = c.initialBreakable - breakable;
        if (broke >= c.target) {
            endChallenge(true, broke);
            return;
        }
        if (c.limit <= 0) {
            endChallenge(false, broke);
            return;
        }
        // 扣血由 physics 的主球落地分支负责，这里只做兜底补球
        ensureMainBall();
        return;
    }

    if (state.boss) {
        // Boss 战：球落地不扣血
        if (state.balls.length === 0) {
            resetBall();
        }
        return;
    }

    // 普通关结算：不可击碎方块是障碍，只需清除可击碎方块（奖励方块不计入通关条件）
    const hasBreakable = state.blocks.some((b) => !b.indestructible && !b.bonusOnly);
    if (!hasBreakable) {
        clearLevel();
        return;
    }

    // 普通关卡倒计时：主球（黄球）未发射前不计时
    if (state.levelTimer > 0 && state.levelTimerStarted) {
        state.levelTimer -= state.dt;
        if (state.levelTimer <= 0) {
            const breakable = state.blocks.filter(b => !b.indestructible && !b.bonusOnly).length;
            const broke = state.levelTimerTotal - breakable;
            if (broke < state.levelTimerTarget) {
                // 时间到但未达成目标：强制进入下一关，不给奖励
                spawnFloatingText(W / 2, H / 2, "时间到！未达成目标", PAL.blood3);
                state.player.level++;
                if (state.player.level > TOTAL_LEVELS) {
                    state.gameState = STATE.VICTORY;
                    playVictory();
                    return;
                }
                if (isBossLevel(state.player.level)) {
                    startBossFight();
                } else {
                    loadLevel(state.player.level);
                }
            } else {
                // 达成目标：结束当前关卡，进入奖励选择
                clearLevel();
                return;
            }
        }
    }

    // 普通关：主球落地的扣血已在 physics 内结算（主球身份固定，落地即扣血后归位）。
    // 这里只兜底——若因任何原因场上没有主球了，补一颗回来，不再重复扣血。
    ensureMainBall();
}

// 场上必须始终有一颗主球。
//
// 正常流程下 physics 的主球落地分支已把主球放回挡板，这里不会命中；
// 只有异常状态（例如外部逻辑清空了球数组）才走到。刻意不做"提升副球为主球"，
// 那正是本次要移除的旧机制——主球身份自始至终不转移。
function ensureMainBall() {
    if (state.gameState !== STATE.PLAYING) return;
    if (state.balls.some((b) => b.isMain)) return;
    resetBall();
}

function tickTimers() {
    const dt = state.dt;
    const p = state.player;
    p.ghostTimer = Math.max(0, p.ghostTimer - dt);
    p.shieldTimer = Math.max(0, p.shieldTimer - dt);
    p.strikeTimer = Math.max(0, p.strikeTimer - dt);
    p.explosiveTimer = Math.max(0, p.explosiveTimer - dt);
    p.freezeTimer = Math.max(0, p.freezeTimer - dt);
    state.bulletFreezeTimer = Math.max(0, state.bulletFreezeTimer - dt);
    state.aegisTimer = Math.max(0, state.aegisTimer - dt);
    state.frenzyTimer = Math.max(0, state.frenzyTimer - dt);
    // 强化方块：buff 结束的那一帧把球半径还原成基础值。
    // 半径存在每个球上（生成时算一次），所以放大/还原都要显式改写，
    // 不能像伤害那样在读取处乘系数。
    const powerWas = state.powerBlockTimer;
    state.powerBlockTimer = Math.max(0, state.powerBlockTimer - dt);
    if (powerWas > 0 && state.powerBlockTimer === 0) {
        for (const b of state.balls) b.radius = BALL_RADIUS * state.player.ballRadiusMul;
    }
    state.momentumTimer = Math.max(0, state.momentumTimer - dt);
    state.invulnTimer = Math.max(0, state.invulnTimer - dt);
    state.hurtTimer = Math.max(0, state.hurtTimer - dt);
    // 弹射连击：3 秒内未续上则力量清零
    if (p.comboTimer > 0) {
        p.comboTimer -= dt;
        if (p.comboTimer <= 0) p.comboPower = 0;
    }
    // 皮肤技能：黄金祝福时效
    if (p._wealthTimer > 0) {
        p._wealthTimer -= dt;
        if (p._wealthTimer <= 0) { p.scoreMul = Math.max(1, p.scoreMul / 2); }
    }
    // 吸吮技能时效
    if (p.siphonTimer > 0) p.siphonTimer = Math.max(0, p.siphonTimer - dt);
    for (const s of p.skills) {
        s.cd = Math.max(0, s.cd - dt);
    }
    if (p.slowTill > 0 && state.time > p.slowTill) {
        restoreTimeScale();
    }
}