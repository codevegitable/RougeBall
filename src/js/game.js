import {
    W,
    H,
    STATE,
    isBossLevel,
    TOTAL_LEVELS,
    BALL_BASE_SPEED,
    BALL_RADIUS,
    MAX_SKILLS,
    GRID_COLS,
    PADDLE_BASE_W,
    PADDLE_H,
} from "./constants.js";
import { GAME_CONFIG } from "./config.js";
import { state, addScore, loseLife } from "./state.js";
import { createBlocksFromGrid, generateLevel } from "./levels.js";
import {
    getRewardChoices,
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
            // 主球（金色球）。身份固定：落地即扣血并回到挡板，永不由分裂球顶替。
            isMain: true,
        },
    ];
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
    state.boss = null;
    state.bossBullets = [];
    state.enemyBullets = [];
    state.challenge = null;
    recalcStats(); // 每关刷新救生圈等按关重置的属性
    resetPaddle();
    resetBall();
    if (state.player.startBalls > 1) {
        spawnExtraBalls(state.player.startBalls - 1);
    }
    saveProgress();
}

// ─── 流程：开局 ───────────────────────────────────────────
export function startGameRun() {
    clearProgressSave();
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
    state.levelChoices = getRewardChoices(3 + state.player.extraChoices);
    state.player.rewardBoost = null;
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
    // 普通诅咒：15 关后每 3 关一次
    const shouldCurse = lv > 15 && lv % 3 === 0;
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
    spawnFloatingText(400, 200, "选择一项 Boss 诅咒", PAL.blood3);
}

function setupCurseSelect() {
    const lv = state.player.level;
    const pool = rollCursePool(lv);
    // 排除攻击力已为 1 时的锈蚀诅咒
    const filtered = pool.filter(c => !(c.id === "rust" && state.player.ballDamage <= 1));
    let shuffled = [...filtered].sort(() => Math.random() - 0.5);
    // 检查是否有强制诅咒（命运封印）— 如果有则只显示 1 项
    const forcedIdx = shuffled.findIndex(c => c.forced);
    if (forcedIdx >= 0) {
        const forced = shuffled.splice(forcedIdx, 1)[0];
        state.curseChoices = [forced];
    } else {
        // 诅咒「诅咒回响」减少可选项（最少 1 项）
        const penalty = state.player.curseChoicePenalty || 0;
        state.curseChoices = shuffled.slice(0, Math.max(1, 3 - penalty));
    }
    state.curseStrength = 1 + Math.floor((lv - 1) * 0.1);
    state.gameState = STATE.CURSE_SELECT;
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
        return true;
    }
    loadLevel(next);
    state.gameState = STATE.PLAYING;
    return true;
}

// Boss Rush 模式：击败当前 Boss 后进入下一 Boss
export function proceedBossRush() {
    const bossLevels = [15, 30, 45, 50];
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
    state.blocks = [];
    state.particles = [];
    state.rings = [];
    state.floatingTexts = [];
    state.freeze = 0;
    state.invulnTimer = 0;
    state.challenge = null;
    resetPaddle();
    resetBall();
    if (state.player.startBalls > 1) {
        spawnExtraBalls(state.player.startBalls - 1);
    }
    state.gameState = STATE.PLAYING;
    if (state.player.entryBonus > 0) addScore(state.player.entryBonus);
    playEventOpen();
    spawnFloatingText(400, 200, "BOSS 来袭", PAL.blood3);
    saveProgress();
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
    state.challenge.initialBreakable = state.blocks.length;
    state.particles = [];
    state.rings = [];
    state.floatingTexts = [];
    state.freeze = 0;
    state.invulnTimer = 0;
    state.boss = null;
    state.bossBullets = [];
    state.enemyBullets = [];
    resetPaddle();
    resetBall();
    if (state.player.startBalls > 1) {
        spawnExtraBalls(state.player.startBalls - 1);
    }
    state.gameState = STATE.PLAYING;
    spawnFloatingText(400, 300, "限时挑战开始！", PAL.ember2);
}

function buildChallengeGrid(level) {
    const rows = 4;
    const grid = [];
    for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < GRID_COLS; c++) {
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
        loseLife(0.5);
        if (state.gameState === STATE.GAME_OVER) return;
        state.eventResult = {
            text: `挑战失败！仅击破 ${broke}/${c.target} 个方块\n损失半条生命`,
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
    state.gameState = STATE.MENU;
}

export function quitToMenu() {
    saveProgress();
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
    if (launchedAny) playLaunch();
}

export function tryUseSkill(index) {
    useSkillFromGame(index);
}

// ─── 主循环逻辑更新 ───────────────────────────────────────
export function update(ts = 0) {
    if (state.gameState !== STATE.PLAYING) return;
    // 帧率无关 dt
    if (state.lastTs === 0) state.lastTs = ts;
    state.dt = Math.min(3, Math.max(0.05, (ts - state.lastTs) / 16.6667));
    state.lastTs = ts;
    state.time++;

    tickTimers();

    // 顿帧：暂停物理，只更新特效
    if (state.freeze > 0) {
        state.freeze--;
        updateParticles();
        updateStars();
        return;
    }

    updatePaddle();
    updateEnemies();
    updateBoss();
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
        c.limit--;
        const breakable = state.blocks.filter((b) => !b.indestructible).length;
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

    // 普通关结算：不可击碎方块是障碍，只需清除可击碎方块
    const hasBreakable = state.blocks.some((b) => !b.indestructible);
    if (!hasBreakable) {
        clearLevel();
        return;
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
    const p = state.player;
    p.ghostTimer = Math.max(0, p.ghostTimer - 1);
    p.shieldTimer = Math.max(0, p.shieldTimer - 1);
    p.strikeTimer = Math.max(0, p.strikeTimer - 1);
    p.explosiveTimer = Math.max(0, p.explosiveTimer - 1);
    p.freezeTimer = Math.max(0, p.freezeTimer - 1);
    state.invulnTimer = Math.max(0, state.invulnTimer - 1);
    state.hurtTimer = Math.max(0, state.hurtTimer - 1);
    // 皮肤技能：黄金祝福时效
    if (p._wealthTimer > 0) {
        p._wealthTimer--;
        if (p._wealthTimer <= 0) { p.scoreMul = Math.max(1, p.scoreMul / 2); }
    }
    // 吸吮技能时效
    if (p.siphonTimer > 0) p.siphonTimer = Math.max(0, p.siphonTimer - 1);
    for (const s of p.skills) {
        s.cd = Math.max(0, s.cd - 1);
    }
    if (p.slowTill > 0 && state.time > p.slowTill) {
        restoreTimeScale();
    }
}