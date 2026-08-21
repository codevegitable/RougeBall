// 分数解锁系统：累积分数解锁皮肤与奖励
const KEY = "bounceRoguelikeUnlocks";
const SCORE_KEY = "bounceRoguelikeHighScore";
const TIERS = [
    { score: 6000, skin: "emerald", rewards: 2 },
    { score: 20000, skin: "crimson", rewards: 2 },
    { score: 40000, skin: "golden", rewards: 2 },
];

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
    const defs = [
        { name: "默认", paddle1: "#8b3a8b", paddle2: "#c060a0", glow: "rgba(192,96,160,0.55)", skill: null },
        { name: "翡翠守卫", paddle1: "#3f8f5f", paddle2: "#57b98a", glow: "rgba(79,175,90,0.55)", skill: "jade_barrier" },
        { name: "绯红之刃", paddle1: "#c03a4a", paddle2: "#e06a7a", glow: "rgba(224,106,122,0.55)", skill: "swift_blade" },
        { name: "金辉霸主", paddle1: "#d9a441", paddle2: "#f2cd6e", glow: "rgba(242,205,110,0.55)", skill: "golden_blessing" },
    ];
    return defs[tierIndex + 1] || defs[0];
}

// 皮肤开场技能定义（中文名称）
export const SKIN_START_SKILLS = {
    jade_barrier: { id: "jade_barrier", name: "翡翠屏障", icon: "🟢", cooldown: 35, desc: "5 秒内受击不扣血", use: "shield_5s" },
    swift_blade: { id: "swift_blade", name: "迅捷之刃", icon: "🔴", cooldown: 30, desc: "5 秒内球伤害 ×1.5", use: "strike_5s" },
    golden_blessing: { id: "golden_blessing", name: "黄金祝福", icon: "🟡", cooldown: 35, desc: "立即获得 500 分，8 秒内分数 ×2", use: "wealth_8s" },
};

// 默认皮肤颜色
export const DEFAULT_SKIN_COLORS = { paddle1: "#8b3a8b", paddle2: "#c060a0", glow: "rgba(192,96,160,0.55)" };

// 奖励是否已解锁（前 6 个新奖励对应 tier 1/2/3，各 2 个）
const REWARD_TIER_MAP = {
    guardian_core: 0, greed_eye: 0,
    vampiric_gem: 1, rapid_cooling: 1,
    titan_ball: 2, blessed_start: 2,
    // 解锁技能映射
    jade_stars: 0, jade_shield: 0,
    crimson_storm: 1, blood_siphon: 1,
    golden_shield: 2, wealth_rain: 2,
};

export function isRewardUnlocked(rewardId) {
    const tier = REWARD_TIER_MAP[rewardId];
    if (tier === undefined) return true;
    const d = load();
    return d.tiers[tier];
}