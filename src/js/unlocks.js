// 分数解锁系统逻辑：累积分数解锁皮肤与奖励
import { UNLOCK_TIERS, SKIN_DEFS, SKIN_START_SKILLS } from "./data/skins.js";
import { REWARD_DATA } from "./data/rewards.js";

const KEY = "bounceRoguelikeUnlocks";
const SCORE_KEY = "bounceRoguelikeHighScore";
const TIERS = UNLOCK_TIERS;

export const TOTAL_TIERS = TIERS.length;

const DEFAULT_DATA = { totalScore: 0, tiers: [false, false, false], selectedSkin: -1 };

function load() {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) return { ...DEFAULT_DATA, ...JSON.parse(raw) };
    } catch (e) { /* ignore */ }
    return { ...DEFAULT_DATA };
}

function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
}

export function getUnlocks() {
    return load();
}

export function getSelectedSkin() {
    return load().selectedSkin;
}

export function setSkin(index) {
    const d = load();
    if (index < 0 || d.tiers[index]) d.selectedSkin = index;
    save(d);
}

export function registerScore(amount) {
    const d = load();
    d.totalScore += amount;
    // 更新最高分
    updateHighScore(d.totalScore);
    let newTier = -1;
    for (let i = 0; i < TIERS.length; i++) {
        if (!d.tiers[i] && d.totalScore >= TIERS[i].score) {
            d.tiers[i] = true;
            newTier = i;
        }
    }
    if (newTier >= 0) {
        if (TOTAL_TIERS > 0) d.selectedSkin = newTier;
        save(d);
        return newTier;
    }
    save(d);
    return -1;
}

function updateHighScore(score) {
    try {
        const prev = parseInt(localStorage.getItem(SCORE_KEY) || "0", 10);
        if (score > prev) localStorage.setItem(SCORE_KEY, String(score));
    } catch (e) { /* ignore */ }
}

export function getHighScore() {
    try { return parseInt(localStorage.getItem(SCORE_KEY) || "0", 10); } catch { return 0; }
}

export function skinDef(tierIndex) {
    // tierIndex: -1=默认, 0=翡翠, 1=绯红, 2=金辉
    return SKIN_DEFS[tierIndex + 1] || SKIN_DEFS[0];
}

// 皮肤开场技能定义（re-export 保持原接口）
export { SKIN_START_SKILLS };

// 默认皮肤颜色
export const DEFAULT_SKIN_COLORS = SKIN_DEFS[0]
    ? { paddle1: SKIN_DEFS[0].paddle1, paddle2: SKIN_DEFS[0].paddle2, glow: SKIN_DEFS[0].glow }
    : { paddle1: "#633a86", paddle2: "#a464c4", glow: "#cfa0e4" };

// 奖励解锁层级映射（由奖励数据的 tierLock 字段自动推导）
const REWARD_TIER_MAP = Object.fromEntries(
    REWARD_DATA.filter((r) => r.tierLock !== undefined).map((r) => [r.id, r.tierLock])
);

export function isRewardUnlocked(rewardId) {
    const tier = REWARD_TIER_MAP[rewardId];
    if (tier === undefined) return true;
    const d = load();
    return d.tiers[tier];
}