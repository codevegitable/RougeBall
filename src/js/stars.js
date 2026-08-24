// ═══ 地牢背景 ═══
// 风格参考《以撒的结合》：石砌房间的地板砖 + 墙体阴影 + 零星污渍，
// 整张背景预渲染到离屏 canvas，每帧只做一次 drawImage，零运行时开销。
// 前景保留少量缓慢浮动的尘埃粒子，提供生命感但不干扰视线。

import { W, H } from "./constants.js";
import { state } from "./state.js";
import { ctx } from "./canvas.js";
import { PAL } from "./palette.js";
import { PX } from "./pixel.js";
import { mulberry32 } from "./utils.js";
import { FIELD_TOP } from "./layout.js";

let floorCache = null;
let cachedLevelTheme = -1;

// 每 10 关换一次房间色调，营造"下潜更深"的推进感
const THEMES = [
    { floor: PAL.ink2, floorAlt: PAL.ink3, grout: PAL.ink1, edgeLight: PAL.stone0, stain: PAL.moss0 },
    { floor: PAL.ink3, floorAlt: PAL.stone0, grout: PAL.ink1, edgeLight: PAL.stone1, stain: PAL.ember0 },
    { floor: PAL.stone0, floorAlt: PAL.ink3, grout: PAL.ink0, edgeLight: PAL.stone1, stain: PAL.blood0 },
    { floor: PAL.ink2, floorAlt: PAL.stone0, grout: PAL.ink0, edgeLight: PAL.stone1, stain: PAL.vio0 },
    { floor: PAL.ink1, floorAlt: PAL.ink2, grout: PAL.ink0, edgeLight: PAL.ink3, stain: PAL.arc0 },
];

export function themeFor(level) {
    return THEMES[Math.min(THEMES.length - 1, Math.floor((level - 1) / 10))];
}

// ── 尘埃粒子（原 stars 的替代）────────────────────────────
export function initStars() {
    state.stars = [];
    for (let i = 0; i < 34; i++) {
        state.stars.push({
            x: Math.random() * W,
            y: FIELD_TOP + Math.random() * (H - FIELD_TOP),
            r: Math.random() < 0.75 ? PX : PX * 2,
            drift: Math.random() * 0.14 + 0.04,
            sway: Math.random() * Math.PI * 2,
            speed: Math.random() * 0.015 + 0.006,
        });
    }
}

export function updateStars() {
    for (const s of state.stars) {
        s.sway += s.speed * state.dt;
        s.y += s.drift * state.dt;
        if (s.y > H) {
            s.y = FIELD_TOP;
            s.x = Math.random() * W;
        }
    }
}

// 预渲染地板
function buildFloor(level) {
    const th = themeFor(level);
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const c = cv.getContext("2d");
    const rng = mulberry32(9173 + Math.floor((level - 1) / 10) * 77);

    const TILE = PX * 10; // 40px 地砖

    c.fillStyle = th.grout;
    c.fillRect(0, 0, W, H);

    // 交错砖块。所有明暗都用调色板里的实色，不用 alpha 混合——
    // 半透明会在两色之间插值出调色板外的新颜色，破坏像素风的色彩纪律。
    for (let ty = 0, row = 0; ty < H; ty += TILE, row++) {
        const offset = row % 2 === 0 ? 0 : TILE / 2;
        for (let tx = -TILE; tx < W + TILE; tx += TILE) {
            const x = Math.round((tx + offset) / PX) * PX;
            const alt = rng() < 0.42;
            c.fillStyle = alt ? th.floorAlt : th.floor;
            c.fillRect(x, ty, TILE - PX, TILE - PX);
            // 上缘高光 / 下缘阴影：直接取相邻明度档
            c.fillStyle = th.edgeLight;
            c.fillRect(x, ty, TILE - PX, PX);
            c.fillStyle = th.grout;
            c.fillRect(x, ty + TILE - PX * 2, TILE - PX, PX);
            // 随机磨损点：实色单像素
            if (rng() < 0.3) {
                c.fillStyle = th.grout;
                c.fillRect(x + Math.floor(rng() * 8) * PX, ty + Math.floor(rng() * 8) * PX, PX, PX);
            }
        }
    }

    // 污渍：用网点抖动而非半透明，密度模拟浓淡
    for (let i = 0; i < 7; i++) {
        const sx = Math.floor((rng() * W) / PX) * PX;
        const sy = FIELD_TOP + Math.floor((rng() * (H - FIELD_TOP)) / PX) * PX;
        const blobR = 3 + Math.floor(rng() * 5);
        c.fillStyle = th.stain;
        for (let dy = -blobR; dy <= blobR; dy++) {
            const span = Math.floor(Math.sqrt(Math.max(0, blobR * blobR - dy * dy)) * (0.6 + rng() * 0.6));
            for (let k = -span; k <= span; k++) {
                // 棋盘抖动：只画一半格子，得到"半透明"观感
                if (((k + dy) & 1) === 0) continue;
                c.fillRect(sx + k * PX, sy + dy * PX, PX, PX);
            }
        }
    }

    // 房间边墙：左右下三面的石砌内墙，把游戏区框成一个"房间"
    const wallT = PX * 3;
    c.fillStyle = PAL.ink0;
    c.fillRect(0, FIELD_TOP, wallT, H - FIELD_TOP);
    c.fillRect(W - wallT, FIELD_TOP, wallT, H - FIELD_TOP);
    c.fillStyle = PAL.stone0;
    c.fillRect(0, FIELD_TOP, PX, H - FIELD_TOP);
    c.fillRect(W - PX, FIELD_TOP, PX, H - FIELD_TOP);

    return cv;
}

export function drawDungeon() {
    const lv = state.player?.level || 1;
    const themeIdx = Math.floor((lv - 1) / 10);
    if (!floorCache || cachedLevelTheme !== themeIdx) {
        floorCache = buildFloor(lv);
        cachedLevelTheme = themeIdx;
    }
    ctx.drawImage(floorCache, 0, 0);
    drawDust();
}

// 尘埃：用三档实色代替连续 alpha，闪烁靠切换色档实现
const DUST_STEPS = [PAL.ink3, PAL.stone0, PAL.stone2];
function drawDust() {
    if (!state.stars) return;
    for (const s of state.stars) {
        const t = (Math.sin(s.sway) + 1) / 2;
        ctx.fillStyle = DUST_STEPS[Math.min(2, Math.floor(t * 3))];
        ctx.fillRect(Math.round(s.x / PX) * PX, Math.round(s.y / PX) * PX, s.r, s.r);
    }
}

