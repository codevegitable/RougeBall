// ═══ 皮肤与解锁数据（纯数据） ═══

// 解锁层级：达到 score 分时解锁对应皮肤 + 奖励
export const UNLOCK_TIERS = [
    { score: 30000, skin: "emerald", name: "悲叹" },
    { score: 60000, skin: "crimson", name: "狂怒" },
    { score: 120000, skin: "golden", name: "终焉" },
];

// 皮肤定义（index -1 为默认皮肤）
export const SKIN_DEFS = [
    { name: "默认", paddle1: "#8b3a8b", paddle2: "#c060a0", glow: "rgba(192,96,160,0.55)", skill: null },
    { name: "翡翠守卫", paddle1: "#3f8f5f", paddle2: "#57b98a", glow: "rgba(79,175,90,0.55)", skill: "jade_barrier" },
    { name: "绯红之刃", paddle1: "#c03a4a", paddle2: "#e06a7a", glow: "rgba(224,106,122,0.55)", skill: "swift_blade" },
    { name: "金辉霸主", paddle1: "#d9a441", paddle2: "#f2cd6e", glow: "rgba(242,205,110,0.55)", skill: "golden_blessing" },
];

// 皮肤开场技能（引用 rewards 数据中的技能 id）
export const SKIN_START_SKILLS = {
    jade_barrier: { id: "jade_barrier", name: "翡翠屏障", icon: "🟢", cooldown: 35, desc: "5 秒内受击不扣血" },
    swift_blade: { id: "swift_blade", name: "迅捷之刃", icon: "🔴", cooldown: 30, desc: "5 秒内球伤害 ×1.5" },
    golden_blessing: { id: "golden_blessing", name: "黄金祝福", icon: "🟡", cooldown: 35, desc: "立即获得 500 分，8 秒内分数 ×2" },
};

// 皮肤图标
export const SKIN_ICONS = ["🎨", "🟢", "🔴", "🟡"];