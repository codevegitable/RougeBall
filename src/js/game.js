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
} from "./constants.js";
import { GAME_CONFIG } from "./config.js";
import { state, addScore, loseLife } from "./state.js";
import { createBlocksFromGrid, generateLevel } from "./levels.js";
import {
    getRewardChoices,
    applyReward,
    replaceSkill,
    recalcStats,
    spawnExtraBalls,
    useSkillFromGame,
    restoreTimeScale,
    currentSpeedScale,
} from "./rewards.js";
import { updatePaddle, updateBalls, updateEnemies } from "./physics.js";
import { createBoss, updateBoss } from "./boss.js";
import { pickEvent, clearEvent, grantEventReward, describeReward, EVENTS } from "./events.js";
import { updateParticles } from "./particles.js";
import { updateStars } from "./stars.js";
import { spawnFloatingText } from "./fx.js";
import { playLaunch, playLevelComplete, playEventOpen, playVictory } from "./sound.js";
import { RARITY } from "./constants.js";

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
    };
    recalcStats();
}

export function resetPaddle() {
    const baseW = Math.min(320, 110 * (1 + state.player.paddleBonus));
    state.paddle = { x: W / 2 - baseW / 2, y: H - 40, width: baseW, height: 14, baseWidth: baseW, flash: 0 };
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
        },
    ];
}

export function loadLevel(num) {
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
    resetPlayer();
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
        loadLevel(p.level);
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

// Boss 击破后的结算（必掉稀有奖励）→ BOSS_CLEAR 点击进入
export function bossRewardScreen() {
    state.player.level++; // Boss 关已通过，进入下一关号
    state.rewardTitle = `第 ${state.player.level - 1} 关 Boss 击破！稀有奖励掉落`;
    state.rareOnly = true;
    state.levelChoices = getRewardChoices(3 + state.player.extraChoices, true);
    state.gameState = STATE.LEVEL_REWARD;
    saveProgress();
}

export function handleRewardPick(def) {
    if (def.type === "skill" && state.player.skills.length >= MAX_SKILLS) {
        state.pendingSkillDef = def;
        state.gameState = STATE.SKILL_SWAP;
        return;
    }
    applyReward(def);
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
    const next = state.player.level;
    if (isBossLevel(next)) {
        startBossFight();
        return;
    }
    // 事件房判定
    if (Math.random() < GAME_CONFIG.event.chance) {
        state.currentEvent = pickEvent();
        state.gameState = STATE.EVENT;
        playEventOpen();
        spawnFloatingText(400, 260, `事件：${state.currentEvent.name}`, "#ffcc33");
        return;
    }
    loadLevel(next);
    state.gameState = STATE.PLAYING;
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
    state.gameState = STATE.PLAYING;
    if (state.player.entryBonus > 0) addScore(state.player.entryBonus);
    playEventOpen();
    spawnFloatingText(400, 200, "⚠ BOSS 来袭 ⚠", "#ff8899");
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
    spawnFloatingText(400, 300, "限时挑战开始！", "#ffa94d");
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
            color: "#7dff9b",
        };
        spawnFloatingText(400, 260, "挑战成功！", "#7dff9b");
    } else {
        loseLife(0.5);
        if (state.gameState === STATE.GAME_OVER) return;
        state.eventResult = {
            text: `挑战失败！仅击破 ${broke}/${c.target} 个方块\n损失半条生命`,
            color: "#ff8080",
        };
        spawnFloatingText(400, 260, "挑战失败", "#ff8080");
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
export function update() {
    if (state.gameState !== STATE.PLAYING) return;
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
        if (state.balls.length === 0) {
            loseLife(1);
            if (state.gameState === STATE.PLAYING) resetBall();
        }
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

    if (state.balls.length === 0) {
        loseLife(1);
        if (state.gameState === STATE.PLAYING) {
            resetBall();
        }
    }
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
    for (const s of p.skills) {
        s.cd = Math.max(0, s.cd - 1);
    }
    if (p.slowTill > 0 && state.time > p.slowTill) {
        restoreTimeScale();
    }
}