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
import { drawBoss, drawBossBar, drawBossBullets, drawBossLasers, drawBossDangerZones, drawEnemyBullets, drawFriendlyBullets } from "./boss.js";
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
    drawLevelCompletePrompt,
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

    // ① 翼区底材：银灰色，与核心区拉开色相与明度双重对比，同时在地牢背景上更醒目。
    //
    // 用 mist0 而非 stone0：stone0 亮度 ~45，与多数地板主题（ink2 ~ stone0）接近，
    // 翼区在地牢背景下几乎隐形。mist0 亮度 ~75，比最亮的主题地板还亮一档，
    // 无论在哪套主题下都能与背景区分。
    // 翼区不参与受击，视觉上要"退后"，银灰的低饱和色相与核心区的高饱和色形成对比。
    pRect(x, y, w, h, PAL.mist1);
    pRect(x, y, w, PX, PAL.bone0);               // 顶部高光
    pRect(x, y + h - PX, w, PX, PAL.ink0);        // 底部阴影
    pRect(x, y + PX, PX, h - PX * 2, PAL.bone0);
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
    // 先画副球，再画主球（主球始终在最上层）
    for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < state.balls.length; i++) {
            const b = state.balls[i];
            const isMain = !!b.isMain;
            if (pass === 0 && isMain) continue;
            if (pass === 1 && !isMain) continue;
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

        if (bl.freeze) {
            drawIceBlock(x, y, w, h);
            continue;
        }

        if (bl.purify) {
            drawPurifyBlock(x, y, w, h);
            continue;
        }

        if (bl.assimilate) {
            drawAssimilateBlock(x, y, w, h);
            continue;
        }

        if (bl.aegis) {
            drawAegisBlock(x, y, w, h);
            continue;
        }

        if (bl.frenzy) {
            drawFrenzyBlock(x, y, w, h);
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

        // 重甲砖：四角铆钉 + 中央加固十字，读作"包了铁皮的砖"。
        // 装甲只画在有剩余抵挡次数时——抵挡一次攻击后装甲剥落，回归普通方块。
        if (bl.armored && bl.armorLeft > 0) {
            drawArmorPlating(x, y, w, h);
        }

        // 特殊方块标记
        if (bl.heal) drawHealMark(x, y, w, h);
        if (bl.explosive) drawExplosiveMark(x, y, w, h);
        if (bl.bounce) drawBounceMark(x, y, w, h, tier);
        if (bl.reward) drawRewardMark(x, y, w, h);
        if (bl.splitter) drawSplitterMark(x, y, w, h);

        // 移动方块：两侧箭头刻痕
        if (bl.moving) {
            pRect(x + PX * 2, y + Math.round(h / 2 / PX) * PX - PX, PX, PX * 2, tier.light);
            pRect(x + w - PX * 3, y + Math.round(h / 2 / PX) * PX - PX, PX, PX * 2, tier.light);
        }
    }
}

// 不可击碎：银灰铁块。
//
// 用 mist1 替代原 stone0 暗芯，银灰亮度远高于任何地板主题，
// 确保在所有主题下都能与背景清晰区分。
function drawMetalBlock(x, y, w, h) {
    // 落地阴影：把铁块从地板上"抬"起来，进一步拉开图底关系
    pRect(x + PX, y + h, w - PX, PX, PAL.ink0);

    pRect(x, y, w, h, PAL.ink0);                                   // 硬轮廓
    // 银灰主体：mist1 亮度远高于任何地板主题，确保对比度
    pRect(x + PX, y + PX, w - PX * 2, h - PX * 2, PAL.mist0);     // 主体
    pRect(x + PX, y + PX, w - PX * 2, PX, PAL.mist1);              // 顶部高光
    pRect(x + PX, y + PX, PX, h - PX * 2, PAL.mist0);              // 左侧亮边
    pRect(x + PX, y + h - PX * 2, w - PX * 2, PX, PAL.stone2);     // 底部暗边
    pRect(x + w - PX * 2, y + PX, PX, h - PX * 2, PAL.stone2);     // 右侧暗边

    // 警示斜纹：45° 交替，用深色增加细节
    const stripeTop = y + PX * 2;
    const stripeH = h - PX * 4;
    if (stripeH >= PX * 2) {
        for (let sx = PX * 3; sx < w - PX * 3; sx += PX * 4) {
            for (let sy = 0; sy < stripeH; sy += PX) {
                const off = sx + (sy / PX) * PX;
                if (off >= w - PX * 3) continue;
                pRect(x + off, stripeTop + sy, PX, PX, PAL.stone0);
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

// 冰冻方块（Boss 收益方块）：整块冰蓝，中心雪花十字。
// 与血量档位配色彻底脱钩——它不靠硬度说话，颜色就是"打碎有收益"的标识。
function drawIceBlock(x, y, w, h) {
    pRect(x + PX, y + h, w - PX, PX, PAL.ink0);
    pRect(x + w, y + PX, PX, h - PX, PAL.ink0);
    pRect(x, y, w, h, PAL.ink0);
    pRect(x + PX, y + PX, w - PX * 2, h - PX * 2, PAL.teal1);
    pRect(x + PX, y + PX, w - PX * 2, PX, PAL.teal2);
    pRect(x + PX, y + PX, PX, h - PX * 2, PAL.teal2);
    pRect(x + PX, y + h - PX * 2, w - PX * 2, PX, PAL.arc0);
    pRect(x + w - PX * 2, y + PX, PX, h - PX * 2, PAL.arc0);
    const mx = x + Math.round(w / 2 / PX) * PX;
    const my = y + Math.round(h / 2 / PX) * PX;
    ctx.fillStyle = PAL.bone1;
    ctx.fillRect(mx - PX * 2, my - PX / 2, PX * 4, PX);
    ctx.fillRect(mx - PX / 2, my - PX * 2, PX, PX * 4);
    ctx.fillStyle = PAL.teal2;
    ctx.fillRect(mx - PX / 2, my - PX / 2, PX, PX);
}

// 收益方块通用骨架：暗轮廓下右投影 + 上左亮/下右暗的浮雕体。
// 四种新收益方块只换主色与中心徽标，视觉语言与冰冻一致。
function drawBenefitBody(x, y, w, h, base, light, dark) {
    pRect(x + PX, y + h, w - PX, PX, PAL.ink0);
    pRect(x + w, y + PX, PX, h - PX, PAL.ink0);
    pRect(x, y, w, h, PAL.ink0);
    pRect(x + PX, y + PX, w - PX * 2, h - PX * 2, base);
    pRect(x + PX, y + PX, w - PX * 2, PX, light);
    pRect(x + PX, y + PX, PX, h - PX * 2, light);
    pRect(x + PX, y + h - PX * 2, w - PX * 2, PX, dark);
    pRect(x + w - PX * 2, y + PX, PX, h - PX * 2, dark);
}

function centerGlyph(x, y, w, h) {
    return {
        mx: x + Math.round(w / 2 / PX) * PX,
        my: y + Math.round(h / 2 / PX) * PX,
    };
}

// 净化方块：月光白主体 + 苔绿水滴（清洗脏污的语义）
function drawPurifyBlock(x, y, w, h) {
    drawBenefitBody(x, y, w, h, PAL.bone1, PAL.white, PAL.mist0);
    const { mx, my } = centerGlyph(x, y, w, h);
    ctx.fillStyle = PAL.moss2;
    ctx.fillRect(mx - PX, my - PX, PX * 2, PX); // 水珠中段
    ctx.fillRect(mx - PX / 2, my - PX * 2, PX, PX); // 上尖
    ctx.fillRect(mx - PX / 2, my, PX, PX);          // 下尖
    ctx.fillStyle = PAL.moss3;
    ctx.fillRect(mx - PX / 2, my - PX, PX, PX);    // 高光芯
}

// 同化方块：紫罗兰主体 + 骨白钩形旋涡（迷惑、反转心智）+
// 金色中心点（被同化的敌弹）
function drawAssimilateBlock(x, y, w, h) {
    drawBenefitBody(x, y, w, h, PAL.vio1, PAL.vio2, PAL.vio0);
    const { mx, my } = centerGlyph(x, y, w, h);
    ctx.fillStyle = PAL.bone1;
    ctx.fillRect(mx, my - PX, PX, PX);          // 旋涡上臂
    ctx.fillRect(mx + PX, my - PX, PX, PX);    // 旋涡右上
    ctx.fillRect(mx + PX, my, PX, PX);         // 旋涡右
    ctx.fillRect(mx, my, PX, PX);              // 旋涡内
    ctx.fillRect(mx - PX, my, PX, PX);         // 旋涡左下
    ctx.fillStyle = PAL.gold3;
    ctx.fillRect(mx - PX / 2, my - PX / 2, PX, PX);
}

// 圣盾方块：暖金主体 + 骨白盾徽（护盾语义复用秘蓝高光）
function drawAegisBlock(x, y, w, h) {
    drawBenefitBody(x, y, w, h, PAL.gold2, PAL.gold3, PAL.gold1);
    const { mx, my } = centerGlyph(x, y, w, h);
    ctx.fillStyle = PAL.bone1;
    ctx.fillRect(mx - PX, my - PX * 2, PX * 3, PX);   // 盾顶横梁
    ctx.fillRect(mx - PX, my - PX, PX * 3, PX);       // 盾身中段
    ctx.fillRect(mx - PX / 2, my, PX, PX);            // 盾尖
    ctx.fillStyle = PAL.arc3;
    ctx.fillRect(mx - PX / 2, my - PX, PX, PX);       // 盾芯
}

// 狂澜方块：炭橙主体 + 骨白闪电（爆发火力）
function drawFrenzyBlock(x, y, w, h) {
    drawBenefitBody(x, y, w, h, PAL.ember2, PAL.ember3, PAL.ember1);
    const { mx, my } = centerGlyph(x, y, w, h);
    ctx.fillStyle = PAL.bone1;
    ctx.fillRect(mx - PX, my - PX * 2, PX, PX);   // 闪电上段左
    ctx.fillRect(mx, my - PX * 2, PX, PX);       // 闪电上段右
    ctx.fillRect(mx, my - PX, PX, PX);           // 折线中段右
    ctx.fillRect(mx - PX, my - PX, PX, PX);      // 折线中段左
    ctx.fillRect(mx - PX, my, PX, PX);           // 闪电尾段
    ctx.fillStyle = PAL.ink1;
    ctx.fillRect(mx - PX / 2, my - PX / 2, PX, PX);
}

// 治疗方块：中央白色医疗十字（血量高、金色底，十字是"回复"的通用语言）
function drawHealMark(x, y, w, h) {
    const mx = x + Math.round(w / 2 / PX) * PX;
    const my = y + Math.round(h / 2 / PX) * PX;
    ctx.fillStyle = PAL.bone1;
    ctx.fillRect(mx - PX * 2, my - PX / 2, PX * 4, PX);
    ctx.fillRect(mx - PX / 2, my - PX * 2, PX, PX * 4);
    ctx.fillStyle = PAL.moss3;
    ctx.fillRect(mx - PX / 2, my - PX / 2, PX, PX);
}

// 爆炸方块：中央热芯 + 上下左右四粒火花，读作"碎了会炸"
function drawExplosiveMark(x, y, w, h) {
    const mx = x + Math.round(w / 2 / PX) * PX;
    const my = y + Math.round(h / 2 / PX) * PX;
    ctx.fillStyle = PAL.ember2;
    ctx.fillRect(mx - PX / 2, my - PX / 2, PX, PX);
    ctx.fillStyle = PAL.ember3;
    ctx.fillRect(mx - PX / 2, my - PX / 2, PX / 2, PX / 2);
    ctx.fillStyle = PAL.ink0;
    for (const [dx, dy] of [[0, -PX * 2], [0, PX * 2], [-PX * 2, 0], [PX * 2, 0]]) {
        ctx.fillRect(mx + dx, my + dy, PX, PX);
    }
}

// 弹射方块：上下两枚 V 形箭头，读作"打中会被狠狠弹开"
function drawBounceMark(x, y, w, h, tier) {
    const mx = x + Math.round(w / 2 / PX) * PX;
    const c = tier.light;
    ctx.fillStyle = c;
    ctx.fillRect(mx - PX * 2, y + PX * 2, PX, PX);
    ctx.fillRect(mx - PX, y + PX * 3, PX, PX);
    ctx.fillRect(mx, y + PX * 4, PX, PX);
    ctx.fillRect(mx - PX * 2, y + h - PX * 3, PX, PX);
    ctx.fillRect(mx - PX, y + h - PX * 4, PX, PX);
    ctx.fillRect(mx, y + h - PX * 5, PX, PX);
}

// 奖励方块：金色描边 + 中央菱形，一眼读出"这是额外收获"
function drawRewardMark(x, y, w, h) {
    pStroke(x + PX, y + PX, w - PX * 2, h - PX * 2, PAL.gold2, 1);
    const mx = x + Math.round(w / 2 / PX) * PX;
    const my = y + Math.round(h / 2 / PX) * PX;
    ctx.fillStyle = PAL.gold3;
    ctx.fillRect(mx - PX / 2, my - PX * 2, PX, PX * 4);
    ctx.fillRect(mx - PX * 2, my - PX / 2, PX * 4, PX);
    ctx.fillStyle = PAL.gold2;
    ctx.fillRect(mx - PX / 2, my - PX, PX, PX);
    ctx.fillRect(mx - PX, my - PX / 2, PX, PX);
}

// 分裂方块：青色斑点花纹，读作"碎了会分裂出小球"
function drawSplitterMark(x, y, w, h) {
    const mx = x + Math.round(w / 2 / PX) * PX;
    const my = y + Math.round(h / 2 / PX) * PX;
    const spots = [
        [mx - PX * 2, my - PX * 2],
        [mx + PX * 2, my - PX * 2],
        [mx, my],
        [mx - PX * 2, my + PX * 2],
        [mx + PX * 2, my + PX * 2],
    ];
    for (const [sx, sy] of spots) {
        ctx.fillStyle = PAL.teal2;
        ctx.fillRect(sx, sy, PX, PX);
        ctx.fillStyle = PAL.teal1;
        ctx.fillRect(sx + PX / 2, sy + PX / 2, PX / 2, PX / 2);
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
    drawFriendlyBullets();
    // 激光在弹幕之后、危险区之前：它比弹幕更致命，必须压在最上层；
    // 但仍要让暗角与 HUD 盖住它，否则光束会横穿技能栏。
    drawBossLasers();
    drawBossDangerZones();
    drawEnemyBullets();

    // 暗角：仅当获得「迷雾」诅咒时显示，左右两侧视线收缩
    if ((state.player?.curseFog || 0) > 0) drawFieldVignette();

    drawUI();
    if (state.boss) drawBossBar();

    if (state.gameState === STATE.START_REWARD || state.gameState === STATE.LEVEL_REWARD) {
        drawRewardScreen();
    }
    if (state.gameState === STATE.SKILL_SWAP) drawSkillSwap();
    if (state.gameState === STATE.EVENT) drawEventScreen();
    if (state.gameState === STATE.LEVEL_COMPLETE) drawLevelCompletePrompt();
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

// ─── 暗角（仅「迷雾」诅咒生效时显示） ─────────────────────
// 只作用于游戏区（顶栏之下、底栏之上），只压左右两侧边缘。
// 迷雾诅咒越强，暗角起始越早、密度越大。
let vignetteCache = null;
let vignetteFog = -1;
function drawFieldVignette() {
    const top = FIELD_TOP;
    const bottom = SKILL_Y - PX * 2;
    const height = bottom - top;
    if (height <= 0) return;

    const fog = state.player?.curseFog || 0;
    if (!vignetteCache || vignetteFog !== fog) {
        vignetteFog = fog;
        if (!vignetteCache) {
            vignetteCache = document.createElement("canvas");
            vignetteCache.width = W;
            vignetteCache.height = height;
        }
        const c = vignetteCache.getContext("2d");
        c.clearRect(0, 0, W, height);
        c.fillStyle = PAL.ink0;
        const cx = W / 2;
        const startThresh = Math.max(0.40, 0.72 - fog * 0.28);
        const range = Math.max(0.12, 0.28 - fog * 0.12);
        const maxDensity = Math.min(0.92, 0.55 + fog * 0.37);
        for (let y = 0; y < height; y += PX) {
            for (let x = 0; x < W; x += PX) {
                const d = Math.abs(x + PX / 2 - cx) / cx;
                const density = Math.max(0, (d - startThresh) / range) * maxDensity;
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
