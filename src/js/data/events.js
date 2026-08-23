// ═══ 事件房数据（纯数据，无逻辑） ═══
// choices[i].action.kind 由 events.js 解释执行：
//   buy (cost, rarity)        花费分数换指定稀有度奖励
//   leave                     离开事件房
//   challenge                 发起限时挑战
//   gamble (rarity)           50% 奖励 / 50% 诅咒
//   heal (amount)             恢复生命
//   sacrifice (rarity,count)  献祭生命换多个奖励
//   voidGamble                60% 奖励 / 40% 扣分 (scoreCost)
//   blessing                  next reward boost
//   tradeLife (rarity)        用生命换奖励
//   score (amount)            获得分数
//   rewardNoSkill (rarity)    获得非技能奖励
//   cooldownCut (seconds)     技能冷却减少
//   well (cost, rarity)       许愿井（非技能奖励）
//   abilityOnly               获得罕见+被动能力
//   sealedRoom                稀有奖励 + 重诅咒
// needScore: 需要满足的最低分数

export const EVENT_DATA = [
    {
        id: "merchant",
        name: "神秘商人",
        icon: "🧙",
        desc: "一位披着斗篷的商人向你展示了一件商品：\n花费 80 分，换取一个随机的罕见奖励。",
        skippable: true,
        choices: [
            { label: "购买（80 分）", needScore: 800, action: { kind: "buy", cost: 800, rarity: "uncommon" } },
            { label: "离开", action: { kind: "leave" } },
        ],
    },
    {
        id: "challenge",
        name: "限时挑战",
        icon: "⏰",
        desc: "一位武僧向你发起考验：\n25 秒内击破 12 个方块即可获得罕见奖励，\n失败将损失半条生命。",
        skippable: true,
        choices: [
            { label: "接受挑战", action: { kind: "challenge" } },
            { label: "拒绝", action: { kind: "leave" } },
        ],
    },
    {
        id: "gamble",
        name: "命运赌局",
        icon: "🎲",
        desc: "与命运对赌：\n50% 概率获得一个随机罕见奖励，50% 概率获得一个随机诅咒。",
        skippable: true,
        choices: [
            { label: "下注！", action: { kind: "gamble", rarity: "uncommon" } },
            { label: "不赌", action: { kind: "leave" } },
        ],
    },
    {
        id: "spring",
        name: "生命之泉",
        icon: "⛲",
        desc: "清澈的泉水散发着治愈的力量。\n恢复 2 条生命。",
        skippable: false,
        choices: [
            { label: "畅饮泉水", action: { kind: "heal", amount: 2 } },
        ],
    },
    {
        id: "altar",
        name: "暗影祭坛",
        icon: "🗡️",
        desc: "祭坛渴求鲜血：\n献祭 1 条生命，获得 2 个随机普通奖励。",
        skippable: true,
        choices: [
            { label: "献祭生命（-1 生命）", action: { kind: "sacrifice", costLives: 1, rarity: "common", count: 2 } },
            { label: "离开", action: { kind: "leave" } },
        ],
    },
    {
        id: "void",
        name: "虚空裂缝",
        icon: "🕳️",
        desc: "裂缝中传来未知的低语：\n60% 概率获得随机奖励，40% 概率失去 2 点生命。",
        skippable: true,
        choices: [
            { label: "伸手一探", action: { kind: "sacrifice", costLives: 2 } },
            { label: "离开", action: { kind: "leave" } },
        ],
    },
    {
        id: "blessing",
        name: "圣光洗礼",
        icon: "🌟",
        desc: "圣光照亮前路：\n下一次选择奖励时，所有奖励至少为罕见品质。",
        skippable: false,
        choices: [
            { label: "接受洗礼", action: { kind: "blessing" } },
        ],
    },
    {
        id: "blackmarket",
        name: "黑市",
        icon: "💀",
        desc: "可疑的商人压低声音：\n用 1 条生命，换取一个随机的稀有奖励。",
        skippable: true,
        choices: [
            { label: "交易（-1 生命）", action: { kind: "tradeLife", costLives: 1, rarity: "rare" } },
            { label: "离开", action: { kind: "leave" } },
        ],
    },
    {
        id: "campfire",
        name: "篝火营地",
        icon: "🏕️",
        desc: "温暖的火光让人安心。\n获得 100 分。",
        skippable: false,
        choices: [
            { label: "休息片刻", action: { kind: "score", amount: 100 } },
        ],
    },
    {
        id: "workshop",
        name: "附魔工坊",
        icon: "🔮",
        desc: "工坊的附魔台嗡嗡作响：\n获得一个随机的罕见加成或能力（不含技能）。",
        skippable: false,
        choices: [
            { label: "开动附魔台", action: { kind: "rewardNoSkill", rarity: "uncommon" } },
        ],
    },
    {
        id: "time_rift",
        name: "时光裂缝",
        icon: "⏳",
        desc: "一股时间乱流包裹了你：\n所有已装备的主动技能冷却时间减少 18 秒。",
        skippable: false,
        choices: [
            { label: "穿越裂缝", action: { kind: "cooldownCut", seconds: 18 } },
        ],
    },
    {
        id: "wishing_well",
        name: "许愿井",
        icon: "🪙",
        desc: "一枚金币就能许一个愿，金额越大回报越丰厚——\n300 分 → 普通奖励\n600 分 → 罕见奖励\n1000 分 → 稀有奖励",
        skippable: true,
        choices: [
            { label: "投 300 分（普通）", action: { kind: "well", cost: 300, rarity: "common" } },
            { label: "投 600 分（罕见）", action: { kind: "well", cost: 600, rarity: "uncommon" } },
            { label: "投 1000 分（稀有）", action: { kind: "well", cost: 1000, rarity: "rare" } },
            { label: "离开", action: { kind: "leave" } },
        ],
    },
    {
        id: "library",
        name: "遗迹图书馆",
        icon: "📚",
        desc: "古老的藏书散发着微光：\n获得一个随机能力（仅被动能力），至少罕见品质。",
        skippable: false,
        choices: [
            { label: "研读古籍", action: { kind: "abilityOnly" } },
        ],
    },
    {
        id: "sealed_room",
        name: "封印之间",
        icon: "🔐",
        desc: "密室中封存着危险的力量：\n获得一个稀有奖励，但也会得到一个随机重诅咒。\n（重诅咒不会随关卡推进解除）",
        skippable: true,
        choices: [
            { label: "打开封印", action: { kind: "sealedRoom" } },
            { label: "离开", action: { kind: "leave" } },
        ],
    },
];