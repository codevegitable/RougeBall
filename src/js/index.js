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
    cancelSkillSwap,
    confirmSkillSwap,
    bossRewardScreen,
    finishEvent,
    launchBalls,
    tryUseSkill,
    togglePause,
    resumeGame,
    pauseRestart,
    pauseQuitToMenu,
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
    hitPauseResume,
    hitPauseRestart,
    hitPauseQuit,
} from "./ui.js";
import { initAudio, toggleSound } from "./sound.js";
import { spawnFloatingText } from "./fx.js";

// ─── 输入 ─────────────────────────────────────────────────
window.addEventListener("resize", resize);
resize();

// 音效开关：按 M 键切换，首次按键时解锁音频；ESC 暂停/退出事件
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        if (state.gameState === STATE.EVENT) {
            quitEventToMenu();
            return;
        }
        togglePause();
        return;
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

    if (state.gameState === STATE.MENU) {
        if (hitContinueButton(pos.x, pos.y)) {
            continueFromSave();
        } else if (hitStartButton(pos.x, pos.y)) {
            startGameRun();
        }
        return;
    }

    if (state.gameState === STATE.START_REWARD) {
        const def = hitRewardCard(pos.x, pos.y);
        if (def) handleStartRewardPick(def);
        return;
    }

    if (state.gameState === STATE.LEVEL_REWARD) {
        const def = hitRewardCard(pos.x, pos.y);
        if (def) handleRewardPick(def);
        return;
    }

    if (state.gameState === STATE.SKILL_SWAP) {
        const idx = hitSwapCardIndex(pos.x, pos.y);
        if (idx >= 0) {
            confirmSkillSwap(idx);
        } else if (hitSwapCancel(pos.x, pos.y)) {
            cancelSkillSwap();
        }
        return;
    }

    if (state.gameState === STATE.EVENT) {
        // 结果面板：点击继续才离开事件房
        if (state.eventResult) {
            if (hitEventContinueButton(pos.x, pos.y)) {
                finishEvent();
            }
            return;
        }
        const idx = hitEventChoiceIndex(pos.x, pos.y);
        if (idx >= 0) {
            executeEventChoice(idx);
        }
        return;
    }

    if (state.gameState === STATE.PAUSED) {
        if (hitPauseResume(pos.x, pos.y)) {
            resumeGame();
        } else if (hitPauseRestart(pos.x, pos.y)) {
            pauseRestart();
        } else if (hitPauseQuit(pos.x, pos.y)) {
            pauseQuitToMenu();
        }
        return;
    }

    if (state.gameState === STATE.BOSS_CLEAR) {
        if (hitBossClearButton(pos.x, pos.y)) {
            bossRewardScreen();
        }
        return;
    }

    if (state.gameState === STATE.GAME_OVER || state.gameState === STATE.VICTORY) {
        if (hitRestartButton(pos.x, pos.y)) {
            startGameRun();
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

// ─── 游戏主循环 ───────────────────────────────────────────
function gameLoop() {
    update();
    updateEffects();
    render();
    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);