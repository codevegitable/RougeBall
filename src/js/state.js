import { STATE, W } from "./constants.js";
import { playGameOver } from "./sound.js";

// 全局共享的可变游戏状态
export const state = {
    gameState: STATE.MENU,
    player: null,
    paddle: null,
    balls: [],
    blocks: [],
    particles: [],
    stars: [],
    mouseX: W / 2,
    // 打击感特效
    shakeTime: 0,
    shakePower: 0,
    freeze: 0, // 顿帧剩余帧数
    rings: [], // 冲击波圆环
    floatingTexts: [], // 漂浮文字
    // Boss 与敌弹
    boss: null,
    bossBullets: [],
    enemyBullets: [],
    invulnTimer: 0, // 受击无敌帧
    hurtTimer: 0, // 受击红闪帧
    // 界面选择
    levelChoices: [],
    rewardTitle: "",
    rareOnly: false,
    pendingSkillDef: null,
    currentEvent: null,
    eventResult: null, // 事件结果面板内容 {text, color}
    pendingChallenge: false, // 事件选择了限时挑战
    challenge: null, // 限时挑战数据 {limit, target, initialBreakable}
    time: 0, // 全局帧计数
};

// ─── 记分（含分数倍率） ───────────────────────────────────
export function addScore(n) {
    if (!state.player) return;
    const mul = state.player.scoreMul || 1;
    state.player.score += Math.round(n * mul);
}

// ─── 扣血（含死亡判定） ───────────────────────────────────
export function loseLife(n = 1) {
    const p = state.player;
    if (!p) return;
    if (state.gameState !== STATE.PLAYING && state.gameState !== STATE.EVENT) return;
    p.lives = Math.max(0, p.lives - n);
    if (p.lives <= 0) {
        state.gameState = STATE.GAME_OVER;
        playGameOver();
    }
}