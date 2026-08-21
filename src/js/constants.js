// ─── 画布尺寸 ─────────────────────────────────────────────
export const W = 800;
export const H = 600;

// ─── 颜色 ─────────────────────────────────────────────────
export const COLORS = {
    bg: "#1a0a28",
    topBar: "rgba(26,10,40,0.85)",
    paddle1: "#8b3a8b",
    paddle2: "#c060a0",
    ball: "#f5f0e0",
    ballGlow: "rgba(245,240,224,0.35)",
    blockColors: ["#2a7a5a", "#c07a3a", "#a63d4a", "#6a4fa8"],
    blockGlow: ["rgba(42,122,90,0.45)", "rgba(192,122,58,0.45)", "rgba(166,61,74,0.45)", "rgba(106,79,168,0.45)"],
    unbreakable: "#3a2a4a",
    ui: "#e8d8c8",
    uiDim: "#a89880",
    gold: "#e8c84a",
    cardBg: "rgba(26,15,35,0.96)",
    cardBorder: "rgba(232,200,74,0.35)",
};

// ─── 游戏状态 ─────────────────────────────────────────────
export const STATE = {
    MENU: "menu",
    PLAYING: "playing",
    PAUSED: "paused",
    START_REWARD: "startReward", // 开局奖励选择
    LEVEL_REWARD: "levelReward", // 关卡奖励选择
    SKILL_SWAP: "skillSwap", // 技能槽已满，替换界面
    EVENT: "event", // 事件房
    BOSS_CLEAR: "bossClear", // Boss 被击败结算
    PENALTY: "penalty", // 惩罚选择（Boss 奖励后）
    CODEX: "codex", // 图鉴：奖励/诅咒/事件数据
    SETTINGS: "settings", // 设置
    GAME_OVER: "gameOver",
    VICTORY: "victory",
};

// ─── 奖励稀有度 ───────────────────────────────────────────
export const RARITY = {
    COMMON: "common",
    UNCOMMON: "uncommon",
    RARE: "rare",
};

export const RARITY_META = {
    [RARITY.COMMON]: { name: "普通", color: "#a89880", glow: "rgba(168,152,128,0.45)", weight: 60 },
    [RARITY.UNCOMMON]: { name: "罕见", color: "#6d97d8", glow: "rgba(109,151,216,0.5)", weight: 30 },
    [RARITY.RARE]: { name: "稀有", color: "#e8c84a", glow: "rgba(232,200,74,0.5)", weight: 10 },
};

// ─── 进度配置 ─────────────────────────────────────────────
export const TOTAL_LEVELS = 50;
export const BOSS_LEVELS = new Set([15, 30, 45, 50]);
export const isBossLevel = (n) => BOSS_LEVELS.has(n);

// ─── 方块（默认基准，关卡内按层数动态缩放） ───────────────
export const BLOCK_W = 64;
export const BLOCK_H = 22;
export const BLOCK_GAP = 4;
export const GRID_COLS = 10;
export const GRID_X = (W - GRID_COLS * (BLOCK_W + BLOCK_GAP) + BLOCK_GAP) / 2;
export const GRID_Y = 70;

// ─── 挡板 ─────────────────────────────────────────────────
export const PADDLE_BASE_W = 110;
export const PADDLE_H = 14;

// ─── 球 ───────────────────────────────────────────────────
export const BALL_BASE_SPEED = 5.5;
export const BALL_RADIUS = 8;
export const MAX_BALLS = 10;
export const BALL_BLOCK_ACCEL = 0.015; // 每次撞击方块的提速比例
export const BALL_SPEED_CAP = 1.5; // 相对基础速度的上限

// ─── 技能 ─────────────────────────────────────────────────
export const MAX_SKILLS = 2;