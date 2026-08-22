import { RARITY, MAX_SKILLS } from "./constants.js";
import { state, addScore, loseLife } from "./state.js";
import { REWARDS, applyReward } from "./rewards.js";
import { playHeal, playEventGood, playEventBad } from "./sound.js";
import { rollCurse, applyCurseStack, rollHeavyCurse, applyHeavyCurse } from "./curses.js";
import { EVENT_DATA } from "./data/events.js";
import { PAL } from "./palette.js";

function filterPool(rarity) {
    const p = state.player;
    const pool = REWARDS.filter((r) => {
        if (r.bossOnly) return false; // Boss 专属不进事件池
        if (r.type === "skill") {
            if (p.skills.length >= MAX_SKILLS) return false;
            return !p.skills.some((s) => s.id === r.id);
        }
        return (r.maxStacks ?? 1) > (p.perks[r.id] || 0);
    });
    const filtered = rarity ? pool.filter((r) => r.rarity === rarity) : pool;
    return filtered.length > 0 ? filtered : pool;
}

function pickFrom(src) {
    return src.length > 0 ? src[Math.floor(Math.random() * src.length)] : null;
}

// 打包指定稀有度的单个随机奖励（null = 任意稀有度）
function rollBundle(rarity) {
    return pickFrom(filterPool(rarity));
}

// 不出技能，仅加成/能力
function rollBundleNoSkill(rarity) {
    return pickFrom(filterPool(rarity).filter((r) => r.type !== "skill"));
}

// 仅被动能力，至少罕见品质（罕见或稀有）
function rollBundleAbilityOnly() {
    const pool = filterPool(null).filter((r) => r.type === "ability" && r.rarity !== RARITY.COMMON);
    return pickFrom(pool);
}

// 立即获得一个随机奖励（供事件与限时挑战使用）
export function grantEventReward(rarity) {
    const def = rollBundle(rarity);
    if (def) applyReward(def);
    return def;
}

// 奖励的说明文本（图标 + 名称 + 效果）
export function describeReward(def) {
    if (!def) return "无";
    return `${def.icon} ${def.name}：${def.desc}`;
}

const LEAVE_TEXT = "你离开了事件房";

// ─── 事件行为解释器 ───────────────────────────────────────
// 每种 action.kind 对应一个执行函数，返回 {text, color}
const ACTION_RUNNERS = {
    buy(a) {
        state.player.score -= a.cost;
        const def = grantEventReward(a.rarity);
        playEventGood();
        return { text: `交易完成！\n获得罕见奖励：${describeReward(def)}`, color: "#5aa7ff" };
    },
    leave() {
        playEventBad();
        return { text: LEAVE_TEXT, color: PAL.stone3 };
    },
    challenge() {
        state.pendingChallenge = true;
        playEventGood();
        return { text: "挑战即将开始！点击继续进入战斗", color: PAL.ember2 };
    },
    gamble(a) {
        if (Math.random() < 0.5) {
            const def = grantEventReward(a.rarity);
            playEventGood();
            return { text: `赢了！获得罕见奖励：\n${describeReward(def)}`, color: "#5aa7ff" };
        }
        const curse = rollCurse();
        applyCurseStack(curse.id, 1, state.player);
        playEventBad();
        return { text: `输了……获得诅咒：${curse.icon} ${curse.name}`, color: PAL.blood3 };
    },
    heal(a) {
        state.player.lives += a.amount * (state.player.healMul || 1);
        playHeal();
        return { text: `生命 +${a.amount}，身体重新充满活力`, color: PAL.moss3 };
    },
    sacrifice(a) {
        if (state.player.lives <= 1) {
            return { text: "生命不足，无法献祭", color: PAL.blood3 };
        }
        loseLife(a.costLives);
        const r1 = grantEventReward(a.rarity);
        const r2 = grantEventReward(a.rarity);
        playEventGood();
        return {
            text: `获得普通奖励：\n${describeReward(r1)}\n${describeReward(r2)}`,
            color: "#b8c0cc",
        };
    },
    voidGamble(a) {
        if (Math.random() < 0.6) {
            const def = grantEventReward(null);
            playEventGood();
            return { text: `获得神秘奖励：\n${describeReward(def)}`, color: PAL.gold3 };
        }
        state.player.score = Math.max(0, state.player.score - a.scoreCost);
        playEventBad();
        return { text: `分数 -${a.scoreCost / 10}（被裂缝吞噬）`, color: PAL.blood3 };
    },
    blessing() {
        state.player.rewardBoost = RARITY.UNCOMMON;
        playEventGood();
        return { text: "下次奖励至少为罕见品质！", color: "#5aa7ff" };
    },
    tradeLife(a) {
        if (state.player.lives <= 1) {
            return { text: "生命不足，无法交易", color: PAL.blood3 };
        }
        loseLife(a.costLives);
        const def = grantEventReward(a.rarity);
        playEventGood();
        return { text: `获得稀有奖励：\n${describeReward(def)}`, color: PAL.gold3 };
    },
    score(a) {
        addScore(a.amount);
        playEventGood();
        return { text: `分数 +${a.amount / 10}，精神焕发`, color: PAL.gold3 };
    },
    rewardNoSkill(a) {
        const def = rollBundleNoSkill(a.rarity);
        if (def) applyReward(def);
        playEventGood();
        return { text: `附魔完成！\n获得罕见奖励：${describeReward(def)}`, color: "#6d97d8" };
    },
    cooldownCut(a) {
        const reduce = a.seconds * 60;
        for (const s of state.player.skills) {
            s.cd = Math.max(0, s.cd - reduce);
        }
        playEventGood();
        const names = state.player.skills.map((s) => {
            const def = REWARDS.find((r) => r.id === s.id);
            return def ? def.name : "";
        }).filter(Boolean).join(" · ");
        return {
            text: names ? `技能 CD -${a.seconds}s：${names}` : "当前没有装备技能，时光流逝……",
            color: "#6d97d8",
        };
    },
    well(a) {
        state.player.score -= a.cost;
        const def = rollBundleNoSkill(a.rarity);
        if (def) applyReward(def);
        playEventGood();
        return { text: describeReward(def), color: a.rarity === "common" ? "#9aa1ad" : a.rarity === "uncommon" ? "#6d97d8" : "#e0b84f" };
    },
    abilityOnly() {
        const def = rollBundleAbilityOnly();
        if (def) applyReward(def);
        playEventGood();
        const c = def ? "#e0b84f" : PAL.stone3;
        return { text: `领悟了新的能力：\n${describeReward(def)}`, color: c };
    },
    sealedRoom() {
        const def = grantEventReward(RARITY.RARE);
        const hc = rollHeavyCurse();
        applyHeavyCurse(hc.id, state.player);
        playEventGood();
        return {
            text: `获得稀有奖励：${describeReward(def)}\n获得重诅咒：${hc.icon} ${hc.name}：${hc.desc()}`,
            color: "#e0b84f",
        };
    },
};

// 组装事件定义（绑定 need / apply 行为）
export const EVENTS = EVENT_DATA.map((ev) => ({
    ...ev,
    choices: ev.choices.map((ch) => ({
        ...ch,
        need: ch.needScore !== undefined
            ? () => state.player.score >= ch.needScore
            : undefined,
        apply: () => {
            const runner = ACTION_RUNNERS[ch.action.kind] || ACTION_RUNNERS.leave;
            return runner(ch.action);
        },
    })),
}));

export function pickEvent() {
    return EVENTS[Math.floor(Math.random() * EVENTS.length)];
}

// 执行选项，成功则记录结果面板内容
export function executeEventChoice(index) {
    const ev = state.currentEvent;
    if (!ev) return false;
    const choice = ev.choices[index];
    if (!choice) return false;
    if (choice.need && !choice.need()) {
        state.eventResult = { text: "条件不满足，无法选择", color: PAL.blood3 };
        return false;
    }
    const res = choice.apply();
    state.eventResult = res || { text: "事件结束", color: PAL.stone3 };
    return true;
}

export function clearEvent() {
    state.currentEvent = null;
    state.eventResult = null;
}