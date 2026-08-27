// ─── 画布尺寸 ─────────────────────────────────────────────
export const W = 800;
export const H = 600;

// ─── 颜色（统一引用 palette.js 的受限调色板）─────────────
import { PAL } from "./palette.js";

export const COLORS = {
    bg: PAL.ink1,
    topBar: PAL.ink2,
    paddle1: PAL.vio1,
    paddle2: PAL.vio2,
    ball: PAL.bone1,
    ballGlow: PAL.gold2,
    // 1HP → 7HP，配色需要7档
    blockColors: [PAL.moss2, PAL.ember2, PAL.blood2, PAL.vio2, PAL.arc2, PAL.gold2, PAL.teal3],
    blockGlow: [PAL.moss3, PAL.ember3, PAL.blood3, PAL.vio3, PAL.arc3, PAL.gold3, PAL.teal3],
    unbreakable: PAL.mist0,
    ui: PAL.bone0,
    uiDim: PAL.mist0,
    gold: PAL.gold2,
    cardBg: PAL.ink2,
    cardBorder: PAL.gold1,
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
    CURSE_SELECT: "curseSelect", // 诅咒三选一
    CODEX: "codex", // 图鉴：奖励/诅咒/事件数据
    STATUS: "status", // 角色状态总览
    DEV_MODE: "devMode", // 开发者模式
    SETTINGS: "settings", // 设置
    LEVEL_COMPLETE: "levelComplete", // 达成本关目标，可自行选择是否进入下一关
    GAME_OVER: "gameOver",
    VICTORY: "victory",
};

// ─── 奖励稀有度 ───────────────────────────────────────────
export const RARITY = {
    INITIAL: "initial",
    COMMON: "common",
    UNCOMMON: "uncommon",
    RARE: "rare",
};

export const RARITY_META = {
    [RARITY.INITIAL]: { name: "初始", color: PAL.moss2, glow: PAL.moss3, weight: 100 },
    [RARITY.COMMON]: { name: "普通", color: PAL.mist0, glow: PAL.mist1, weight: 60 },
    [RARITY.UNCOMMON]: { name: "罕见", color: PAL.arc2, glow: PAL.arc3, weight: 30 },
    [RARITY.RARE]: { name: "稀有", color: PAL.gold2, glow: PAL.gold3, weight: 10 },
};

// ─── 进度配置 ─────────────────────────────────────────────
export const TOTAL_LEVELS = 50;
export const BOSS_LEVELS = new Set([10, 20, 30, 40, 50]);
export const isBossLevel = (n) => BOSS_LEVELS.has(n);

// ─── 方块（默认基准，关卡内按层数动态缩放） ───────────────
// 方块宽高由 levels.js 按层数计算，这里只保留网格间距与起始行
export const BLOCK_GAP = 4;
export const GRID_COLS = 10;
// 顶栏 48px + 16px 呼吸空间：确保方块不被 HUD 遮挡
export const GRID_Y = 88;

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

// ─── 球速区间 ─────────────────────────────────────────────
// 距离下方墙壁 2/7 处为界：区间内接球速度正常，区间外与发球时速度 ×4
export const SPEED_ZONE_Y = Math.floor(H * 5 / 7); // ≈ 428
export const LAUNCH_SPEED_MUL = 4;