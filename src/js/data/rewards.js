// ═══ 奖励数据（纯数据，无逻辑） ═══
// rarity: "common" | "uncommon" | "rare"
// type: "bonus"（加成）| "skill"（主动技能）| "ability"（被动能力）
// tierLock: 需要解锁的层数（0/1/2），bossOnly: 仅 Boss 掉落，skinOnly: 皮肤开场技能
// applyId / useId: 由 rewards.js 解释执行

export const REWARD_TYPE_NAME = { bonus: "加成", skill: "技能", ability: "能力" };

export const REWARD_DATA = [
    // ═══ 加成 ═══
    { id: "power_ball", name: "强化球体", icon: "⚡", rarity: "common", type: "bonus", maxStacks: 5, desc: "球伤害 +1" },
    { id: "slow_ball", name: "减速球", icon: "🐢", rarity: "common", type: "bonus", maxStacks: 3, desc: "球速度 -12%（更易控制）" },
    { id: "extra_life", name: "快速修复", icon: "❤️", rarity: "common", type: "bonus", maxStacks: 99, applyId: "lives1", desc: "获得 1 条额外生命" },
    { id: "score_boost", name: "分数加成", icon: "⭐", rarity: "common", type: "bonus", maxStacks: 99, applyId: "score500", desc: "立即获得 50 分" },
    { id: "wider_paddle", name: "加宽挡板", icon: "↔️", rarity: "common", type: "bonus", maxStacks: 4, desc: "挡板宽度 +25%" },
    { id: "entry_gain", name: "初始收益", icon: "💰", rarity: "common", type: "bonus", maxStacks: 5, desc: "进入每关时额外获得 5 分" },
    { id: "spark_core", name: "火花核心", icon: "✨", rarity: "common", type: "ability", maxStacks: 3, desc: "击碎方块时额外获得 30 分" },
    { id: "mega_ball", name: "极限球体", icon: "⚡⚡", rarity: "uncommon", type: "bonus", maxStacks: 3, desc: "球伤害 +2" },
    { id: "big_life", name: "时候未到", icon: "💖", rarity: "uncommon", type: "bonus", maxStacks: 5, applyId: "lives2", desc: "获得 2 条额外生命" },
    { id: "giant_paddle", name: "巨型挡板", icon: "🛡️", rarity: "uncommon", type: "bonus", maxStacks: 2, desc: "挡板宽度 +50%" },
    { id: "cd_reduction", name: "冷却剂", icon: "⏱️", rarity: "uncommon", type: "bonus", maxStacks: 3, desc: "主动技能冷却时间 -20%" },
    { id: "annihil_ball", name: "吞噬暗影", icon: "⚡⚡⚡", rarity: "rare", type: "bonus", maxStacks: 2, desc: "球伤害 +3" },
    { id: "life_crown", name: "新生之喜", icon: "👑", rarity: "rare", type: "bonus", maxStacks: 3, applyId: "crown", desc: "获得 3 条生命与 50 分" },
    // ═══ 主动技能 ═══
    { id: "ghost", name: "幽魂形态", icon: "👻", rarity: "rare", type: "skill", cooldown: 25, desc: "3 秒内球不会被方块弹回" },
    { id: "slow_time", name: "时间缓速", icon: "⏳", rarity: "uncommon", type: "skill", cooldown: 30, desc: "8 秒内所有球速度 -40%" },
    // 图标改自 🌀：🌀 在 EMOJI_MAP 里映射到 curse 字形（迷眼/混沌引力两个诅咒共用它，
    // 对诅咒是对的），但这技能是挡板免疫，画成诅咒符号会和状态页的「诅咒」分页同图标。
    { id: "energy_shield", name: "岿然不动", icon: "🛡️", rarity: "uncommon", type: "skill", cooldown: 30, desc: "8 秒内挡板免疫一切弹幕伤害" },
    { id: "blast_charge", name: "爆裂蓄力", icon: "💥", rarity: "uncommon", type: "skill", cooldown: 25, desc: "接下来 5 秒内击碎方块时引发爆炸，波及周围方块" },
    // 🎇/🔆 都兜底到 star 字形，两个技能会长得一样。这里直接写字形名而非 emoji：
    // resolveIcon 对已知字形名原样返回，比挑一个"刚好映射对"的 emoji 更直白。
    { id: "barrage", name: "弹幕爆发", icon: "ball", rarity: "uncommon", type: "skill", cooldown: 35, desc: "立即额外发射 5 个球" },
    { id: "power_strike", name: "突破极限", icon: "charge", rarity: "rare", type: "skill", cooldown: 30, desc: "接下来 5 秒内球伤害 ×2" },
    { id: "time_freeze", name: "时间冻结", icon: "🧊", rarity: "rare", type: "skill", cooldown: 40, desc: "4 秒内所有方块与 Boss 停止移动和攻击" },
    // ═══ 解锁技能 ═══
    // 皮肤技能原本用色块 emoji（🟢/🔴/🟡）表示阵营，但色块在 EMOJI_MAP 里按颜色
    // 映射成 shield/sword/coin，与技能实际效果无关：翡翠繁星是加球却画成盾、
    // 黄金之盾是无敌却画成金币。改为按效果取字形，阵营已由稀有度色条体现。
    { id: "jade_stars", name: "翡翠繁星", icon: "star", rarity: "uncommon", type: "skill", cooldown: 30, tierLock: 0, desc: "发射 3 个额外球" },
    { id: "jade_shield", name: "翡翠之盾", icon: "🛡️", rarity: "uncommon", type: "skill", cooldown: 35, tierLock: 0, desc: "6 秒内受击反弹 5 点伤害" },
    { id: "crimson_storm", name: "猩红风暴", icon: "fire", rarity: "uncommon", type: "skill", cooldown: 30, tierLock: 1, desc: "5 秒内球分裂出 2 个额外球" },
    { id: "blood_siphon", name: "血之吸吮", icon: "🩸", rarity: "uncommon", type: "skill", cooldown: 40, tierLock: 1, desc: "8 秒内每击碎 5 个方块回复 0.1 命" },
    { id: "golden_shield", name: "黄金之盾", icon: "shield", rarity: "rare", type: "skill", cooldown: 40, tierLock: 2, desc: "6 秒内无敌" },
    { id: "wealth_rain", name: "王国资产", icon: "💰", rarity: "rare", type: "skill", cooldown: 30, tierLock: 2, desc: "立即获得 200 分" },
    // ═══ 皮肤开场技能 ═══
    { id: "jade_barrier", name: "翡翠屏障", icon: "🟢", rarity: "uncommon", type: "skill", cooldown: 35, skinOnly: true, desc: "5 秒内受击不扣血" },
    { id: "swift_blade", name: "迅捷之刃", icon: "🔴", rarity: "uncommon", type: "skill", cooldown: 30, skinOnly: true, desc: "5 秒内球伤害 ×1.5" },
    { id: "golden_blessing", name: "黄金祝福", icon: "🟡", rarity: "uncommon", type: "skill", cooldown: 35, skinOnly: true, desc: "立即获得 50 分，8 秒内分数 ×2" },
    // ═══ 被动能力 ═══
    { id: "piercing", name: "电动力学", icon: "💠", rarity: "uncommon", type: "ability", maxStacks: 3, desc: "球击碎方块后可穿透 1 次" },
    { id: "dual_ball", name: "双球开局", icon: "🔵", rarity: "common", type: "ability", maxStacks: 3, desc: "每关开始时额外获得 1 个球" },
    { id: "giant_orb", name: "巨型球", icon: "🪐", rarity: "common", type: "ability", maxStacks: 2, desc: "球体积 +30%，更容易命中" },
    { id: "explosion_res", name: "爆炸共鸣", icon: "🧨", rarity: "uncommon", type: "ability", maxStacks: 2, desc: "击碎方块时有 25% 概率对相邻方块造成 1 点伤害" },
    { id: "echo_hit", name: "回音击", icon: "🔔", rarity: "common", type: "ability", maxStacks: 2, desc: "击碎方块时弹片对周围随机方块造成 1 点伤害" },
    { id: "split_ball", name: "分裂之球", icon: "🧬", rarity: "rare", type: "ability", maxStacks: 1, desc: "球每撞击 6 次方块便分裂出 1 个新球" },
    { id: "bouncy_combo", name: "弹射连击", icon: "🛸", rarity: "rare", type: "ability", maxStacks: 1, desc: "球击碎方块后不会反弹，直接继续飞行" },
    { id: "vampire", name: "死亡收割", icon: "🧛", rarity: "rare", type: "ability", maxStacks: 2, desc: "击碎方块时有 1.5% 概率恢复 1 条生命" },
    { id: "gold_soul", name: "黄金之魂", icon: "🏆", rarity: "uncommon", type: "ability", maxStacks: 2, desc: "所有来源的分数 ×2" },
    { id: "iron_will", name: "钢铁意志", icon: "🛐", rarity: "rare", type: "ability", maxStacks: 1, desc: "受到弹幕伤害时有 50% 概率格挡" },
    { id: "thorn_armor", name: "荆棘反甲", icon: "🌵", rarity: "uncommon", type: "ability", maxStacks: 2, desc: "挡板被弹幕命中时，反弹对 Boss 造成 5 点伤害" },
    { id: "lifebuoy", name: "救生圈", icon: "💺", rarity: "uncommon", type: "ability", maxStacks: 1, desc: "每关开始获得 1 次免费救球：球落地自动返回" },
    { id: "meteor", name: "末路追踪", icon: "☄️", rarity: "rare", type: "ability", maxStacks: 1, desc: "每击碎 8 个方块，自动对场上血量最高的方块造成 3 点伤害" },
    { id: "lucky", name: "幸运女神", icon: "🍀", rarity: "rare", type: "ability", maxStacks: 1, desc: "奖励选择数量 +1（局外收益）" },
    { id: "compass", name: "寻宝罗盘", icon: "🧭", rarity: "uncommon", type: "ability", maxStacks: 2, desc: "奖励稀有度概率提高 10%（局外收益）" },
    // ═══ 新增奖励 ═══
    { id: "bounce_shield", name: "弹射护盾", icon: "🛡️", rarity: "uncommon", type: "ability", maxStacks: 1, desc: "被弹幕击中时 15% 概率反弹子弹" },
    { id: "swift_move", name: "疾风步", icon: "💨", rarity: "common", type: "bonus", maxStacks: 3, desc: "挡板响应速度 +15%" },
    { id: "life_siphon", name: "生命虹吸", icon: "🩸", rarity: "uncommon", type: "ability", maxStacks: 2, desc: "每击碎 15 个方块回复 0.1 生命" },
    { id: "double_strike", name: "与我一战", icon: "⚡", rarity: "common", type: "bonus", maxStacks: 3, desc: "球伤害 +2，球速度 +9%" },
    { id: "lucky_charm", name: "幸运护符", icon: "🍀", rarity: "uncommon", type: "ability", maxStacks: 2, desc: "稀有奖励概率 +5%" },
    // ═══ 解锁奖励 ═══
    { id: "guardian_core", name: "守护核心", icon: "🛡️", rarity: "uncommon", type: "ability", maxStacks: 1, tierLock: 0, desc: "每关开始获得 2 秒能量护盾" },
    { id: "greed_eye", name: "贪婪之眼", icon: "👁️", rarity: "uncommon", type: "ability", maxStacks: 2, tierLock: 0, desc: "击碎方块额外获得 +50% 分数" },
    { id: "vampiric_gem", name: "吸血宝石", icon: "💎", rarity: "rare", type: "ability", maxStacks: 1, tierLock: 1, bossOnly: true, desc: "击碎方块时 3% 概率恢复 1 生命" },
    { id: "rapid_cooling", name: "极速制冷", icon: "❄️", rarity: "uncommon", type: "bonus", maxStacks: 3, tierLock: 1, desc: "技能冷却额外 -15%" },
    { id: "titan_ball", name: "泰坦之球", icon: "🌍", rarity: "rare", type: "ability", maxStacks: 1, tierLock: 2, desc: "球体积 +60%，撞击方块伤害 +30%" },
    { id: "blessed_start", name: "祝福开局", icon: "✨", rarity: "rare", type: "bonus", maxStacks: 1, tierLock: 2, desc: "每关开始额外获得 2 个球" },
    // ═══ Boss 专属奖励 ═══
    { id: "titan_arm", name: "泰坦之臂", icon: "🦾", rarity: "rare", type: "bonus", maxStacks: 2, bossOnly: true, desc: "挡板宽度 +50%" },
    { id: "doom_blast", name: "主宰", icon: "☄️", rarity: "rare", type: "bonus", maxStacks: 1, bossOnly: true, desc: "球伤害 +4" },
    { id: "time_weaver", name: "时间吞噬者", icon: "🕸️", rarity: "rare", type: "bonus", maxStacks: 2, bossOnly: true, desc: "技能冷却时间 -30%" },
    { id: "danmaku_lord", name: "彩虹", icon: "🎆", rarity: "rare", type: "ability", maxStacks: 1, bossOnly: true, desc: "释放主动技能时额外发射 3 个球" },
    { id: "treasury", name: "王之财宝", icon: "👑", rarity: "rare", type: "bonus", maxStacks: 2, bossOnly: true, applyId: "score2000", desc: "立即获得 200 分，所有分数获取 +20%" },
    { id: "godseed", name: "神速之星", icon: "🌠", rarity: "rare", type: "bonus", maxStacks: 2, bossOnly: true, desc: "球速度 -15%，球伤害 +1" },
];
