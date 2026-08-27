import "../css/style.css";
import "../css/fonts.css";

import { W, H, STATE } from "./constants.js";
import { state } from "./state.js";
import { canvas, resize, getCanvasPos } from "./canvas.js";
import { initStars } from "./stars.js";
import {
    resetPlayer,
    resetPaddle,
    resetBall,
    startGameRun,
    proceedBossRush,
    continueFromSave,
    handleStartRewardPick,
    handleRewardPick,
    skipReward,
    cancelSkillSwap,
    confirmSkillSwap,
    confirmCursePick,
    bossRewardScreen,
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
    proceedToNextLevel,
    stayInLevel,
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
    hitCurseCard,
    hitPauseResume,
    hitPauseRestart,
    hitPauseQuit,
    hitMenuCodexButton,
    hitMenuSkinButton,
    hitMenuSettingsButton,
    hitSettingsBackButton,
    handleSettingsClick,
    hitPauseCodexButton,
    hitPauseStatusButton,
    hitCodexTab,
    hitStatusTab,
    hitStatusBack,
    hitCodexNext,
    hitCodexPrev,
    hitCodexItem,
    hitCodexBackButton,
    hitLevelCompleteProceed,
    hitLevelCompleteStay,
} from "./ui.js";
import { initAudio, toggleSound } from "./sound.js";
import { spawnFloatingText } from "./fx.js";
import { setCodexTab, setCodexPage, setStatusTab, setStatusPage } from "./ui.js";
import { getUnlocks, setSkin, skinDef, getSelectedSkin } from "./unlocks.js";
import { loadSettings, applySettings } from "./settings.js";
import { dismissGuide, guideReadyToDismiss } from "./tutorial.js";
import { GAME_CONFIG } from "./config.js";
import { REWARDS, recalcStats } from "./rewards.js";
import { CURSES_MAP } from "./curses.js";
import { PAL } from "./palette.js";
import { initPixelMode } from "./pixel.js";

// ─── 开发者模式（SHA256 哈希验证）──────────────────────────
const DEV_HASH = "2323971fc86c511995dde7ab4d12cedff0e9e5772c17d420bb3b1ab5d358301c";
let devInputBuffer = "";

async function sha256(str) {
    const enc = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─── 魂斗罗秘籍检测 ───────────────────────────────────────
const KONAMI_CODE = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
let konamiIndex = 0;
let konamiActive = false;

function checkKonami(e) {
    const key = e.key;
    // 忽略大写/小写差异
    const expected = KONAMI_CODE[konamiIndex];
    if (key === expected || (expected === "b" && (key === "B" || key === "b")) || (expected === "a" && (key === "A" || key === "a"))) {
        konamiIndex++;
        if (konamiIndex >= KONAMI_CODE.length) {
            konamiIndex = 0;
            if (!konamiActive) {
                konamiActive = true;
                activateKonamiCode();
            }
        }
    } else {
        konamiIndex = 0;
    }
}

function activateKonamiCode() {
    if (state.gameState !== STATE.PLAYING && state.gameState !== STATE.MENU) return;
    if (state.gameState === STATE.MENU) {
        startGameRun();
    }
    doKonami();
}

function doKonami() {
    const p = state.player;
    if (!p) return;
    // 给予所有可获得的奖励
    const allRewards = REWARDS.filter(r => !r.bossOnly && !r.skinOnly && r.type !== "skill");
    for (const r of allRewards) {
        const count = r.maxStacks || 1;
        p.perks[r.id] = (p.perks[r.id] || 0) + count;
        if (r.apply) r.apply();
    }
    // 技能: 给予所有技能（最多2个）
    const allSkills = REWARDS.filter(r => r.type === "skill" && !r.skinOnly && !r.bossOnly);
    for (const s of allSkills.slice(0, 2)) {
        if (!p.skills.some(sk => sk.id === s.id)) {
            p.skills.push({ id: s.id, cd: 0 });
        }
    }
    recalcStats();
    p.lives = 30;
    p.score = 30000;
    // 进入 Boss Rush 模式
    state._bossRush = 0; // 已击败的 Boss 索引
    spawnFloatingText(400, 200, "🔓 魂斗罗秘籍激活！30 条命 + 全奖励", PAL.gold3);
    spawnFloatingText(400, 240, "Boss Rush 模式启动！", PAL.blood2);
    // 跳转到第一个 Boss
    proceedBossRush();
}

// ─── 输入 ─────────────────────────────────────────────────
window.addEventListener("resize", resize);
resize();

// 音效开关：按 M 键切换，首次按键时解锁音频；ESC 暂停/退出事件/退出图鉴
window.addEventListener("keydown", (e) => {
    // 魂斗罗秘籍检测
    checkKonami(e);
    // 引导展示期间：仅响应关闭引导的按键，其余全部拦截
    if (state.guide) {
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (guideReadyToDismiss()) dismissGuide();
        }
        return;
    }
    // 开发者模式输入检测（不拦截游戏按键）
    if (e.key === "Enter" && devInputBuffer.length > 0) {
        e.preventDefault();
        checkDevMode(devInputBuffer);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        devInputBuffer += e.key;
        if (devInputBuffer.length > 100) devInputBuffer = devInputBuffer.slice(-100);
    }
    if (e.key === "Escape") {
        if (state.gameState === STATE.CODEX) {
            if (state.codexItem) {
                state.codexItem = null;
                return;
            }
            if (state.codexFrom === "pause") {
                state.gameState = STATE.PAUSED;
            } else {
                state.gameState = STATE.MENU;
            }
            state.codexFrom = null;
            return;
        }
        if (state.gameState === STATE.SETTINGS) {
            state.gameState = STATE.MENU;
            return;
        }
        if (state.gameState === STATE.STATUS) {
            state.gameState = STATE.PAUSED;
            return;
        }
        if (state.gameState === STATE.DEV_MODE) {
            state.gameState = STATE.MENU;
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
        togglePause();
        return;
    }
    // 图鉴内 ← → 翻页
    if (state.gameState === STATE.CODEX) {
        if (e.key === "ArrowLeft") { setCodexPage(-1); return; }
        if (e.key === "ArrowRight") { setCodexPage(1); return; }
    }
    // 角色状态：← → 在当前分页内翻页，1~4 直接切分页
    if (state.gameState === STATE.STATUS) {
        if (e.key === "ArrowLeft") { setStatusPage(-1); return; }
        if (e.key === "ArrowRight") { setStatusPage(1); return; }
        if (e.key >= "1" && e.key <= "4") { setStatusTab(Number(e.key) - 1); return; }
    }
    if (e.key === "m" || e.key === "M") {
        initAudio();
        const on = toggleSound();
        spawnFloatingText(W / 2, H / 2 - 60, on ? "音效：开" : "音效：关", on ? PAL.moss3 : PAL.blood3);
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

        // 引导期间：关闭引导，不透传
        if (state.guide) {
            if (guideReadyToDismiss()) dismissGuide();
            return;
        }

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

    // 引导期间：点击关闭引导，不透传给下层界面
    if (state.guide) {
        if (guideReadyToDismiss()) dismissGuide();
        return;
    }

    // 图鉴交互不受防抖限制
    if (state.gameState === STATE.CODEX) {
        // 详情页的返回按钮
        if (state.codexItem) {
            if (hitCodexBackButton(pos.x, pos.y)) {
                state.codexItem = null;
            }
            return;
        }
        const tabIdx = hitCodexTab(pos.x, pos.y);
        if (tabIdx >= 0) {
            setCodexTab(tabIdx);
        } else if (hitCodexNext(pos.x, pos.y)) {
            setCodexPage(1);
        } else if (hitCodexPrev(pos.x, pos.y)) {
            setCodexPage(-1);
        } else {
            // 点击条目查看详情
            const item = hitCodexItem(pos.x, pos.y);
            if (item && !item.locked) state.codexItem = item;
        }
        return;
    }

    // 角色状态：切换分页同样不受防抖限制，否则连点两个 tab 会吞掉第二次
    if (state.gameState === STATE.STATUS) {
        const tabIdx = hitStatusTab(pos.x, pos.y);
        if (tabIdx >= 0) {
            setStatusTab(tabIdx);
        } else if (hitStatusBack(pos.x, pos.y)) {
            state.gameState = STATE.PAUSED;
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
        } else if (hitMenuSettingsButton(pos.x, pos.y)) {
            lock();
            state.codexFrom = "menu";
            state.gameState = STATE.SETTINGS;
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

    if (state.gameState === STATE.CURSE_SELECT) {
        const idx = hitCurseCard(pos.x, pos.y);
        if (idx >= 0) {
            lock();
            confirmCursePick(idx);
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
        } else if (hitPauseStatusButton(pos.x, pos.y)) {
            lock();
            state.gameState = STATE.STATUS;
        }
        return;
    }

    if (state.gameState === STATE.SETTINGS) {
        handleSettingsClick(pos.x, pos.y);
        if (hitSettingsBackButton(pos.x, pos.y)) {
            state.gameState = STATE.MENU;
        }
        return;
    }

    if (state.gameState === STATE.LEVEL_COMPLETE) {
        if (hitLevelCompleteProceed(pos.x, pos.y)) {
            lock();
            proceedToNextLevel();
        } else if (hitLevelCompleteStay(pos.x, pos.y)) {
            lock();
            stayInLevel();
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
    // 像素模式：关闭画布平滑，必须在任何绘制前调用
    initPixelMode();
    // 应用持久化设置
    const s = loadSettings();
    applySettings(s, GAME_CONFIG);
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