// ═══ Boss 数据（纯数据） ═══
// bossType: executor近战导师 / mother腐化母体 / hive机械蜂巢 / priest诅咒司祭 / final终焉聚合
// skills: 可用技能池（冲锋/跳砸/召唤/大招）
// patterns: 弹幕模式（辅助威胁）

export const BOSS_CANDIDATES = {
    10: [
        {
            name: "铁壁执行者", color: "#6a80d4", hp: 80, bulletSpeed: 1.35,
            bossType: "executor", tier: 0,
            skills: ["charge", "slam"],
            patterns: ["fan", "ring"],
            desc: "近战冲撞型，正面减伤，诱导撞墙后输出",
        },
        {
            name: "回旋机兵", color: "#63a563", hp: 80, bulletSpeed: 1.30,
            bossType: "executor", tier: 0,
            skills: ["charge", "slam"],
            patterns: ["spiral", "fan"],
            desc: "近战冲撞型，正面减伤，诱导撞墙后输出",
        },
    ],
    20: [
        {
            name: "腐化母体", color: "#cfa0e4", hp: 165, bulletSpeed: 1.50,
            bossType: "mother", tier: 1,
            skills: ["summon", "slam"],
            patterns: ["ring", "split"],
            desc: "召唤腐化植物，治疗花与毒花并存",
        },
        {
            name: "剧毒核心", color: "#cf4455", hp: 165, bulletSpeed: 1.45,
            bossType: "mother", tier: 1,
            skills: ["summon", "slam"],
            patterns: ["wave", "ring"],
            desc: "召唤腐化植物，治疗花与毒花并存",
        },
    ],
    30: [
        {
            name: "机械蜂巢", color: "#f07d84", hp: 280, bulletSpeed: 1.65,
            bossType: "hive", tier: 2,
            skills: ["summon"],
            patterns: ["fan", "homing", "split"],
            desc: "三阶段：纯弹幕 → 部署无人机 → 主炮激光",
        },
        {
            name: "蜂群母舰", color: "#ee933b", hp: 280, bulletSpeed: 1.60,
            bossType: "hive", tier: 2,
            skills: ["summon"],
            patterns: ["spiral", "homing"],
            desc: "三阶段：纯弹幕 → 部署无人机 → 主炮激光",
        },
    ],
    40: [
        {
            name: "诅咒司祭", color: "#cf4455", hp: 415, bulletSpeed: 1.80,
            bossType: "priest", tier: 3,
            skills: ["altar", "slam", "charge"],
            patterns: ["fan", "homing", "split"],
            desc: "召唤诅咒祭坛，摧毁祭坛解除诅咒",
        },
        {
            name: "虚空司祭", color: "#a464c4", hp: 415, bulletSpeed: 1.75,
            bossType: "priest", tier: 3,
            skills: ["altar", "slam", "charge"],
            patterns: ["spiral", "wave", "ring"],
            desc: "召唤诅咒祭坛，摧毁祭坛解除诅咒",
        },
    ],
    // 第 50 层：终焉聚合体。不再复用第四层的司祭模板，
    // 而是四阶段轮回——按 HP 阈值依次复刻前四层 Boss 的看家本领：
    // 甲壳（冲锋）→ 腐肉（召唤）→ 蜂群（激光）→ 司祭（祭坛+大招）。
    // 阶段表见 boss.js FINAL_PHASES，这里 def.skills/patterns 仅用于图鉴展示。
    50: [
        {
            name: "终焉审判", color: "#cf4455", hp: 600, bulletSpeed: 2.00,
            bossType: "final", tier: 4,
            skills: ["charge", "slam", "summon", "altar", "ultimate"],
            patterns: ["fan", "homing", "split", "ring"],
            desc: "四阶段聚合：钢铁甲壳→腐化内核→蜂群武装→司祭之眼",
        },
        {
            name: "虚空领主", color: "#a464c4", hp: 600, bulletSpeed: 1.95,
            bossType: "final", tier: 4,
            skills: ["charge", "slam", "summon", "altar", "ultimate"],
            patterns: ["spiral", "homing", "wave", "ring"],
            desc: "四阶段聚合：钢铁甲壳→腐化内核→蜂群武装→司祭之眼",
        },
    ],
};

export const BOSS_TIER_INDEX = [10, 20, 30, 40, 50];