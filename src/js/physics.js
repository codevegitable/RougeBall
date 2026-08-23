import { W, H, COLORS, MAX_BALLS, BALL_BASE_SPEED, PADDLE_BASE_W, BALL_BLOCK_ACCEL, BALL_SPEED_CAP, STATE } from "./constants.js";
import { state, addScore, loseLife } from "./state.js";
import { spawnParticles } from "./particles.js";
import { screenShake, hitStop, flashPaddle, spawnRing, spawnFloatingText, playerHurt } from "./fx.js";
import { damageBoss, bulletColor } from "./boss.js";
import {
    playWallHit,
    playPaddleHit,
    playBlockHit,
    playBlockBreak,
    playBallLost,
    playPlayerHit,
    playHeal,
} from "./sound.js";
import { PAL } from "./palette.js";
import { FIELD_TOP } from "./layout.js";

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
        // 弹幕偏转：挡板附近敌弹减速
        if (p.deflectRadius > 0 && bu.y > state.paddle.y - p.deflectRadius) {
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

// ─── 方块伤害工具（AoE / 连锁破坏） ───────────────────────
function damageBlock(bl, dmg) {
    if (bl.indestructible) return;
    bl.hp -= dmg;
    if (bl.hp <= 0) {
        const idx = state.blocks.indexOf(bl);
        if (idx === -1) return;
        const ci = Math.min(bl.maxHp - 1, 3);
        const col = COLORS.blockColors[ci];
        const cx = bl.x + bl.w / 2;
        const cy = bl.y + bl.h / 2;
        spawnParticles(cx, cy, col, 6 + bl.maxHp * 2);
        spawnRing(cx, cy, COLORS.blockGlow[ci]);
        addScore(bl.maxHp * 100);
        state.blocks.splice(idx, 1);
        playBlockHit();
    } else {
        spawnParticles(bl.x + bl.w / 2, bl.y + bl.h / 2, PAL.bone1, 2);
    }
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

// 球击碎方块后的连锁效果钩子
function postBreakHooks(cx, cy, bl) {
    const p = state.player;
    const breaks = p.perks;

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
    // 末路追踪：每击碎 8 个追踪一次
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
    // 碎裂余波：击碎时概率对左右相邻方块造成 1 点伤害
    if (p.shatterChance > 0 && Math.random() < p.shatterChance) {
        for (const nb of blocksNear(cx, cy, bl.w * 1.2)) {
            if (nb !== bl) damageBlock(nb, 1);
        }
    }
    // 能量涌动：每击碎 5 个方块，下一击伤害 +1（每关重置）
    if (p.surgeNeed > 0) {
        p.surgeCounter = (p.surgeCounter || 0) + 1;
        if (p.surgeCounter >= p.surgeNeed) {
            p.surgeCounter = 0;
            p.surgeBonus = (p.surgeBonus || 0) + 1;
            spawnFloatingText(cx, cy - 20, `蓄力 +${p.surgeBonus}`, PAL.moss3);
        }
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
            t.life -= 0.045;
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

        // 祭坛诅咒：球速 +10%
        const speedMul = (p.altarSpeedP || 1) * dt;
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
            if (p.lifesaverLeft > 0) {
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

            const dmg = ballDamageOf(b);
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
                const ci = Math.min(bl.maxHp - 1, 3);
                const col = COLORS.blockColors[ci];
                const cx = bl.x + bl.w / 2;
                const cy = bl.y + bl.h / 2;
                spawnParticles(cx, cy, col, 10 + bl.maxHp * 3);
                spawnRing(cx, cy, COLORS.blockGlow[ci]);
                spawnFloatingText(cx, cy - 6, `+${bl.maxHp * 10}`);
                screenShake(5, 100);
                hitStop(2);
                playBlockBreak();
                addScore(bl.maxHp * 100);
                // 每击碎 N 个方块生成一个新球，有分裂之球时 N=5 且取代默认 10 格机制
                const splitInterval = state.player.perks.split_ball ? 5 : 10;
                state.breakCounter = (state.breakCounter || 0) + 1;
                if (state.breakCounter % splitInterval === 0 && state.balls.length < MAX_BALLS) {
                    const nb = { ...b, isMain: false, trail: [] };
                    nb.vy = -Math.abs(nb.vy);
                    state.balls.push(nb);
                    spawnFloatingText(cx, cy - 24, "分裂！", PAL.gold3);
                }
                blocks.splice(j, 1);

                postBreakHooks(cx, cy, bl);
                onBallHits(b, cx);

                if (!ghost) {
                    if (p.perks.bouncy_combo) {
                        // 弹射连击：不反弹
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
                    if (overlapX < overlapY) {
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