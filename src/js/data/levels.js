// ═══ 关卡数据（纯数据） ═══

// 方块尺寸随关卡递减
export const BLOCK_SIZE_TABLE = [
    { maxLevel: 3, w: 110, h: 34 },
    { maxLevel: 6, w: 96, h: 30 },
    { maxLevel: 10, w: 84, h: 27 },
    { maxLevel: 15, w: 74, h: 24 },
    { maxLevel: 25, w: 68, h: 22 },
    { maxLevel: 40, w: 60, h: 19 },
    { maxLevel: Infinity, w: 54, h: 18 },
];

// 血量表（按关卡 tier 索引）
export const HP_TABLE = [
    [1, 1, 1, 1, 2],
    [1, 1, 2, 2, 3],
    [1, 2, 2, 3, 3],
    [2, 2, 3, 3, 4],
];