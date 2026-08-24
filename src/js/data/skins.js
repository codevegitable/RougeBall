// ═══ 皮肤与解锁数据（纯数据） ═══

// 解锁层级：达到 score 分时解锁对应皮肤 + 奖励
export const UNLOCK_TIERS = [
    { score: 30000, skin: "emerald", name: "悲叹" },
    { score: 60000, skin: "crimson", name: "狂怒" },
    { score: 120000, skin: "golden", name: "终焉" },
];

// 皮肤定义（index -1 为默认皮肤）
// 颜色取自 palette.js 的受限调色板：paddle1=主体，paddle2=顶部高光
export const SKIN_DEFS = [
    { name: "默认", paddle1: "#a464c4", paddle2: "#cfa0e4", glow: "#cfa0e4", skill: null },
    { name: "翡翠守卫", paddle1: "#37704c", paddle2: "#63a563", glow: "#95d38c", skill: "jade_barrier" },
    { name: "绯红之刃", paddle1: "#8c2e38", paddle2: "#cf4455", glow: "#f07d84", skill: "swift_blade" },
    { name: "金辉霸主", paddle1: "#a87c27", paddle2: "#e0af38", glow: "#f7dc8c", skill: "golden_blessing" },
];

// 皮肤开场技能（引用 rewards 数据中的技能 id）
export const SKIN_START_SKILLS = {
    jade_barrier: { id: "jade_barrier", name: "翡翠屏障", icon: "🟢", cooldown: 35, desc: "5 秒内受击不扣血" },
    swift_blade: { id: "swift_blade", name: "迅捷之刃", icon: "🔴", cooldown: 30, desc: "5 秒内球伤害 ×1.5" },
    golden_blessing: { id: "golden_blessing", name: "黄金祝福", icon: "🟡", cooldown: 35, desc: "立即获得 500 分，8 秒内分数 ×2" },
};
