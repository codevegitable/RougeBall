import { W, H, STATE, PADDLE_BASE_W } from "./constants.js";
import { state } from "./state.js";
import { ctx } from "./canvas.js";
import { skinDef, getSelectedSkin, DEFAULT_SKIN_COLORS } from "./unlocks.js";
import { PAL, BLOCK_TIERS, rgba } from "./palette.js";
import { PX, snap, pRect, pRectRaw, pStroke, pCircle, pRing, initPixelMode } from "./pixel.js";
import { FIELD_TOP, SKILL_Y } from "./layout.js";
import { drawDungeon } from "./stars.js";
import { drawParticles } from "./particles.js";
import { drawEffects, drawHurtOverlay } from "./fx.js";
import { drawBoss, drawBossBar, drawBossBullets, drawBossLasers, drawBossDangerZones, drawEnemyBullets } from "./boss.js";
import {
    drawUI,
    drawMenu,
    drawRewardScreen,
    drawSkillSwap,
    drawCurseScreen,
    drawEventScreen,
    drawBossClear,
    drawPauseScreen,
    drawSettingsScreen,
    drawStatusScreen,
    drawDevModeScreen,
    drawCodex,
    drawGameOver,
    drawVictory,
} from "./ui.js";
import { drawGuideOverlay } from "./tutorial.js";

// ─── 挡板：石质符文平台 ───────────────────────────────────
//
// 核心受击区 vs 加宽翼的区分是这块美术的首要任务：
// 只有核心区会被敌弹判定（见 physics.paddleHitRect），翼区纯粹用来接球。
// 原实现两者同色，仅靠顶部两个金色小刻痕区分——4px 的刻痕在实战里根本看不见。
//
// 现在用三重手段拉开差距：
//   ① 材质分离——翼区改用冷石灰（stone），核心区保留皮肤本色，色相与明度双重对比；
//   ② 呼吸光——核心区顶面有一条随时间明暗起伏的高光条，动态元素在余光里最抓眼；
//   ③ 硬边界——核心区两端各一条贯穿板高的金色竖线 + 上方箭头刻痕，边界位置零歧义。
export function drawPaddle() {
    if (!state.paddle) return;
    const sk = skinDef(getSelectedSkin()) || DEFAULT_SKIN_COLORS;
    const light = sk.paddle2;
    const base = sk.paddle1;

    const p = state.paddle;
    const x = snap(p.x), y = snap(p.y), w = snap(p.width), h = snap(p.height);

    // 受击无敌闪烁：整体隐去一半帧
    if (state.invulnTimer > 0 && Math.floor(state.invulnTimer / 5) % 2 === 0) {
        ctx.globalAlpha = 0.4;
    }

    // 核心受击区几何（与 physics.paddleHitRect 保持同一套公式）。
    //
    // 注意：受击区可能比挡板本体更宽——"收缩"诅咒能把 paddleBonus 压到 -0.5
    // （宽度 55px），而"臃肿"诅咒同时把受击宽度推到 110px 以上。此时整块板
    // 都在受击范围内，没有安全翼区，必须夹持绘制范围，否则核心色会溢出板外，
    // 玩家会以为挡板变宽了。
    // 先各自 snap 到网格再夹持，而不是夹持后再 snap——后者的舍入会把右边缘
    // 推出板外一格（实测 3 例溢出）。
    const baseW = PADDLE_BASE_W * (1 + (state.player.curseHitPenalty || 0));
    const coreX = Math.max(x, snap(p.x + (p.width - baseW) / 2));
    const coreR = Math.min(x + w, snap(p.x + (p.width + baseW) / 2));
    const coreW = Math.max(PX, coreR - coreX);
    const hasWings = p.width > baseW + PX;

    // 硬黑轮廓
    pRect(x - PX, y - PX, w + PX * 2, h + PX * 2, PAL.ink0);

    // ① 翼区底材：暗石。核心区随后覆盖在其上。
    //
    // 用 stone0 而非 stone1：实测 stone1 的亮度（65）与"默认"皮肤的 paddle1
    // #633a86（72）和"绯红"皮肤 #8c2e38（67）几乎相同，翼区与核心区糊成一片。
    // stone0 把翼区压到亮度 ~45，对四套皮肤都留出足够落差。
    // 翼区不参与受击，视觉上要"退后"，所以不给高饱和色也不给呼吸光。
    pRect(x, y, w, h, PAL.stone0);
    pRect(x, y, w, PX, PAL.stone1);               // 顶部微高光（比核心区暗得多）
    pRect(x, y + h - PX, w, PX, PAL.ink0);        // 底部阴影
    pRect(x, y + PX, PX, h - PX * 2, PAL.stone1);
    pRect(x + w - PX, y + PX, PX, h - PX * 2, PAL.ink0);

    // 翼区斜纹：低对比对角线，读作"这里是延展出的托板，不是本体"
    if (hasWings) {
        drawWingHatch(x, y, coreX, h);
        drawWingHatch(coreX + coreW, y, x + w, h);
    }

    // ② 核心受击区主体：皮肤本色，明度与饱和度都高于翼区
    pRect(coreX, y, coreW, h, base);
    pRect(coreX, y + h - PX, coreW, PX, PAL.ink1);

    // 呼吸光：顶面高光条在 light ↔ bone1 之间起伏。
    // 用 state.time（帧计数）而非 Date.now()，暂停时呼吸也跟着停，
    // 且与游戏的时间缩放一致，不会在慢动作里显得突兀。
    const breath = 0.5 + 0.5 * Math.sin(state.time * 0.055);
    pRect(coreX, y, coreW, PX, breath > 0.5 ? PAL.bone1 : light);
    pRect(coreX, y + PX, coreW, PX, light);
    // 呼吸最亮的相位再往板外溢一格光，形成"核心在发亮"的观感
    if (breath > 0.72) {
        ctx.fillStyle = rgba(PAL.bone1, (breath - 0.72) * 1.4);
        ctx.fillRect(coreX, y - PX * 2, coreW, PX);
    }

    // 中央符文槽：只画在核心区内，强化"这一段才是本体"
    const runeCount = Math.max(3, Math.floor(coreW / (PX * 12)));
    for (let i = 0; i < runeCount; i++) {
        const rx = snap(coreX + (coreW / (runeCount + 1)) * (i + 1) - PX);
        pRect(rx, y + PX * 3, PX * 2, h - PX * 5, PAL.ink1);
    }

    // ③ 边界：贯穿板高的金色竖线，两端各一条。
    //    这是核心区与翼区之间唯一的硬边，玩家靠它判断"弹幕会不会打到我"。
    if (hasWings) {
        pRect(coreX - PX, y, PX, h, PAL.gold1);
        pRect(coreX, y, PX, h, PAL.gold3);
        pRect(coreX + coreW - PX, y, PX, h, PAL.gold3);
        pRect(coreX + coreW, y, PX, h, PAL.gold1);

        // 上方箭头刻痕：指向内侧，明确"受击区在这两标记之间"
        drawCoreTick(coreX, y, 1);
        drawCoreTick(coreX + coreW - PX, y, -1);
    } else {
        // 无安全翼区：整块板都会被弹幕判定。用整圈金框替代两条竖线，
        // 让"全板暴露"成为一个独立可读的状态，而不是"看不到边界所以以为很安全"。
        pStroke(coreX, y, coreW, h, PAL.gold2, 1);
    }

    // 击球闪白：只闪核心区，让"接到球"的反馈和受击区绑定
    if (p.flash > 0.02) {
        ctx.fillStyle = rgba(PAL.bone1, p.flash * 0.75);
        ctx.fillRect(coreX, y, coreW, h);
    }

    // 受击红框
    if (state.hurtTimer > 0) {
        pStroke(x - PX * 2, y - PX * 2, w + PX * 4, h + PX * 4, PAL.blood2, 1);
    }

    ctx.globalAlpha = 1;

    // 能量护盾：脉动像素框
    if (state.player.shieldTimer > 0) {
        const pulse = Math.floor(Date.now() / 120) % 2 === 0;
        pStroke(x - PX * 3, y - PX * 3, w + PX * 6, h + PX * 6, pulse ? PAL.arc3 : PAL.arc2, 1);
    }
}

// 翼区斜纹：每 3 格一道对角线。用 ink1（比翼区底材 stone0 暗一档）
// 而非 alpha 混合，保证在任何皮肤配色下都是同一个"非受击区"的视觉语言。
function drawWingHatch(x0, y, x1, h) {
    const step = PX * 3;
    ctx.fillStyle = PAL.ink1;
    for (let sx = snap(x0); sx < x1; sx += step) {
        for (let row = 0; row < Math.floor(h / PX) - 1; row++) {
            const px = sx + row * PX;
            if (px < x0 || px + PX > x1) continue;
            ctx.fillRect(px, y + PX + row * PX, PX, PX);
        }
    }
}

// 核心区端点刻痕：板上方一个朝内的三格阶梯箭头
function drawCoreTick(bx, y, dir) {
    for (let i = 0; i < 3; i++) {
        const w = PX * (3 - i);
        const px = dir > 0 ? bx : bx + PX - w;
        pRect(px, y - PX * (2 + i), w, PX, i === 0 ? PAL.gold3 : PAL.gold2);
    }
}

// ─── 球：像素宝珠 ─────────────────────────────────────────
export function drawBalls() {
    for (let i = 0; i < state.balls.length; i++) {
        const b = state.balls[i];
        // 主球按身份标记着色，而非数组下标：主球身份固定，
        // 副球落地导致数组重排时金色不会跳到别的球上。
        const isMain = !!b.isMain;
        // 中毒：整颗球转紫，玩家一眼能看出伤害为什么变低。
        // 免疫窗口内球缘留一圈苔绿，提示"现在可以安全穿毒圈"。
        const poisoned = b.poisonTimer > 0;
        // 四段明度坡：白热核心 → 亮色 → 主色 → 暗边。
        // 原实现最亮只到 gold3/arc3，球整体偏灰；加一段 bone1 白热核心后
        // 球体在暗色地牢背景上的对比度显著提升，且不引入调色板外的新色。
        const hot = poisoned ? PAL.bone0 : PAL.bone1;
        const core = poisoned ? PAL.vio3 : isMain ? PAL.gold3 : PAL.arc3;
        const mid = poisoned ? PAL.vio2 : isMain ? PAL.gold2 : PAL.arc2;
        const edge = poisoned ? PAL.vio1 : isMain ? PAL.gold1 : PAL.arc1;

        // 拖尾：从暗到亮的光带。
        //   ① 尺寸不再随 life 线性缩到 1px——最小保底 PX*1.5，尾段仍可见；
        //   ② alpha 上限从 0.5 提到 0.85，尾段整体更实；
        //   ③ 分三档取色（edge → mid → core），拖尾自带明度梯度，
        //      读起来是一条有方向的光带，而不是一串同色小方块。
        for (let t = 0; t < b.trail.length; t++) {
            const tr = b.trail[t];
            if (tr.life <= 0.08) continue;
            const s = Math.max(PX * 1.5, Math.round((b.radius * (0.45 + tr.life * 0.55)) / PX) * PX);
            const col = tr.life > 0.7 ? core : tr.life > 0.4 ? mid : edge;
            ctx.fillStyle = rgba(col, Math.min(0.85, tr.life * 0.95));
            ctx.fillRect(Math.round(tr.x - s / 2), Math.round(tr.y - s / 2), s, s);
        }

        // 外发光：球缘外一圈半透明主色，把球从背景里"托起来"。
        // 用 pCircle + globalAlpha 而非 ctx.arc，保持像素网格对齐（不产生抗锯齿边）。
        ctx.globalAlpha = 0.22;
        pCircle(b.x, b.y, b.radius + PX * 1.5, core);
        ctx.globalAlpha = 1;

        // 球体：暗边 → 主色 → 亮色 → 白热高光
        pCircle(b.x, b.y, b.radius, edge);
        pCircle(b.x, b.y, b.radius - PX * 0.5, mid);
        pCircle(b.x, b.y, b.radius - PX * 1.5, core);
        pRectRaw(b.x - b.radius * 0.45, b.y - b.radius * 0.55, PX * 2, PX * 2, hot);

        // 中毒剩余时间：球上方一道短进度条，让玩家知道还有多久恢复
        if (poisoned) {
            const ratio = Math.min(1, b.poisonTimer / 150);
            const bw = PX * 5;
            const bx = snap(b.x - bw / 2);
            const by = snap(b.y - b.radius - PX * 3);
            pRect(bx, by, bw, PX, PAL.ink0);
            pRect(bx, by, snap(bw * ratio), PX, PAL.vio3);
        } else if (b.poisonImmune > 0) {
            pRing(b.x, b.y, b.radius + PX, PAL.moss2, 1);
        }
    }
}

// ─── 方块：地牢石砖 ───────────────────────────────────────
export function drawBlocks() {
    for (const bl of state.blocks) {
        const x = snap(bl.x), y = snap(bl.y);
        const w = snap(bl.w), h = snap(bl.h);

        if (bl.indestructible) {
            drawMetalBlock(x, y, w, h);
            continue;
        }

        const tier = BLOCK_TIERS[Math.max(0, Math.min(bl.maxHp - 1, BLOCK_TIERS.length - 1))];

        // 落地阴影：所有方块统一在右下投一格暗影。
        // 地板砖本身有明暗变化，仅靠 1px 黑轮廓不足以把方块从背景里拎出来；
        // 一致方向的阴影能建立"方块浮在地板之上"的图底关系。
        pRect(x + PX, y + h, w - PX, PX, PAL.ink0);
        pRect(x + w, y + PX, PX, h - PX, PAL.ink0);

        // 轮廓
        pRect(x, y, w, h, PAL.ink0);
        // 主体
        pRect(x + PX, y + PX, w - PX * 2, h - PX * 2, tier.base);
        // 浮雕：上左亮，下右暗
        pRect(x + PX, y + PX, w - PX * 2, PX, tier.light);
        pRect(x + PX, y + PX, PX, h - PX * 2, tier.light);
        pRect(x + PX, y + h - PX * 2, w - PX * 2, PX, tier.shadow);
        pRect(x + w - PX * 2, y + PX, PX, h - PX * 2, tier.shadow);

        // 内部石纹：一条实色暗缝，让方块像砖块而非色块（用 shadow 档而非 alpha 混合）
        if (h >= PX * 5) {
            pRect(x + PX * 3, y + Math.round(h / 2 / PX) * PX, w - PX * 6, PX, tier.shadow);
        }

        // 受损裂纹：血量越低裂纹越多（替代原本的进度条）
        if (bl.hp < bl.maxHp) {
            drawCracks(x, y, w, h, bl.hp / bl.maxHp, tier.shadow);
        }

        // 重甲砖：四角铆钉 + 中央加固十字，读作"包了铁皮的砖"
        if (bl.armored) {
            drawArmorPlating(x, y, w, h);
        }

        // 移动方块：两侧箭头刻痕
        if (bl.moving) {
            pRect(x + PX * 2, y + Math.round(h / 2 / PX) * PX - PX, PX, PX * 2, tier.light);
            pRect(x + w - PX * 3, y + Math.round(h / 2 / PX) * PX - PX, PX, PX * 2, tier.light);
        }
    }
}

// 不可击碎：铆钉铁块。
//
// 原实现主体用 stone1、暗面用 stone0——而地板主题在 11~40 层正好把这两色
// 当作砖面与砖缘（stars.js 的 floorAlt/edgeLight），于是障碍物和背景同色，
// 完全分不出来。现在改成"暗芯 + 亮金属边"的高对比配色：
//   芯 ink0/ink1 比任何地板砖都暗，边 stone3/mist0 比最亮的地板砖(stone1)都亮，
// 无论哪套主题，方块边界都有明暗落差。再加警示斜纹强化"打不破"的语义。
function drawMetalBlock(x, y, w, h) {
    // 落地阴影：把铁块从地板上"抬"起来，进一步拉开图底关系
    pRect(x + PX, y + h, w - PX, PX, PAL.ink0);

    pRect(x, y, w, h, PAL.ink0);                                   // 硬轮廓
    // 暗芯用 stone0：它比最亮的地板砖(stone1)暗、比最暗的主题地板(ink1/ink2)亮，
    // 因此在五套主题下都与地板存在亮度差。用 ink1 会与 41 层主题的砖面同色。
    pRect(x + PX, y + PX, w - PX * 2, h - PX * 2, PAL.stone0);     // 暗芯
    pRect(x + PX, y + PX, w - PX * 2, PX, PAL.mist0);              // 顶部亮边
    pRect(x + PX, y + PX, PX, h - PX * 2, PAL.stone3);             // 左侧亮边
    pRect(x + PX, y + h - PX * 2, w - PX * 2, PX, PAL.stone0);     // 底部暗边
    pRect(x + w - PX * 2, y + PX, PX, h - PX * 2, PAL.stone0);     // 右侧暗边

    // 警示斜纹：45° 交替，只画在中段，避免盖掉铆钉与边框
    const stripeTop = y + PX * 2;
    const stripeH = h - PX * 4;
    if (stripeH >= PX * 2) {
        for (let sx = PX * 3; sx < w - PX * 3; sx += PX * 4) {
            for (let sy = 0; sy < stripeH; sy += PX) {
                const off = sx + (sy / PX) * PX;
                if (off >= w - PX * 3) continue;
                pRect(x + off, stripeTop + sy, PX, PX, PAL.stone2);
            }
        }
    }

    // 四角铆钉：亮点，铁件质感
    const rv = [[PX * 2, PX * 2], [w - PX * 3, PX * 2], [PX * 2, h - PX * 3], [w - PX * 3, h - PX * 3]];
    for (const [dx, dy] of rv) {
        pRect(x + dx, y + dy, PX, PX, PAL.bone0);
    }
}

// 重甲砖标记：四角铆钉 + 中央竖向加固条。
//
// 用铆钉而非整片覆盖，是为了不盖住血量档位的主体色——玩家仍要靠底色判断
// 还剩几下，铆钉只叠加"这块被加固过"的信息。铆钉用 stone3/mist0 的冷金属色，
// 与任何血量档位的暖色主体都有色相差，不会糊成一团。
// armorRatio = 1.0（满装甲）→ 0.0（装甲已碎），0 时完全不绘制。
function drawArmorPlating(x, y, w, h) {
    const R = PX * 2;
    const inset = PX * 2;
    const corners = [
        [x + inset, y + inset],
        [x + w - inset - R, y + inset],
        [x + inset, y + h - inset - R],
        [x + w - inset - R, y + h - inset - R],
    ];
    for (const [cx, cy] of corners) {
        pRect(cx, cy, R, R, PAL.stone3);
        pRect(cx, cy, R - PX, R - PX, PAL.mist0);
        pRect(cx + PX, cy + PX, PX, PX, PAL.stone0);
    }
    if (w >= PX * 10) {
        const mx = snap(x + w / 2 - PX);
        pRect(mx, y + inset, PX, h - inset * 2, PAL.stone3);
        pRect(mx + PX, y + inset, PX, h - inset * 2, PAL.stone0);
    }
}

// 裂纹：确定性伪随机，保证同一方块裂纹稳定不闪烁
function drawCracks(x, y, w, h, ratio, color) {
    const dmg = 1 - ratio;
    const seed = (x * 31 + y * 17) | 0;
    const cols = Math.floor(w / PX) - 2;
    const rows = Math.floor(h / PX) - 2;
    const count = Math.floor(cols * rows * dmg * 0.28);
    ctx.fillStyle = color;
    let s = seed;
    for (let i = 0; i < count; i++) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const cx = 1 + (s >> 8) % cols;
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const cy = 1 + (s >> 8) % rows;
        ctx.fillRect(x + cx * PX, y + cy * PX, PX, PX);
    }
}

// ─── 主渲染 ───────────────────────────────────────────────
export function render() {
    initPixelMode();

    // 底色
    ctx.fillStyle = PAL.ink1;
    ctx.fillRect(0, 0, W, H);

    // 震屏：整个世界按像素网格位移（保持像素对齐）
    ctx.save();
    if (state.shakeTime > 0) {
        const s = state.shakePower * Math.min(1, state.shakeTime / 120);
        const ox = Math.round(((Math.random() * 2 - 1) * s) / PX) * PX;
        const oy = Math.round(((Math.random() * 2 - 1) * s) / PX) * PX;
        ctx.translate(ox, oy);
    }

    drawDungeon();

    if (state.gameState === STATE.MENU) {
        drawMenu();
        drawEffects();
        ctx.restore();
        drawGuideOverlay();
        return;
    }

    drawBlocks();
    if (state.boss) drawBoss();
    drawPaddle();
    drawBalls();
    drawParticles();
    drawBossBullets();
    // 激光在弹幕之后、危险区之前：它比弹幕更致命，必须压在最上层；
    // 但仍要让暗角与 HUD 盖住它，否则光束会横穿技能栏。
    drawBossLasers();
    drawBossDangerZones();
    drawEnemyBullets();

    // 暗角在 HUD 之前绘制，且只覆盖游戏区：
    // 之前它画在最后且覆盖全屏，四角的网点会压掉 60~78% 的技能槽与生命值。
    drawFieldVignette();

    drawUI();
    if (state.boss) drawBossBar();

    if (state.gameState === STATE.START_REWARD || state.gameState === STATE.LEVEL_REWARD) {
        drawRewardScreen();
    }
    if (state.gameState === STATE.SKILL_SWAP) drawSkillSwap();
    if (state.gameState === STATE.EVENT) drawEventScreen();
    if (state.gameState === STATE.BOSS_CLEAR) drawBossClear();
    if (state.gameState === STATE.CURSE_SELECT) drawCurseScreen();
    if (state.gameState === STATE.PAUSED) drawPauseScreen();
    if (state.gameState === STATE.CODEX) drawCodex();
    if (state.gameState === STATE.STATUS) drawStatusScreen();
    if (state.gameState === STATE.DEV_MODE) drawDevModeScreen();
    if (state.gameState === STATE.SETTINGS) drawSettingsScreen();
    if (state.gameState === STATE.GAME_OVER) drawGameOver();
    if (state.gameState === STATE.VICTORY) drawVictory();

    drawEffects();

    ctx.restore();

    drawGuideOverlay();
    drawHurtOverlay();
}

// ─── 暗角 ─────────────────────────────────────────────────
// 只作用于游戏区（顶栏之下、底栏之上），并且只压左右两侧边缘。
// HUD 所在的四角完全不参与，保证技能槽/生命值/层数永远清晰可读。
let vignetteCache = null;
function drawFieldVignette() {
    const top = FIELD_TOP;
    const bottom = SKILL_Y - PX * 2;      // 底栏之上留空
    const height = bottom - top;
    if (height <= 0) return;

    if (!vignetteCache) {
        vignetteCache = document.createElement("canvas");
        vignetteCache.width = W;
        vignetteCache.height = height;
        const c = vignetteCache.getContext("2d");
        c.fillStyle = PAL.ink0;
        // 只按水平距离衰减：越靠左右边缘越暗，纵向保持均匀，
        // 这样不会在游戏区上下边界留下明显的暗弧。
        const cx = W / 2;
        for (let y = 0; y < height; y += PX) {
            for (let x = 0; x < W; x += PX) {
                const d = Math.abs(x + PX / 2 - cx) / cx;
                const density = Math.max(0, (d - 0.72) / 0.28) * 0.55;
                const th = (BAYER[(y / PX) & 3][(x / PX) & 3] + 0.5) / 16;
                if (density > th) c.fillRect(x, y, PX, PX);
            }
        }
    }
    ctx.drawImage(vignetteCache, 0, top);
}

const BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
];
