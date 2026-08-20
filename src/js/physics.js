import { W, H, COLORS, MAX_BALLS } from "./constants.js";
import { state, addScore, loseLife } from "./state.js";
import { spawnParticles } from "./particles.js";
import { screenShake, hitStop, flashPaddle, spawnRing, spawnFloatingText, playerHurt } from "./fx.js";
import { spawnExtraBalls } from "./rewards.js";
import { damageBoss } from "./boss.js";
import {
    playWallHit,
    playPaddleHit,
    playBlockHit,
    playBlockBreak,
    playBallLost,
    playBossShoot,
    playPlayerHit,
    playHeal,
} from "./sound.js";

export function updatePaddle() {
    const targetX = state.mouseX - state.paddle.width / 2;
    state.paddle.x += (targetX - state.paddle.x) * 0.3;
    state.paddle.x = Math.max(0, Math.min(W - state.paddle.width, state.paddle.x));
}

// ─── 移动 / 攻击方块的更新与敌弹 ──────────────────────────
export function updateEnemies() {
    if (state.player.freezeTimer > 0) return; // 时间冻结

    for (const bl of state.blocks) {
        if (bl.moving) {
            bl.moving.phase += bl.moving.speed;
            bl.x = Math.max(2, Math.min(W - bl.w - 2, bl.baseX + Math.sin(bl.moving.phase) * bl.moving.amp));
        }
        if (bl.shooter) {
            bl.shooter.tick--;
            if (bl.shooter.tick <= 0) {
                bl.shooter.tick = bl.shooter.interval;
                const cx = bl.x + bl.w / 2;
                const cy = bl.y + bl.h;
                const px = state.paddle.x + state.paddle.width / 2;
                const py = state.paddle.y;
                const ang = Math.atan2(py - cy, px - cx);
                const spd = 2.0 + Math.min(0.6, state.player.level * 0.01);
                state.enemyBullets.push({
                    x: cx,
                    y: cy,
                    vx: Math.cos(ang) * spd,
                    vy: Math.sin(ang) * spd,
                    r: 5,
                });
                playBossShoot();
            }
        }
    }

    const bullets = state.enemyBullets;
    if (bullets.length > 100) bullets.splice(0, bullets.length - 100);
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bu = bullets[i];
        bu.x += bu.vx;
        bu.y += bu.vy;
        if (bu.x < -30 || bu.x > W + 30 || bu.y < -30 || bu.y > H + 30) {
            bullets.splice(i, 1);
            continue;
        }
        const p = state.paddle;
        if (
            bu.x + bu.r >= p.x &&
            bu.x - bu.r <= p.x + p.width &&
            bu.y + bu.r >= p.y &&
            bu.y - bu.r <= p.y + p.height
        ) {
            bullets.splice(i, 1);
            enemyPaddleHit(bu);
        }
    }
}

function enemyPaddleHit(bullet) {
    const pl = state.player;
    spawnParticles(bullet.x, bullet.y, "#ffa94d", 6);
    if (pl.shieldTimer > 0) {
        spawnRing(bullet.x, bullet.y, "rgba(120,230,255,0.9)");
        playWallHit();
        return;
    }
    if (state.invulnTimer > 0) return;
    if (Math.random() < pl.bossResist) {
        spawnFloatingText(state.paddle.x + state.paddle.width / 2, state.paddle.y - 24, "格挡！", "#7dff9b");
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
        spawnParticles(bl.x + bl.w / 2, bl.y + bl.h / 2, "#ffffff", 2);
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

    // 吸血
    if (p.healChance > 0 && Math.random() < p.healChance) {
        p.lives += 1;
        spawnFloatingText(cx, cy - 20, "生命 +1", "#7dff9b");
        playHeal();
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
        spawnRing(cx, cy, "rgba(255,160,60,0.9)");
        spawnParticles(cx, cy, "#ff9944", 16);
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
                spawnFloatingText(tx, ty - 10, "流星！", "#ffcc33");
                spawnRing(tx, ty, "rgba(255,220,120,0.9)");
                damageBlock(target, 3);
            }
        }
    }
}

const ghostActive = () => state.player.ghostTimer > 0;

const onBallHits = (b, cx) => {
    // 分裂之球
    if (state.player.perks.split_ball && (b.blockHits % 6) === 0 && state.balls.length < MAX_BALLS) {
        spawnExtraBalls(1);
        spawnFloatingText(cx, b.y - 20, "分裂！", "#a08bff");
    }
};

// ─── 球的更新 ─────────────────────────────────────────────
export function updateBalls() {
    const balls = state.balls;
    const blocks = state.blocks;
    const paddle = state.paddle;
    const p = state.player;

    for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];

        // Trail
        b.trail.push({ x: b.x, y: b.y, life: 1 });
        b.trail = b.trail.filter((t) => {
            t.life -= 0.06;
            return t.life > 0;
        });

        if (!b.launched) {
            b.x = paddle.x + paddle.width / 2;
            b.y = paddle.y - b.radius - 2;
            continue;
        }

        b.x += b.vx;
        b.y += b.vy;

        // Wall collisions
        if (b.x - b.radius <= 0) {
            b.x = b.radius;
            b.vx = Math.abs(b.vx);
            spawnParticles(b.x, b.y, "#8892b0", 3);
            playWallHit();
        }
        if (b.x + b.radius >= W) {
            b.x = W - b.radius;
            b.vx = -Math.abs(b.vx);
            spawnParticles(b.x, b.y, "#8892b0", 3);
            playWallHit();
        }
        if (b.y - b.radius <= 0) {
            b.y = b.radius;
            b.vy = Math.abs(b.vy);
            spawnParticles(b.x, b.y, "#8892b0", 3);
            playWallHit();
        }

        // Bottom - lose ball
        if (b.y - b.radius > H + 20) {
            if (state.boss) {
                // Boss 战：球落地不扣血，自动返回
                resetBallToPaddle(b);
                continue;
            }
            if (p.lifesaverLeft > 0) {
                p.lifesaverLeft--;
                resetBallToPaddle(b);
                spawnFloatingText(W / 2, H / 2, "救生圈生效！", "#7dff9b");
                playHeal();
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
            b.vx = Math.cos(angle) * b.speed;
            b.vy = -Math.abs(Math.sin(angle) * b.speed);
            b.piercingLeft = p.maxPiercing;

            flashPaddle();
            spawnRing(b.x, b.y, "rgba(130,160,255,0.9)");
            playPaddleHit();
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
                damageBoss(p.ballDamage * (p.strikeTimer > 0 ? 2 : 1));
                spawnRing(b.x, b.y, "rgba(255,120,80,0.85)");
                spawnParticles(b.x, b.y, "#ff8866", 8);
            }
        }

        // 球击毁弹幕
        destroyBulletsWithBall(b, state.bossBullets, "#ff6b9d");
        destroyBulletsWithBall(b, state.enemyBullets, "#ffa94d");

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
                spawnParticles(b.x, b.y, "#556080", 3);
                playBlockHit();
                onBallHits(b, bl.x + bl.w / 2);
                break;
            }

            const overlapX = b.radius + bl.w / 2 - Math.abs(b.x - (bl.x + bl.w / 2));
            const overlapY = b.radius + bl.h / 2 - Math.abs(b.y - (bl.y + bl.h / 2));

            const dmg = p.ballDamage * (p.strikeTimer > 0 ? 2 : 1);
            bl.hp -= dmg;

            if (bl.hp <= 0) {
                const ci = Math.min(bl.maxHp - 1, 3);
                const col = COLORS.blockColors[ci];
                const cx = bl.x + bl.w / 2;
                const cy = bl.y + bl.h / 2;
                spawnParticles(cx, cy, col, 10 + bl.maxHp * 3);
                spawnRing(cx, cy, COLORS.blockGlow[ci]);
                spawnFloatingText(cx, cy - 6, `+${bl.maxHp * 100}`);
                screenShake(5, 100);
                hitStop(2);
                playBlockBreak();
                addScore(bl.maxHp * 100);
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
                spawnParticles(b.x, b.y, "#ffffff", 3);
                playBlockHit();
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

function destroyBulletsWithBall(b, bulletArray, color) {
    for (let k = bulletArray.length - 1; k >= 0; k--) {
        const bl = bulletArray[k];
        if (Math.hypot(b.x - bl.x, b.y - bl.y) < b.radius + bl.r) {
            bulletArray.splice(k, 1);
            spawnParticles(bl.x, bl.y, color, 4);
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
}