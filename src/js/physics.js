import { W, H, COLORS, MAX_BALLS, BALL_BASE_SPEED, BALL_RADIUS, PADDLE_BASE_W, BALL_BLOCK_ACCEL, BALL_SPEED_CAP, STATE, RARITY } from "./constants.js";
import { state, addScore, loseLife } from "./state.js";
import { spawnParticles } from "./particles.js";
import { screenShake, hitStop, flashPaddle, spawnRing, spawnFloatingText, playerHurt } from "./fx.js";
import { damageBoss, bulletColor, purgeBossSummons } from "./boss.js";
import { grantEventReward } from "./events.js";
import {
    playWallHit,
    playPaddleHit,
    playBlockHit,
    playBlockBreak,
    playBallLost,
    playPlayerHit,
    playHeal,
    playEventGood,
} from "./sound.js";
import { PAL } from "./palette.js";
import { FIELD_TOP } from "./layout.js";
import { SPECIALS, SPLITTER_BLOCK } from "./data/levels.js";

// 挡板实际受击区域（加宽翼不参与弹幕受击，受击长度固定为 PADDLE_BASE_W + 诅咒惩罚）
export function paddleHitRect() {
    const p = state.paddle;
    const base = PADDLE_BASE_W * (1 + (state.player.curseHitPenalty || 0));
    const extra = p.width - base;
    return { x: p.x + extra / 2, w: base, y: p.y, h: p.height };
}

export function updatePaddle() {
    const targetX = state.mouseX - state.paddle.width / 2;
    const moveSpeed = state.player.moveSpeedMul || 1;
    const lerpFactor = 0.3 * moveSpeed * (1 - (state.player.curseMoveResist || 0));
    state.paddle.x += (targetX - state.paddle.x) * Math.min(1, lerpFactor);
    // 夹持：以未加宽的原始宽度为边界，奖励加宽翼可伸出屏幕
    const base = PADDLE_BASE_W;
    const wing = (state.paddle.width - base) / 2;
    state.paddle.x = Math.max(-wing, Math.min(W - base - wing, state.paddle.x));
}

// ─── 移动方块的更新与残留敌弹 ──────────────────────────────
// 普通关的方块不再发射子弹（射手方块已移除，改为重甲砖）。
// enemyBullets 仍保留：Boss 关的场地机制仍可能往里推弹，此处统一负责推进与清理。
export function updateEnemies() {
    if (state.player.freezeTimer > 0) return;
    const dt = state.dt;

    // 方块时效：奖励方块 / Boss 收益方块到期自灭（不计入通关条件）
    for (let i = state.blocks.length - 1; i >= 0; i--) {
        const bl = state.blocks[i];
        if (!bl.expireAt || state.time <= bl.expireAt) continue;
        state.blocks.splice(i, 1);
        spawnParticles(bl.x + bl.w / 2, bl.y + bl.h / 2, PAL.stone3, 6);
    }

    for (const bl of state.blocks) {
        if (bl.moving) {
            bl.moving.phase += bl.moving.speed * dt;
            bl.x = Math.max(2, Math.min(W - bl.w - 2, bl.baseX + Math.sin(bl.moving.phase) * bl.moving.amp));
        }
    }

    const bullets = state.enemyBullets;
    if (bullets.length > 100) bullets.splice(0, bullets.length - 100);
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bu = bullets[i];
        // 冰冻方块：全场敌弹冻结（停住但不消失，球仍可击毁）
        if (state.bulletFreezeTimer > 0) continue;
        // 弹幕偏转：挡板附近敌弹减速
        const deflect = state.player.deflectRadius || 0;
        if (deflect > 0 && bu.y > state.paddle.y - deflect) {
            bu.vx *= 0.98;
            bu.vy *= 0.98;
        }
        bu.x += bu.vx * dt;
        bu.y += bu.vy * dt;
        if (bu.x < -30 || bu.x > W + 30 || bu.y < -30 || bu.y > H + 30) {
            bullets.splice(i, 1);
            continue;
        }
        const p = state.paddle;
        const hr = paddleHitRect();
        if (
            bu.x + bu.r >= hr.x &&
            bu.x - bu.r <= hr.x + hr.w &&
            bu.y + bu.r >= hr.y &&
            bu.y - bu.r <= hr.y + hr.h
        ) {
            bullets.splice(i, 1);
            enemyPaddleHit(bu);
        }
    }
}

function enemyPaddleHit(bullet) {
    const pl = state.player;
    spawnParticles(bullet.x, bullet.y, PAL.ember2, 6);
    if (pl.shieldTimer > 0) {
        spawnRing(bullet.x, bullet.y, PAL.arc3);
        playWallHit();
        return;
    }
    if (state.aegisTimer > 0) {
        spawnRing(bullet.x, bullet.y, PAL.gold3);
        playWallHit();
        return;
    }
    if (state.invulnTimer > 0) return;
    if (pl.bounceShield > 0 && Math.random() < pl.bounceShield) {
        spawnRing(bullet.x, bullet.y, PAL.gold3);
        playWallHit();
        return;
    }
    if (Math.random() < pl.bossResist) {
        spawnFloatingText(state.paddle.x + state.paddle.width / 2, state.paddle.y - 24, "格挡！", PAL.moss3);
        playWallHit();
        return;
    }
    state.invulnTimer = 90;
    playerHurt();
    screenShake(8, 200);
    playPlayerHit();
    loseLife(1);
}

// ─── 方块破坏与伤害工具（AoE / 连锁破坏） ───────────────────
// 伤害方块必须走 damageBlock，破坏方块必须走 destroyBlock，
// 保证装甲抵挡 / 特殊方块效果 / 击碎钩子在所有伤害来源（球、AoE、连锁）下一致。
function damageBlock(bl, dmg) {
    if (bl.indestructible) return;
    const cx = bl.x + bl.w / 2;
    const cy = bl.y + bl.h / 2;

    // 屏障方块：前N次攻击只破盾，不扣血
    if (bl.shieldLeft > 0) {
        bl.shieldLeft--;
        spawnParticles(cx, cy, PAL.arc3, 8);
        spawnRing(cx, cy, PAL.arc3);
        spawnFloatingText(cx, cy - 10, `护盾 -1`, PAL.arc3);
        return;
    }

    // 装甲抵挡：Lv30+改为固定伤害吸收
    if (bl.armorLeft > 0) {
        if (bl.armorAbsorbMode) {
            // 伤害吸收模式（Lv30+）
            const absorbed = Math.min(dmg, bl.armorAbsorb);
            bl.armorAbsorb -= absorbed;
            dmg -= absorbed;
            spawnParticles(cx, cy, PAL.stone3, 4);
            spawnFloatingText(cx, cy - 10, `-${absorbed}`, PAL.stone3);
            if (bl.armorAbsorb <= 0) {
                bl.armorLeft = 0;
                spawnRing(cx, cy, PAL.mist1);
            }
            if (dmg <= 0) return;
        } else {
            // 旧模式：完全无效化本次伤害
            bl.armorLeft--;
            spawnParticles(cx, cy, PAL.stone3, 6);
            spawnRing(cx, cy, PAL.mist1);
            return;
        }
    }

    bl.hp -= dmg;
    if (bl.hp <= 0) {
        destroyBlock(bl, cx, cy, { byBall: false });
    } else {
        spawnParticles(cx, cy, PAL.bone1, 2);
    }
}

function destroyBlock(bl, cx, cy, opts = {}) {
    const idx = state.blocks.indexOf(bl);
    if (idx === -1) return;
    const ci = Math.min(bl.maxHp - 1, 3);
    const col = COLORS.blockColors[ci];
    state.blocks.splice(idx, 1);
    spawnParticles(cx, cy, col, (opts.byBall ? 10 : 6) + bl.maxHp * 3);
    spawnRing(cx, cy, COLORS.blockGlow[ci]);
    spawnFloatingText(cx, cy - 6, `+${bl.maxHp * 10}`);
    if (opts.byBall) {
        screenShake(5, 100);
        hitStop(2);
        playBlockBreak();
    } else {
        playBlockHit();
    }
    addScore(bl.maxHp * 100);

    // 特殊方块效果（内存上互相排斥，按标记逐个判定即可）
    if (bl.explosive) explodeNeighbors(bl);
    if (bl.heal) healBlockEffect(cx, cy);
    if (bl.reward) rewardBlockEffect(cx, cy);
    if (bl.freeze) freezeBlockEffect(cx, cy);
    if (bl.purify) purifyBlockEffect(cx, cy);
    if (bl.assimilate) assimilateBlockEffect(cx, cy);
    if (bl.aegis) aegisBlockEffect(cx, cy);
    if (bl.frenzy) frenzyBlockEffect(cx, cy);
    if (bl.splitter) splitterBlockEffect(cx, cy, bl);
    if (bl.chain) chainBlockEffect(cx, cy, bl);
    if (bl.power) powerBlockEffect(cx, cy);
    if (bl.spread) spreadBlockEffect(cx, cy, bl);
    if (bl.momentum) momentumBlockEffect(cx, cy);
    if (bl.impact && opts.byBall) impactBlockEffect(cx, cy, bl);

    killHooks(cx, cy, { block: bl });
}

// 爆炸方块：以方块中心为圆心，半径约 1.4 倍方块最大边长范围内的所有方块
// 各受 1 点伤害（含对角线方向的相邻方块）。通过 damageBlock → destroyBlock
// 传导，被连锁击碎的方块会再次触发自身效果与击碎钩子（包括连环爆炸）。
// 方块只会被击碎一次，链必终止。
function explodeNeighbors(bl) {
    const cx = bl.x + bl.w / 2;
    const cy = bl.y + bl.h / 2;
    spawnRing(cx, cy, PAL.ember2);
    spawnParticles(cx, cy, PAL.ember2, 14);
    screenShake(3, 80);
    const radius = Math.max(bl.w, bl.h) * 1.4;
    for (const nb of state.blocks) {
        if (nb === bl || nb.indestructible) continue;
        const dx = nb.x + nb.w / 2 - cx;
        const dy = nb.y + nb.h / 2 - cy;
        if (dx * dx + dy * dy <= radius * radius) {
            damageBlock(nb, 1);
        }
    }
}

// 治疗方块：击碎恢复 0.5 条命（受治疗效果减益影响）
function healBlockEffect(cx, cy) {
    const p = state.player;
    const healAmount = SPECIALS.heal.healAmount * (p.healMul || 1);
    p.lives += healAmount;
    spawnFloatingText(cx, cy - 10, `生命 +${healAmount.toFixed(1)}`, PAL.moss3);
    playHeal();
}

// 奖励方块：击碎必定获得一个稀有奖励（立即发放，复用事件的即发奖励流程）
function rewardBlockEffect(cx, cy) {
    const def = grantEventReward(RARITY.RARE);
    if (def) {
        spawnFloatingText(400, 200, `获得稀有奖励：${def.icon} ${def.name}`, PAL.gold3);
    }
    spawnFloatingText(cx, cy - 10, "稀有奖励！", PAL.gold3);
    spawnParticles(cx, cy, PAL.gold3, 12);
    playEventGood();
}

// 冰冻方块（Boss 收益方块）：击碎冻结全场敌弹 2 秒
function freezeBlockEffect(cx, cy) {
    state.bulletFreezeTimer = 120;
    spawnFloatingText(cx, cy - 10, "敌弹冻结 2 秒！", PAL.teal2);
    spawnParticles(cx, cy, PAL.teal2, 12);
    playHeal();
}

// 净化方块：摧毁全场召唤物与祭坛，每净化一个对 Boss 造成 3 点伤害
function purifyBlockEffect(cx, cy) {
    const n = purgeBossSummons();
    if (n > 0) {
        const boss = state.boss;
        if (boss) {
            boss.hitCooldown = Math.min(boss.hitCooldown, 1);
            damageBoss(Math.min(n * 3, 15));
        }
        spawnFloatingText(cx, cy - 10, `净化 ${n} 个召唤物！`, PAL.moss3);
        spawnParticles(cx, cy, PAL.moss3, 14);
        screenShake(4, 100);
    } else {
        spawnFloatingText(cx, cy - 10, "净化：场上无召唤物", PAL.mist1);
        spawnParticles(cx, cy, PAL.moss3, 6);
    }
    playHeal();
}

// 同化方块：全场敌弹反转为友军弹，追打 Boss（每颗 1 伤害）
function assimilateBlockEffect(cx, cy) {
    let n = 0;
    const cap = 60 - state.friendlyBullets.length;
    for (const b of [...state.bossBullets, ...state.enemyBullets]) {
        if (n >= cap) break;
        // 速度反向再叠加扰动，避免全部沿原路折返挤成一束
        const spd = Math.hypot(b.vx, b.vy) || 4;
        const a = Math.atan2(-b.vy, -b.vx) + (Math.random() - 0.5) * 0.6;
        state.friendlyBullets.push({
            x: b.x, y: b.y,
            vx: Math.cos(a) * spd * 0.9,
            vy: Math.sin(a) * spd * 0.9,
            r: (b.r || 5) + 1,
            life: 5 * 60,
        });
        spawnParticles(b.x, b.y, PAL.vio2, 2);
        n++;
    }
    state.bossBullets.length = 0;
    state.enemyBullets.length = 0;
    if (n > 0) {
        spawnFloatingText(cx, cy - 10, `同化 ${n} 发敌弹！`, PAL.vio3);
        spawnParticles(cx, cy, PAL.vio2, 14);
        screenShake(4, 100);
    } else {
        spawnFloatingText(cx, cy - 10, "同化：场上无敌弹", PAL.mist1);
        spawnParticles(cx, cy, PAL.vio2, 6);
    }
    playWallHit();
}

// 圣盾方块：5 秒内挡板免疫一切弹幕（Boss 冲撞/跳砸仍生效）
function aegisBlockEffect(cx, cy) {
    state.aegisTimer = 4 * 60;
    spawnFloatingText(cx, cy - 10, "圣盾 4 秒！", PAL.gold3);
    spawnParticles(cx, cy, PAL.gold3, 14);
    playHeal();
}

// 狂澜方块：8 秒内所有球伤害 +2、球速 +8%
function frenzyBlockEffect(cx, cy) {
    state.frenzyTimer = 3 * 60;
    spawnFloatingText(cx, cy - 10, "狂澜 3 秒！", PAL.ember3);
    spawnParticles(cx, cy, PAL.ember2, 14);
    playHeal();
}

// ═══ 新增特殊方块效果 ═══

// 分裂方块：击碎后生成小球，数量根据方块原始HP决定
function splitterBlockEffect(cx, cy, bl) {
    const originalHp = bl.originalHp || bl.maxHp;
    const ballCount = SPLITTER_BLOCK.ballsByHp[Math.min(originalHp, 5)] || 3;
    const p = state.player;
    const maxAllowed = MAX_BALLS - (p.curseMaxBallsPenalty || 0);

    let spawned = 0;
    for (let i = 0; i < ballCount; i++) {
        if (state.balls.length >= maxAllowed) break;
        const angle = (Math.PI * 2 * i) / ballCount + Math.random() * 0.3;
        const speed = BALL_BASE_SPEED * p.ballSpeedMul * 0.85;
        state.balls.push({
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            speed: speed,
            radius: BALL_RADIUS * p.ballRadiusMul
                * (state.powerBlockTimer > 0 ? SPECIALS.power.sizeMultiplier : 1),
            launched: true,
            piercingLeft: p.maxPiercing,
            trail: [],
            blockHits: 0,
            poisonTimer: 0,
            poisonImmune: 0,
            isMain: false,
        });
        spawned++;
    }

    spawnFloatingText(cx, cy - 10, `分裂 +${spawned}球`, PAL.teal3);
    spawnParticles(cx, cy, PAL.teal2, 12);
    spawnRing(cx, cy, PAL.teal3);
    playEventGood();
}

// 连锁方块：闪电链连锁伤害周围方块
function chainBlockEffect(cx, cy, bl) {
    const maxChain = 5;
    const chainDamage = 1;
    const chainRadius = 150;

    let current = { x: cx, y: cy };
    let chained = 0;
    const visited = new Set([bl]);

    for (let i = 0; i < maxChain; i++) {
        const candidates = state.blocks.filter(b => {
            if (visited.has(b) || b.indestructible) return false;
            const dx = b.x + b.w / 2 - current.x;
            const dy = b.y + b.h / 2 - current.y;
            return dx * dx + dy * dy <= chainRadius * chainRadius;
        });

        if (candidates.length === 0) break;

        const target = candidates[Math.floor(Math.random() * candidates.length)];
        visited.add(target);

        const tx = target.x + target.w / 2;
        const ty = target.y + target.h / 2;

        // 视觉：闪电链粒子
        spawnParticles((current.x + tx) / 2, (current.y + ty) / 2, PAL.arc3, 4);

        damageBlock(target, chainDamage);
        current = { x: tx, y: ty };
        chained++;
    }

    if (chained > 0) {
        spawnFloatingText(cx, cy - 10, `连锁 ×${chained}`, PAL.arc3);
        screenShake(3, 80);
    }
}

// 强化方块：球变大+伤害+1，持续8秒
function powerBlockEffect(cx, cy) {
    const wasActive = state.powerBlockTimer > 0;
    state.powerBlockTimer = SPECIALS.power.buffDuration;
    // 球变大：只在 buff 从无到有时放大一次，重复拾取只续时间不叠加体积
    if (!wasActive) {
        const base = BALL_RADIUS * state.player.ballRadiusMul;
        for (const b of state.balls) b.radius = base * SPECIALS.power.sizeMultiplier;
    }
    const secs = Math.round(SPECIALS.power.buffDuration / 60);
    spawnFloatingText(cx, cy - 10, `强化 ${secs}秒！`, PAL.gold3);
    spawnParticles(cx, cy, PAL.gold2, 12);
    playHeal();
}

// 扩散方块：3圈冲击波，逐圈伤害周围方块
function spreadBlockEffect(cx, cy, bl) {
    const waves = 3;
    const waveDamage = 1;

    for (let wave = 0; wave < waves; wave++) {
        setTimeout(() => {
            const radius = 80 + wave * 60;
            spawnRing(cx, cy, wave === 0 ? PAL.ember2 : wave === 1 ? PAL.gold2 : PAL.arc3);

            for (const target of state.blocks) {
                if (target.indestructible) continue;
                const dx = target.x + target.w / 2 - cx;
                const dy = target.y + target.h / 2 - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > radius - 30 && dist < radius + 30) {
                    damageBlock(target, waveDamage);
                }
            }
        }, wave * 300);
    }

    spawnFloatingText(cx, cy - 10, `扩散 ${waves}圈`, PAL.ember3);
    screenShake(4, 100);
}

// 加速方块：球速+30%，持续6秒，每次击中方块延长0.5秒
function momentumBlockEffect(cx, cy) {
    state.momentumTimer = SPECIALS.momentum.duration;
    const secs = Math.round(SPECIALS.momentum.duration / 60);
    spawnFloatingText(cx, cy - 10, `加速 ${secs}秒！`, PAL.vio3);
    spawnParticles(cx, cy, PAL.vio2, 12);
    playHeal();
}

// 重击方块：高速球双倍伤害，额外金币
function impactBlockEffect(cx, cy, bl) {
    addScore(300);
    spawnFloatingText(cx, cy - 10, "重击奖励！", PAL.gold3);
    spawnParticles(cx, cy, PAL.gold3, 16);
}

function blocksNear(cx, cy, radius) {
    return state.blocks.filter((bl) => {
        const dx = bl.x + bl.w / 2 - cx;
        const dy = bl.y + bl.h / 2 - cy;
        return dx * dx + dy * dy <= radius * radius;
    });
}

function randomNeighborBlock(cx, cy, radius) {
    const near = blocksNear(cx, cy, radius);
    return near.length > 0 ? near[Math.floor(Math.random() * near.length)] : null;
}

function highestHpBlock() {
    let best = null;
    for (const bl of state.blocks) {
        if (bl.indestructible) continue;
        if (!best || bl.hp > best.hp) best = bl;
    }
    return best;
}

// 被击毁对象（方块 / 召唤物 / 祭坛）后的连锁效果钩子。
// 召唤物与祭坛同样触发方块类奖励（爆炸、胶弹、末路追踪、贯穿计数、连击力量等），
// 但不触发任何与生命回复相关的奖励（吸血、血之吸吮、生命虹吸）。
function killHooks(cx, cy, opts) {
    const p = state.player;
    const breaks = p.perks;
    const fromBlock = !!opts.block;
    const bl = opts.block;

    // ── 仅方块：生命回复类 ──
    if (fromBlock) {
        // 吸血之触
        if (p.healChance > 0 && Math.random() < p.healChance) {
            p.lives += 1 * (p.healMul || 1);
            spawnFloatingText(cx, cy - 20, "生命 +1", PAL.moss3);
            playHeal();
        }
        // 血之吸吮技能（每击碎 5 个方块回复 0.1 命）
        if (p.siphonTimer > 0) {
            p._siphonSkillCounter = (p._siphonSkillCounter || 0) + 1;
            if (p._siphonSkillCounter >= 5) {
                p._siphonSkillCounter = 0;
                p.lives += 0.1 * (p.healMul || 1);
                spawnFloatingText(cx, cy - 20, "生命 +0.1（技能）", PAL.blood3);
                playHeal();
            }
        }
        // 生命虹吸：每击碎 15 个方块回复 0.1 命
        if (p.lifeSiphon > 0) {
            p._siphonCounter = (p._siphonCounter || 0) + 1;
            if (p._siphonCounter >= 15) {
                p._siphonCounter = 0;
                p.lives += 0.1 * (p.healMul || 1);
                spawnFloatingText(cx, cy - 20, `生命 +${0.1}`, PAL.moss3);
                playHeal();
            }
        }
        // 震荡诅咒：每次击碎方块球速 +n×1.5%（每关重置）
        if (p.curseDecelPerLevel > 0) {
            p.curseDecayCounter = (p.curseDecayCounter || 0) + 1;
            // 每击碎一个方块，累加一次微量速度提升
            const speedUp = 1 + p.curseDecelPerLevel * p.curseDecayCounter * 0.002;
            for (const b of state.balls) {
                if (b.speed < 10) {
                    b.speed *= speedUp;
                    const spd = Math.hypot(b.vx, b.vy);
                    if (spd > 0.01) {
                        const ratio = b.speed / spd;
                        b.vx *= ratio;
                        b.vy *= ratio;
                    }
                }
            }
        }
        // 弹射连击：每击碎一个方块，3 秒内伤害 +0.5，最多 +4
        if (breaks.bouncy_combo) {
            p.comboTimer = 180;
            p.comboPower = Math.min(4, (p.comboPower || 0) + 0.5);
            spawnFloatingText(cx, cy - 22, `力量 +0.5（${p.comboPower}）`, PAL.gold3);
        }
    }

    // ── 通用：作用于方块的伤害类（召唤物 / 祭坛被毁时同样触发） ──
    // 回音击：弹片伤及随机邻块
    const echoN = breaks.echo_hit || 0;
    for (let e = 0; e < echoN; e++) {
        const target = randomNeighborBlock(cx, cy, 110);
        if (target) damageBlock(target, 1);
    }
    // 爆炸共鸣 / 爆裂蓄力技能
    const explN = breaks.explosion_res || 0;
    let explode = p.explosiveTimer > 0;
    if (!explode && explN > 0 && Math.random() < 0.25 * explN) explode = true;
    if (explode) {
        spawnRing(cx, cy, PAL.ember2);
        spawnParticles(cx, cy, PAL.ember2, 16);
        for (const nb of blocksNear(cx, cy, 80)) damageBlock(nb, 1);
        screenShake(4, 90);
    }
    // 末路追踪：每击碎 8 个目标追踪一次
    if (breaks.meteor) {
        p.breakCount = (p.breakCount || 0) + 1;
        if (p.breakCount % 8 === 0) {
            const target = highestHpBlock();
            if (target) {
                const tx = target.x + target.w / 2;
                const ty = target.y + target.h / 2;
                spawnFloatingText(tx, ty - 10, "流星！", PAL.gold3);
                spawnRing(tx, ty, PAL.gold3);
                damageBlock(target, 3);
            }
        }
    }
    // 碎裂余波：击碎时概率对相邻方块造成 1 点伤害
    if (p.shatterChance > 0 && Math.random() < p.shatterChance) {
        const radius = bl ? bl.w * 1.2 : 110;
        for (const nb of blocksNear(cx, cy, radius)) {
            if (nb !== bl) damageBlock(nb, 1);
        }
    }
    // 能量涌动：每击碎 5 个目标，下一击伤害 +1（每关重置）
    if (p.surgeNeed > 0) {
        p.surgeCounter = (p.surgeCounter || 0) + 1;
        if (p.surgeCounter >= p.surgeNeed) {
            p.surgeCounter = 0;
            p.surgeBonus = (p.surgeBonus || 0) + 1;
            spawnFloatingText(cx, cy - 20, `蓄力 +${p.surgeBonus}`, PAL.moss3);
        }
    }
    // 弹射连击（召唤物 / 祭坛）：同样累计力量
    if (!fromBlock && breaks.bouncy_combo) {
        p.comboTimer = 180;
        p.comboPower = Math.min(4, (p.comboPower || 0) + 0.5);
        spawnFloatingText(cx, cy - 22, `力量 +0.5（${p.comboPower}）`, PAL.gold3);
    }
}

const ghostActive = () => state.player.ghostTimer > 0;

const onBallHits = (b, cx) => {
};

// ─── 球的更新 ─────────────────────────────────────────────
// ─── 球的有效伤害 ─────────────────────────────────────────
// 所有伤害点（方块 / Boss / 召唤物 / 祭坛）都必须走这里，否则新增伤害来源
// 会静默绕过中毒减伤。中毒 = 伤害减半，向下取整但不低于 1
// （否则 1 点伤害的球中毒后打不动任何东西，等于被完全废掉）。
export function ballDamageOf(b) {
    const p = state.player;
    let dmg = p.ballDamage * (p.strikeTimer > 0 ? 2 : 1);
    // 狂澜方块：所有球伤害 +2
    if (state.frenzyTimer > 0) dmg += 2;
    // 强化方块：所有球伤害 +1
    if (state.powerBlockTimer > 0) dmg += SPECIALS.power.damagePlus;
    if (b && b.poisonTimer > 0) dmg = Math.max(1, Math.floor(dmg * 0.75));
    // 精准打击：空中累积伤害加成，击中方块后由 onBallHits 重置
    if (b && p.precisionDmg > 0 && b.airFrames) {
        const bonus = Math.floor(b.airFrames / 120) * p.precisionDmg;
        dmg += Math.min(p.precisionMax, bonus);
    }
    // 能量涌动：下一击伤害加成，击中方块后由 onBallHits 消耗
    if (b && p.surgeBonus > 0) {
        dmg += p.surgeBonus;
        p.surgeBonus = 0;
    }
    // 弹射连击：击碎方块后 3 秒内的伤害加成（3 秒内未续上则清零）
    if (b && p.comboPower > 0) {
        dmg += p.comboPower;
    }
    return dmg;
}

// 毒雾参数（帧，60fps）
const POISON_DURATION = 150;   // 减伤持续 2.5s
const POISON_IMMUNE = 120;     // 效果结束后 2s 免疫，防止在毒圈里被反复上毒

export function updateBalls() {
    const balls = state.balls;
    const blocks = state.blocks;
    const paddle = state.paddle;
    const p = state.player;
    const dt = state.dt;

    for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];

        // 拖尾采样。衰减 0.045/帧 ≈ 22 帧寿命，配合 20 个采样上限，
        // 让高速球拉出足够长的光带——球是玩家唯一需要持续追踪的物体，
        // 拖尾越清晰，预判落点越容易。
        b.trail.push({ x: b.x, y: b.y, life: 1 });
        b.trail = b.trail.filter((t) => {
            t.life -= 0.045 * state.dt;
            return t.life > 0;
        });
        if (b.trail.length > 20) b.trail.splice(0, b.trail.length - 20);

        // 中毒计时：先走减伤时长，归零后转入免疫窗口
        if (b.poisonTimer > 0) {
            b.poisonTimer -= dt;
            if (b.poisonTimer <= 0) {
                b.poisonTimer = 0;
                b.poisonImmune = POISON_IMMUNE;
                spawnFloatingText(b.x, b.y - 16, "毒性消退", PAL.moss3);
            }
        } else if (b.poisonImmune > 0) {
            b.poisonImmune = Math.max(0, b.poisonImmune - dt);
        }

        if (!b.launched) {
            b.x = paddle.x + paddle.width / 2;
            b.y = paddle.y - b.radius - 2;
            continue;
        }

        // 祭坛诅咒：球速 +10%；狂澜方块：球速 +8%；加速方块：球速 +30%
        const speedMul = (p.altarSpeedP || 1) * dt
            * (state.frenzyTimer > 0 ? 1.08 : 1)
            * (state.momentumTimer > 0 ? SPECIALS.momentum.speedMultiplier : 1);
        b.x += b.vx * speedMul;
        b.y += b.vy * speedMul;

        // 精准打击：追踪空中累积帧数
        if (b.launched) b.airFrames = (b.airFrames || 0) + 1;

        // 毒雾：球进入毒区则中毒减伤。放在移动之后判定，避免用上一帧的位置。
        applyPoisonZones(b);

        // Wall collisions
        if (b.x - b.radius <= 0) {
            b.x = b.radius;
            b.vx = Math.abs(b.vx);
            spawnParticles(b.x, b.y, PAL.stone3, 3);
            playWallHit();
        }
        if (b.x + b.radius >= W) {
            b.x = W - b.radius;
            b.vx = -Math.abs(b.vx);
            spawnParticles(b.x, b.y, PAL.stone3, 3);
            playWallHit();
        }
        // 天花板 = 游戏区上沿（顶栏下方），避免球飞到 HUD 背后看不见
        if (b.y - b.radius <= FIELD_TOP) {
            b.y = FIELD_TOP + b.radius;
            b.vy = Math.abs(b.vy);
            spawnParticles(b.x, b.y, PAL.stone3, 3);
            playWallHit();
        }

        // Bottom - lose ball
        //
        // 主球身份固定：不再由"落地后另选一颗球接任主球"的机制转移。
        // 主球落地 = 直接扣血 + 回到挡板重新发球；副球落地只是消失。
        // Boss 关不受影响，所有球落地都免费返回。
        if (b.y - b.radius > H + 20) {
            if (state.boss) {
                // Boss 战：球落地不扣血，自动返回
                resetBallToPaddle(b);
                continue;
            }
            if (b.isMain && p.lifesaverLeft > 0) {
                p.lifesaverLeft--;
                resetBallToPaddle(b);
                spawnFloatingText(W / 2, H / 2, "救生圈生效！", PAL.moss3);
                playHeal();
                continue;
            }
            if (b.isMain) {
                // 主球落地：扣血。诅咒的额外坠落伤害在此叠加。
                const dmg = 1 + (p.curseFallDamage || 0);
                screenShake(9, 220);
                playBallLost();
                spawnFloatingText(W / 2, H / 2 + 40, "主球坠落！", PAL.blood3);
                loseLife(dmg);
                // 扣血可能直接触发 GAME_OVER，此时不要把球放回场上
                if (state.gameState !== STATE.PLAYING) {
                    balls.splice(i, 1);
                    continue;
                }
                resetBallToPaddle(b);
                continue;
            }
            balls.splice(i, 1);
            screenShake(6, 150);
            playBallLost();
            continue;
        }

        // Paddle collision
        if (
            b.vy > 0 &&
            b.y + b.radius >= paddle.y &&
            b.y + b.radius <= paddle.y + paddle.height + 10 &&
            b.x >= paddle.x - b.radius &&
            b.x <= paddle.x + paddle.width + b.radius
        ) {
            b.y = paddle.y - b.radius;
            const hitPos = (b.x - paddle.x) / paddle.width;
            const clampedPos = Math.max(0.05, Math.min(0.95, hitPos));
            const angle = (1 - clampedPos) * Math.PI * 0.7 + Math.PI * 0.15;
            // 接球时重置速度为基准（抹掉累计加速）
            b.speed = BALL_BASE_SPEED * p.ballSpeedMul;
            b.vx = Math.cos(angle) * b.speed;
            b.vy = -Math.abs(Math.sin(angle) * b.speed);
            b.piercingLeft = p.maxPiercing;
            b.airFrames = 0; // 精准打击：重置空中计数

            flashPaddle();
            spawnRing(b.x, b.y, PAL.arc2);
            playPaddleHit();
        }

        // Boss 治疗单位碰撞
        if (state.boss) {
            for (const minion of state.boss.minions) {
                const dx = b.x - minion.x;
                const dy = b.y - minion.y;
                const dist = Math.hypot(dx, dy);
                const rr = minion.r + b.radius;
                if (dist >= rr || dist <= 0.001) continue;
                const nx = dx / dist;
                const ny = dy / dist;
                b.x = minion.x + nx * (rr + 1);
                b.y = minion.y + ny * (rr + 1);
                const dot = b.vx * nx + b.vy * ny;
                if (dot < 0) {
                    // 穿透对召唤物同样生效：不反弹，直接穿过
                    if (b.piercingLeft > 0) {
                        b.piercingLeft--;
                    } else {
                        b.vx -= 2 * dot * nx;
                        b.vy -= 2 * dot * ny;
                    }
                }
                minion.hp -= ballDamageOf(b);
                minion.flash = 1;
                spawnParticles(b.x, b.y, PAL.moss3, 4);
                if (minion.hp <= 0) {
                    spawnParticles(minion.x, minion.y, PAL.moss3, 12);
                    const idx = state.boss.minions.indexOf(minion);
                    if (idx >= 0) state.boss.minions.splice(idx, 1);
                    // 召唤物受方块类奖励影响，但跳过吸血/加血类奖励
                    killHooks(minion.x, minion.y, { minion: true });
                    if (state.boss) {
                        state.boss.hp -= 10;
                        state.boss.flash = 1;
                        spawnFloatingText(state.boss.x, state.boss.y - 40, "召唤物死亡反噬！", PAL.blood2);
                    }
                }
            }
        }

        // Boss collision
        if (state.boss) {
            const bo = state.boss;
            const dx = b.x - bo.x;
            const dy = b.y - bo.y;
            const dist = Math.hypot(dx, dy);
            const rr = bo.r + b.radius;
            if (dist < rr && dist > 0.001) {
                const nx = dx / dist;
                const ny = dy / dist;
                b.x = bo.x + nx * (rr + 1);
                b.y = bo.y + ny * (rr + 1);
                const dot = b.vx * nx + b.vy * ny;
                if (dot < 0) {
                    b.vx -= 2 * dot * nx;
                    b.vy -= 2 * dot * ny;
                }
                let bdmg = ballDamageOf(b);
                // 铁壁执行者：正面减伤（球从下方打正面），背面增伤（球从上方打背）
                if (bo.bossType === "executor") {
                    if (ny > 0.3) {
                        bdmg = Math.max(1, Math.round(bdmg * 0.25));
                        spawnFloatingText(bo.x, bo.y - bo.r - 26, "正面!", PAL.mist1);
                    } else if (ny < -0.3) {
                        bdmg = Math.round(bdmg * 1.5);
                        spawnFloatingText(bo.x, bo.y - bo.r - 26, "背击!", PAL.gold3);
                    }
                }
                // 祭坛诅咒：伤害 -1
                if (p.altarDmgP) bdmg = Math.max(1, bdmg - 1);
                damageBoss(bdmg);
                spawnRing(b.x, b.y, PAL.ember3);
                spawnParticles(b.x, b.y, PAL.ember3, 8);
            }

            // 祭坛碰撞（球可摧毁祭坛）
            if (bo.altars && bo.altars.length > 0) {
                for (let k = bo.altars.length - 1; k >= 0; k--) {
                    const al = bo.altars[k];
                    const adx = b.x - al.x;
                    const ady = b.y - al.y;
                    const adist = Math.hypot(adx, ady);
                    const arr = al.r + b.radius;
                    if (adist < arr && adist > 0.001) {
                        const anx = adx / adist;
                        const any = ady / adist;
                        b.x = al.x + anx * (arr + 1);
                        b.y = al.y + any * (arr + 1);
                        const adot = b.vx * anx + b.vy * any;
                        if (adot < 0) {
                            b.vx -= 2 * adot * anx;
                            b.vy -= 2 * adot * any;
                        }
                        al.hp -= ballDamageOf(b);
                        al.flash = 1;
                        spawnParticles(b.x, b.y, PAL.vio2, 4);
                        if (al.hp <= 0) {
                            spawnParticles(al.x, al.y, PAL.vio2, 15);
                            bo.altars.splice(k, 1);
                            spawnFloatingText(al.x, al.y - 20, "祭坛摧毁！", PAL.vio2);
                            // 祭坛受方块类奖励影响，但跳过吸血/加血类奖励
                            killHooks(al.x, al.y, { altar: true });
                        }
                    }
                }
            }
        }

        // 球击毁弹幕。碎屑取弹体自身配色（#ff6b9d 是调色板外的旧硬编码色）
        destroyBulletsWithBall(b, state.bossBullets, null);
        destroyBulletsWithBall(b, state.enemyBullets, PAL.ember2);

        // Block collisions
        for (let j = blocks.length - 1; j >= 0; j--) {
            const bl = blocks[j];
            if (
                b.x + b.radius < bl.x ||
                b.x - b.radius > bl.x + bl.w ||
                b.y + b.radius < bl.y ||
                b.y - b.radius > bl.y + bl.h
            ) {
                continue;
            }

            b.blockHits = (b.blockHits || 0) + 1;
            const ghost = ghostActive();

            // 不可击碎方块
            if (bl.indestructible) {
                if (!ghost) bounceSide(b, bl);
                spawnParticles(b.x, b.y, PAL.stone3, 3);
                playBlockHit();
                break;
            }

            const overlapX = b.radius + bl.w / 2 - Math.abs(b.x - (bl.x + bl.w / 2));
            const overlapY = b.radius + bl.h / 2 - Math.abs(b.y - (bl.y + bl.h / 2));

            // 重甲装甲：Lv30+改为固定伤害吸收
            let dmg = ballDamageOf(b);
            if (bl.armorLeft > 0) {
                if (bl.armorAbsorbMode) {
                    // 伤害吸收模式（Lv30+）
                    const acx = bl.x + bl.w / 2;
                    const acy = bl.y + bl.h / 2;
                    const absorbed = Math.min(dmg, bl.armorAbsorb);
                    bl.armorAbsorb -= absorbed;
                    dmg = Math.max(0, dmg - absorbed);
                    spawnParticles(acx, acy, PAL.stone3, 4);
                    spawnFloatingText(acx, acy - 10, `-${absorbed}`, PAL.stone3);
                    if (bl.armorAbsorb <= 0) {
                        bl.armorLeft = 0;
                        spawnRing(acx, acy, PAL.mist1);
                    }
                    // 如果伤害被完全吸收，反弹后退出
                    if (dmg === 0) {
                        if (!ghost) {
                            if (overlapX < overlapY) {
                                b.vx = -b.vx;
                                b.x += (b.vx > 0 ? 1 : -1) * (overlapX + 1);
                            } else {
                                b.vy = -b.vy;
                                b.y += (b.vy > 0 ? 1 : -1) * (overlapY + 1);
                            }
                        }
                        playBlockHit();
                        break;
                    }
                } else {
                    // 旧模式：完全无效化本次伤害
                    bl.armorLeft--;
                    const acx = bl.x + bl.w / 2;
                    const acy = bl.y + bl.h / 2;
                    spawnParticles(acx, acy, PAL.stone3, 8);
                    spawnRing(acx, acy, PAL.mist1);
                    spawnFloatingText(acx, acy - 10, "装甲抵挡！", PAL.mist1);
                    if (!ghost) {
                        if (overlapX < overlapY) {
                            b.vx = -b.vx;
                            b.x += (b.vx > 0 ? 1 : -1) * (overlapX + 1);
                        } else {
                            b.vy = -b.vy;
                            b.y += (b.vy > 0 ? 1 : -1) * (overlapY + 1);
                        }
                    }
                    playBlockHit();
                    break;
                }
            }
            // 弱点打击：对满血方块额外伤害
            if (p.weakpointDmg > 0 && bl.hp >= bl.maxHp) {
                bl.hp -= p.weakpointDmg;
                spawnFloatingText(bl.x + bl.w / 2, bl.y - 10, "弱点！", PAL.moss3);
            }
            bl.hp -= dmg;

            // 撞击方块时球加速
            const cap = BALL_BASE_SPEED * p.ballSpeedMul * BALL_SPEED_CAP;
            if (b.speed < cap) {
                b.speed = Math.min(cap, b.speed * (1 + BALL_BLOCK_ACCEL));
                const spd = Math.hypot(b.vx, b.vy);
                if (spd > 0.01) {
                    const ratio = b.speed / spd;
                    b.vx *= ratio;
                    b.vy *= ratio;
                }
            }

            if (bl.hp <= 0) {
                const cx = bl.x + bl.w / 2;
                const cy = bl.y + bl.h / 2;
                destroyBlock(bl, cx, cy, { byBall: true });

                onBallHits(b, cx);

                if (!ghost) {
                    if (bl.bounce) {
                        extremeBounce(b, overlapX < overlapY ? "x" : "y");
                    } else if (b.piercingLeft > 0) {
                        b.piercingLeft--;
                    } else {
                        if (overlapX < overlapY) {
                            b.vx = -b.vx;
                        } else {
                            b.vy = -b.vy;
                        }
                    }
                }
            } else {
                // Block survived
                if (!ghost) {
                    if (bl.bounce) {
                        // 弹射方块：即使未击碎也以极端角度反弹
                        const dir = overlapX < overlapY ? "x" : "y";
                        if (dir === "x") {
                            b.x += (b.vx > 0 ? 1 : -1) * (overlapX + 1);
                        } else {
                            b.y += (b.vy > 0 ? 1 : -1) * (overlapY + 1);
                        }
                        extremeBounce(b, dir);
                    } else if (overlapX < overlapY) {
                        b.vx = -b.vx;
                        b.x += (b.vx > 0 ? 1 : -1) * (overlapX + 1);
                    } else {
                        b.vy = -b.vy;
                        b.y += (b.vy > 0 ? 1 : -1) * (overlapY + 1);
                    }
                }
                spawnParticles(b.x, b.y, PAL.bone1, 3);
                playBlockHit();
                onBallHits(b, bl.x + bl.w / 2);
            }
            break;
        }

        // 确保球有足够的纵向分量，防止横向卡死
        const spd = Math.hypot(b.vx, b.vy);
        if (b.launched && spd > 0.1 && Math.abs(b.vy) < spd * 0.25) {
            const vySign = b.vy >= 0 ? 1 : -1;
            b.vy = vySign * spd * 0.25;
            b.vx = Math.sign(b.vx) * Math.sqrt(Math.max(0, spd * spd - b.vy * b.vy));
        }
    }
}

function bounceSide(b, bl) {
    const overlapX = b.radius + bl.w / 2 - Math.abs(b.x - (bl.x + bl.w / 2));
    const overlapY = b.radius + bl.h / 2 - Math.abs(b.y - (bl.y + bl.h / 2));
    if (overlapX < overlapY) {
        b.vx = -b.vx;
        b.x += (b.vx > 0 ? 1 : -1) * (overlapX + 1);
    } else {
        b.vy = -b.vy;
        b.y += (b.vy > 0 ? 1 : -1) * (overlapY + 1);
    }
}

// 弹射方块：先按命中面翻转向量，再把弹道压到极端竖直角（约 60°），
// 确定性规则而非随机偏差，保证玩家仍可预判落点。
function extremeBounce(b, dir) {
    if (dir === "x") b.vx = -b.vx;
    else b.vy = -b.vy;
    const spd = Math.max(1, Math.hypot(b.vx, b.vy));
    const vyMag = spd * 0.87;
    const vxMag = Math.sqrt(Math.max(0, spd * spd - vyMag * vyMag));
    b.vy = (b.vy >= 0 ? 1 : -1) * vyMag;
    b.vx = (b.vx >= 0 ? 1 : -1) * vxMag;
}

// 毒雾判定：球心进入毒区就中毒。
// 三条规则，都是为了让毒圈"有威胁但不无解"：
//  ① 已中毒时再次进入不刷新时长——否则待在毒圈里就是永久减伤，无从摆脱；
//  ② 免疫窗口内不再中毒——毒圈存在 3s 而减伤 2.5s，没有免疫的话
//     效果一结束会立刻在同一个毒圈里重新中毒，实际等于永久生效；
//  ③ 按球心而非球缘判定——擦边不中毒，玩家能主动穿毒圈边缘走位。
function applyPoisonZones(b) {
    if (b.poisonTimer > 0 || b.poisonImmune > 0) return;
    for (const z of state.bossDangerZones) {
        if (!z._poison) continue;
        if (Math.hypot(b.x - z.x, b.y - z.y) > z.r) continue;
        b.poisonTimer = POISON_DURATION;
        spawnParticles(b.x, b.y, PAL.vio2, 8);
        spawnFloatingText(b.x, b.y - 18, "中毒！伤害降低", PAL.vio3);
        playBlockHit();
        break;
    }
}

// color 传 null 时按弹种取色，碎屑与被打掉的那颗弹颜色一致
function destroyBulletsWithBall(b, bulletArray, color) {
    for (let k = bulletArray.length - 1; k >= 0; k--) {
        const bl = bulletArray[k];
        if (Math.hypot(b.x - bl.x, b.y - bl.y) < b.radius + bl.r) {
            bulletArray.splice(k, 1);
            spawnParticles(bl.x, bl.y, color || bulletColor(bl), 4);
            addScore(5);
        }
    }
}

function resetBallToPaddle(b) {
    b.x = state.paddle.x + state.paddle.width / 2;
    b.y = state.paddle.y - b.radius - 2;
    b.vx = 0;
    b.vy = 0;
    b.launched = false;
    b.piercingLeft = state.player.maxPiercing;
    b.trail = [];
    // 球回到挡板等于重新出发，中毒与免疫一并清掉
    b.poisonTimer = 0;
    b.poisonImmune = 0;
    b.airFrames = 0;
}