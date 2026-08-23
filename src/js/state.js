import { STATE, W } from "./constants.js";
import { playGameOver } from "./sound.js";
import { registerScore } from "./unlocks.js";
import { PAL } from "./palette.js";

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
    bossDangerZones: [], // 地面危险区 {x,y,r,life,type}
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
    curseChoices: [], // 诅咒三选一列表
    curseStrength: 0, // 诅咒强度
    pendingBossCurse: false, // 待选择 Boss 诅咒
    uiLockUntil: 0, // 点击防抖时间戳
    guide: null, // 当前展示的新手引导 {id, shownAt}
    guideQueue: [], // 待展示的引导 id 队列（多条同时触发时逐条展示）
    breakCounter: 0, // 击碎方块全局计数，每 10 个生成一个新球
    time: 0, // 全局帧计数
    dt: 1, // 本帧相对 60fps 的时间倍率（帧率无关物理）
    lastTs: 0,
    codexFrom: null, // 图鉴入口记录（"menu" / "pause"）
    codexItem: null, // 图鉴中被选中查看详情的条目（敌人数据等）
};

// ─── 记分（含分数倍率 + 解锁进度） ───────────────────────
export function addScore(n) {
    if (!state.player) return;
    const mul = state.player.scoreMul || 1;
    const added = Math.round(n * mul);
    state.player.score += added;
    const tier = registerScore(added);
    if (tier >= 0) {
        const names = ["悲叹", "狂怒", "终焉"];
        state.floatingTexts.push({
            x: 400, y: 200, text: `解锁 tier ${tier + 1}：${names[tier]}`,
            color: PAL.gold2, life: 1, vy: -0.8,
        });
    }
}

// ─── 扣血（含死亡判定） ───────────────────────────────────
export function loseLife(n = 1) {
    const p = state.player;
    if (!p) return;
    if (state.gameState !== STATE.PLAYING && state.gameState !== STATE.EVENT) return;
    // 不屈：受到致命伤害时保留 1 条命，每局触发一次
    if (p.lives <= n && p.perks?.init_tenacity > 0 && !p.tenacityUsed) {
        p.tenacityUsed = 1;
        p.lives = 1;
        state.floatingTexts.push({ x: 400, y: 260, text: "不屈！保留 1 条命", color: PAL.moss3, life: 1.5, vy: -0.5 });
        return;
    }
    p.lives = Math.max(0, p.lives - n);
    if (p.lives <= 0) {
        state.gameState = STATE.GAME_OVER;
        playGameOver();
    }
}