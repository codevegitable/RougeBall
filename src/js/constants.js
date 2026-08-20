// ─── 画布尺寸 ─────────────────────────────────────────────
export const W = 800;
export const H = 600;

// ─── 颜色 ─────────────────────────────────────────────────
export const COLORS = {
    bg: "#131019",
    topBar: "rgba(18,14,26,0.85)",
    paddle1: "#5f4bc4",
    paddle2: "#8a63d8",
    ball: "#f5eedd",
    ballGlow: "rgba(245,238,221,0.35)",
    blockColors: ["#3f8f5f", "#c07a3a", "#a63d4a", "#7a4fa8"],
    blockGlow: ["rgba(63,143,95,0.45)", "rgba(192,122,58,0.45)", "rgba(166,61,74,0.45)", "rgba(122,79,168,0.45)"],
    unbreakable: "#343a4a",
    ui: "#cfc6b8",
    uiDim: "#8a8175",
    gold: "#d9b45c",
    cardBg: "rgba(26,20,34,0.96)",
    cardBorder: "rgba(217,180,92,0.35)",
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
    [RARITY.COMMON]: { name: "普通", color: "#9aa1ad", glow: "rgba(154,161,173,0.45)", weight: 60 },
    [RARITY.UNCOMMON]: { name: "罕见", color: "#6d97d8", glow: "rgba(109,151,216,0.5)", weight: 30 },
    [RARITY.RARE]: { name: "稀有", color: "#e0b84f", glow: "rgba(224,184,79,0.5)", weight: 10 },
};

// ─── 进度配置 ─────────────────────────────────────────────
export const TOTAL_LEVELS = 50;
export const BOSS_LEVELS = new Set([15, 30, 45, 50]);
export const isBossLevel = (n) => BOSS_LEVELS.has(n);

// ─── 方块网格 ─────────────────────────────────────────────
export const BLOCK_W = 64;
export const BLOCK_H = 22;
export const BLOCK_GAP = 4;
export const GRID_COLS = 10;
export const GRID_X = (W - GRID_COLS * (BLOCK_W + BLOCK_GAP) + BLOCK_GAP) / 2;
export const GRID_Y = 70;

// ─── 球 ───────────────────────────────────────────────────
export const BALL_BASE_SPEED = 5.5;
export const BALL_RADIUS = 8;
export const MAX_BALLS = 10;

// ─── 技能 ─────────────────────────────────────────────────
export const MAX_SKILLS = 2;