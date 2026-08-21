import "../css/style.css";

import { W, H, STATE } from "./constants.js";
import { state } from "./state.js";
import { canvas, resize, getCanvasPos } from "./canvas.js";
import { initStars } from "./stars.js";
import {
    resetPlayer,
    resetPaddle,
    resetBall,
    startGameRun,
    continueFromSave,
    handleStartRewardPick,
    handleRewardPick,
    skipReward,
    cancelSkillSwap,
    confirmSkillSwap,
    bossRewardScreen,
    confirmPenaltyPick,
    finishEvent,
    launchBalls,
    tryUseSkill,
    togglePause,
    resumeGame,
    pauseRestart,
    pauseQuitToMenu,
    quitToMenu,
    quitEventToMenu,
    update,
} from "./game.js";
import { updateEffects } from "./fx.js";
import { executeEventChoice } from "./events.js";
import { render } from "./render.js";
import {
    hitStartButton,
    hitContinueButton,
    hitRestartButton,
    hitRewardCard,
    hitSwapCardIndex,
    hitSwapCancel,
    hitEventChoiceIndex,
    hitEventContinueButton,
    hitBossClearButton,
    hitGameOverExitButton,
    hitSkipButton,
    hitPauseResume,
    hitPauseRestart,
    hitPauseQuit,
    hitPenaltyCard,
    hitMenuCodexButton,
    hitMenuSkinButton,
    hitPauseCodexButton,
    hitCodexTab,
    hitCodexNext,
    hitCodexPrev,
} from "./ui.js";
import { initAudio, toggleSound } from "./sound.js";
import { spawnFloatingText } from "./fx.js";
import { setCodexTab, setCodexPage } from "./ui.js";
import { getUnlocks, setSkin, skinDef, getSelectedSkin } from "./unlocks.js";

// ─── 输入 ─────────────────────────────────────────────────
window.addEventListener("resize", resize);
resize();

// 音效开关：按 M 键切换，首次按键时解锁音频；ESC 暂停/退出事件/退出图鉴
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        if (state.gameState === STATE.CODEX) {
            if (state.codexFrom === "pause") {
                state.gameState = STATE.PAUSED;
            } else {
                state.gameState = STATE.MENU;
            }
            state.codexFrom = null;
            return;
        }
        if (state.gameState === STATE.EVENT) {
            // 结果面板上按 ESC = 点击「继续」；选择界面按 ESC 才退出回到主菜单
            if (state.eventResult) {
                finishEvent();
            } else {
                quitEventToMenu();
            }
            return;
        }
        if (state.gameState === STATE.PENALTY) return; // 惩罚为强制选择
        togglePause();
        return;
    }
    // 图鉴内 ← → 翻页
    if (state.gameState === STATE.CODEX) {
        if (e.key === "ArrowLeft") { setCodexPage(-1); return; }
        if (e.key === "ArrowRight") { setCodexPage(1); return; }
    }
    if (e.key === "m" || e.key === "M") {
        initAudio();
        const on = toggleSound();
        spawnFloatingText(W / 2, H / 2 - 60, on ? "音效：开" : "音效：关", on ? "#7dff9b" : "#ff8080");
        return;
    }
    if (state.gameState !== STATE.PLAYING) return;
    if (e.key === "1") tryUseSkill(0);
    if (e.key === "2") tryUseSkill(1);
});

canvas.addEventListener("mousemove", (e) => {
    const pos = getCanvasPos(e);
    state.mouseX = pos.x;
});

canvas.addEventListener(
    "touchstart",
    (e) => {
        e.preventDefault();
        initAudio();
        const pos = getCanvasPos(e.touches[0]);
        state.mouseX = pos.x;

        // Also launch ball if playing
        if (state.gameState === STATE.PLAYING) {
            launchBalls();
        }
    },
    { passive: false }
);

canvas.addEventListener(
    "touchmove",
    (e) => {
        e.preventDefault();
        const pos = getCanvasPos(e.touches[0]);
        state.mouseX = pos.x;
    },
    { passive: false }
);

canvas.addEventListener("click", (e) => {
    initAudio();
    const pos = getCanvasPos(e);

    // 图鉴交互不受防抖限制
    if (state.gameState === STATE.CODEX) {
        const tabIdx = hitCodexTab(pos.x, pos.y);
        if (tabIdx >= 0) {
            setCodexTab(tabIdx);
        } else if (hitCodexNext(pos.x, pos.y)) {
            setCodexPage(1);
        } else if (hitCodexPrev(pos.x, pos.y)) {
            setCodexPage(-1);
        }
        return;
    }

    if (Date.now() < (state.uiLockUntil || 0)) return;
    const lock = () => {
        state.uiLockUntil = Date.now() + 250;
    };

    if (state.gameState === STATE.MENU) {
        if (hitContinueButton(pos.x, pos.y)) {
            lock();
            continueFromSave();
        } else if (hitStartButton(pos.x, pos.y)) {
            lock();
            startGameRun();
        } else if (hitMenuCodexButton(pos.x, pos.y)) {
            lock();
            state.codexFrom = "menu";
            state.gameState = STATE.CODEX;
        } else if (hitMenuSkinButton(pos.x, pos.y)) {
            lock();
            // 循环切换皮肤（含默认 -1）
            const unlocks = getUnlocks();
            const cur = getSelectedSkin();
            const unlocked = [-1, 0, 1, 2].filter(i => i < 0 || unlocks.tiers[i]);
            if (unlocked.length > 0) {
                const idx = (unlocked.indexOf(cur) + 1) % unlocked.length;
                setSkin(unlocked[idx]);
                const sk = skinDef(unlocked[idx]);
                spawnFloatingText(W / 2, H / 2 - 40, `皮肤: ${sk.name}`, sk.paddle1);
            }
        }
        return;
    }

    if (state.gameState === STATE.START_REWARD) {
        const def = hitRewardCard(pos.x, pos.y);
        if (def) {
            lock();
            handleStartRewardPick(def);
        }
        return;
    }

    if (state.gameState === STATE.LEVEL_REWARD) {
        const def = hitRewardCard(pos.x, pos.y);
        if (def) {
            lock();
            handleRewardPick(def);
        } else if (hitSkipButton(pos.x, pos.y)) {
            lock();
            skipReward();
        }
        return;
    }

    if (state.gameState === STATE.SKILL_SWAP) {
        const idx = hitSwapCardIndex(pos.x, pos.y);
        if (idx >= 0) {
            lock();
            confirmSkillSwap(idx);
        } else if (hitSwapCancel(pos.x, pos.y)) {
            lock();
            cancelSkillSwap();
        }
        return;
    }

    if (state.gameState === STATE.EVENT) {
        // 结果面板：点击继续才离开事件房
        if (state.eventResult) {
            if (hitEventContinueButton(pos.x, pos.y)) {
                lock();
                finishEvent();
            }
            return;
        }
        const idx = hitEventChoiceIndex(pos.x, pos.y);
        if (idx >= 0) {
            lock();
            executeEventChoice(idx);
        }
        return;
    }

    if (state.gameState === STATE.PENALTY) {
        const idx = hitPenaltyCard(pos.x, pos.y);
        if (idx >= 0) {
            lock();
            confirmPenaltyPick(idx);
        }
        return;
    }

    if (state.gameState === STATE.PAUSED) {
        if (hitPauseResume(pos.x, pos.y)) {
            lock();
            resumeGame();
        } else if (hitPauseRestart(pos.x, pos.y)) {
            lock();
            pauseRestart();
        } else if (hitPauseQuit(pos.x, pos.y)) {
            lock();
            pauseQuitToMenu();
        } else if (hitPauseCodexButton(pos.x, pos.y)) {
            lock();
            state.codexFrom = "pause";
            state.gameState = STATE.CODEX;
        }
        return;
    }

    if (state.gameState === STATE.BOSS_CLEAR) {
        if (hitBossClearButton(pos.x, pos.y)) {
            lock();
            bossRewardScreen();
        }
        return;
    }

    if (state.gameState === STATE.GAME_OVER || state.gameState === STATE.VICTORY) {
        if (hitRestartButton(pos.x, pos.y)) {
            lock();
            startGameRun();
        } else if (hitGameOverExitButton(pos.x, pos.y)) {
            lock();
            quitToMenu();
        }
        return;
    }

    // Playing - launch ball
    if (state.gameState === STATE.PLAYING) {
        launchBalls();
    }
});

// ─── 初始化 ───────────────────────────────────────────────
function init() {
    initStars();
    resetPlayer();
    resetPaddle();
    resetBall();
    state.blocks = [];
    state.particles = [];
    state.rings = [];
    state.floatingTexts = [];
    state.boss = null;
    state.bossBullets = [];
    state.enemyBullets = [];
    state.mouseX = W / 2;
    state.gameState = STATE.MENU;
}

init();

// ─── 游戏主循环（带异常保护，防止卡死） ────────────────────
function gameLoop(ts) {
    try {
        update(ts);
        updateEffects();
        render();
    } catch (err) {
        console.error("Game loop error:", err);
    }
    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);