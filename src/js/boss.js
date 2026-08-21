import { W, H, STATE, PADDLE_BASE_W } from "./constants.js";
import { state, addScore, loseLife } from "./state.js";
import { ctx } from "./canvas.js";
import { spawnParticles } from "./particles.js";
import { screenShake, spawnRing, spawnFloatingText, playerHurt } from "./fx.js";
import { playBossHit, playBossShoot, playBossDeath, playVictory, playPlayerHit, playWallHit } from "./sound.js";
import { BOSS_CANDIDATES, BOSS_TIER_INDEX } from "./data/bosses.js";

// 挡板受击区域（与 physics.js 同步）
function bossHitRect() {
    const p = state.paddle;
    const base = PADDLE_BASE_W * (1 + state.player.paddleBonus) * (1 + (state.player.curseHitPenalty || 0));
    const extra = p.width - base;
    return { x: p.x + extra / 2, w: base, y: p.y, h: p.height };
}

// 每层 Boss 2 候选
export function createBoss(level) {
    const candidates = BOSS_CANDIDATES[level];
    const def = candidates[Math.floor(Math.random() * candidates.length)];
    state.boss = {
        level, name: def.name, color: def.color, bulletSpeed: def.bulletSpeed,
        hp: def.hp, maxHp: def.hp, patterns: def.patterns,
        x: W / 2, y: 130, r: 56, t: 0, volleyIdx: 0, volleyTimer: 120,
        spiralFrames: 0, spiralAngle: 0, homingQueue: 0, homingTick: 0,
        flash: 0, tier: BOSS_TIER_INDEX.indexOf(level),
        // 冲撞
        dash: null, // { phase: "warn"|"dash", timer, tx, ty }
        dashCd: 0,
        // 卫星
        minions: [
            { angle: 0, orbit: 72, lastShot: 0 },
            { angle: Math.PI, orbit: 72, lastShot: 0 },
        ],
    };
    state.bossBullets = [];
}

export function updateBoss() {
    const boss = state.boss;
    if (!boss) return;
    if (state.player.freezeTimer > 0) return;
    const dt = state.dt;
    boss.t++;
    boss.flash = Math.max(0, boss.flash - 0.08 * dt);
    boss.dashCd = Math.max(0, boss.dashCd - dt);

    // 飘移
    boss.x = W / 2 + Math.sin(boss.t * 0.012) * 150;
    boss.y = 130 + Math.sin(boss.t * 0.023) * 22;

    // 血量阶段
    const ratio = boss.hp / boss.maxHp;
    const stage = ratio > 0.65 ? 0 : ratio > 0.35 ? 1 : 2;
    const speedMul = stage === 0 ? 1 : stage === 1 ? 1.05 : 1.15;
    const interval = stage === 0 ? 120 : stage === 1 ? 100 : 80;

    // ─── 冲撞 ───
    if (boss.dash) {
        if (boss.dash.phase === "warn") {
            boss.dash.timer -= dt;
            if (boss.dash.timer <= 0) {
                boss.dash.phase = "dash";
                boss.dash.timer = 30;
            }
        } else if (boss.dash.phase === "dash") {
            const dx = boss.dash.tx - boss.x;
            const dy = boss.dash.ty - boss.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 8) {
                const spd = 12 * dt;
                boss.x += (dx / dist) * spd;
                boss.y += (dy / dist) * spd;
                // 撞到挡板
                const p = state.paddle;
                const hr = bossHitRect();
                if (boss.x + boss.r >= hr.x && boss.x - boss.r <= hr.x + hr.w &&
                    boss.y + boss.r >= hr.y && boss.y + boss.r <= hr.y + hr.h + 20) {
                    onDashHit();
                    boss.dash = null;
                    boss.dashCd = 150;
                }
            } else {
                boss.dash = null;
                boss.dashCd = 150;
            }
        }
    } else if (boss.dashCd <= 0 && stage < 2 && Math.random() < 0.008 * dt) {
        // 启动冲撞预警
        const px = state.paddle.x + state.paddle.width / 2;
        const py = state.paddle.y;
        const dx = px - boss.x;
        const dy = Math.max(0, py - boss.y - 20);
        if (Math.hypot(dx, dy) > 180) {
            boss.dash = { phase: "warn", timer: 50, tx: px, ty: py - 20 };
        }
    }

    // ─── 卫星 ───
    for (const m of boss.minions) {
        m.angle += 0.022 * dt;
        m.lastShot -= dt;
        const mx = boss.x + Math.cos(m.angle) * m.orbit;
        const my = boss.y + Math.sin(m.angle) * m.orbit;
        if (m.lastShot <= 0) {
            m.lastShot = 160 + stage * 20;
            const px = state.paddle.x + state.paddle.width / 2;
            const py = state.paddle.y;
            const a = Math.atan2(py - my, px - mx);
            state.bossBullets.push({ x: mx, y: my, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2, r: 5, age: 0, homing: false, splitAt: 0, wave: null });
            playBossShoot();
        }
    }

    // ─── 螺旋弹幕 ───
    if (boss.spiralFrames > 0) {
        boss.spiralFrames -= dt;
        if (boss.t % 4 === 0) {
            const a = boss.spiralAngle;
            fireBullet(boss, Math.cos(a), Math.sin(a), boss.bulletSpeed * speedMul * 0.8, 5);
            boss.spiralAngle += 0.3;
        }
    }

    // ─── 追踪弹 ───
    if (boss.homingQueue > 0) {
        boss.homingTick -= dt;
        if (boss.homingTick <= 0) {
            boss.homingTick = 26;
            boss.homingQueue--;
            fireBullet(boss, Math.cos(boss.t * 0.3) * 0.3, 1, boss.bulletSpeed * speedMul, 6, { homing: true });
        }
    }

    // ─── 常规齐射 ───
    boss.volleyTimer -= dt;
    if (boss.volleyTimer <= 0) {
        boss.volleyTimer = interval;
        const pattern = boss.patterns[boss.volleyIdx % boss.patterns.length];
        boss.volleyIdx++;
        const spd = boss.bulletSpeed * speedMul;
        switch (pattern) {
            case "fan": aimedFan(boss, spd, 4); break;
            case "ring": ringBurst(boss, spd * 0.85, 8 + boss.tier * 2); break;
            case "split": aimedFan(boss, spd, 4, { splitAt: 46 }); break;
            case "wave": aimedFan(boss, spd, 5, { wave: true }); break;
            case "homing": boss.homingQueue = 2; boss.homingTick = 8; break;
            case "spiral": boss.spiralFrames = 48; boss.spiralAngle = Math.random() * Math.PI * 2; break;
        }
        playBossShoot();
    }

    updateBossBullets();
}

function onDashHit() {
    const pl = state.player;
    if (pl.shieldTimer > 0) { spawnRing(state.paddle.x, state.paddle.y, "rgba(120,230,255,0.9)"); playWallHit(); return; }
    if (state.invulnTimer > 0) return;
    if (Math.random() < pl.bossResist) { spawnFloatingText(state.paddle.x + state.paddle.width / 2, state.paddle.y - 24, "格挡！", "#7dff9b"); playWallHit(); return; }
    state.invulnTimer = 100;
    playerHurt();
    screenShake(12, 220);
    playPlayerHit();
    loseLife(1);
}

function fireBullet(boss, dx, dy, speed, r, opt = {}) {
    const len = Math.hypot(dx, dy) || 1;
    state.bossBullets.push({
        x: boss.x + (dx / len) * 10, y: boss.y + (dy / len) * 10,
        vx: (dx / len) * speed, vy: (dy / len) * speed, r, age: 0,
        homing: !!opt.homing, splitAt: opt.splitAt || 0,
        wave: opt.wave ? { phase: Math.random() * Math.PI * 2, amp: 26, freq: 0.06, bx: boss.x, by: boss.y, dirX: dx / len, dirY: dy / len } : null,
    });
}

function aimedFan(boss, speed, count, opt = {}) {
    const px = state.paddle.x + state.paddle.width / 2;
    const py = state.paddle.y;
    const base = Math.atan2(py - boss.y, px - boss.x);
    for (let i = 0; i < count; i++) {
        const spread = (i - (count - 1) / 2) * 0.13;
        const a = base + spread;
        fireBullet(boss, Math.cos(a), Math.sin(a), speed, 6, opt);
    }
}

function ringBurst(boss, speed, count) {
    const offset = Math.random() * Math.PI;
    for (let i = 0; i < count; i++) {
        const a = offset + (Math.PI * 2 * i) / count;
        fireBullet(boss, Math.cos(a), Math.sin(a), speed, 5);
    }
}

function updateBossBullets() {
    const dt = state.dt;
    const bullets = state.bossBullets;
    if (bullets.length > 150) bullets.splice(0, bullets.length - 150);
    const px = state.paddle.x + state.paddle.width / 2;
    const py = state.paddle.y;

    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.age++;

        if (b.homing) {
            const cur = Math.atan2(b.vy, b.vx);
            const want = Math.atan2(py - b.y, px - b.x);
            let diff = want - cur;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            const na = cur + Math.max(-0.028 * dt, Math.min(0.028 * dt, diff));
            const spd = Math.hypot(b.vx, b.vy);
            b.vx = Math.cos(na) * spd;
            b.vy = Math.sin(na) * spd;
        }

        if (b.splitAt && b.age >= b.splitAt) {
            const spd = Math.hypot(b.vx, b.vy);
            const a = Math.atan2(b.vy, b.vx);
            for (const da of [-0.42, 0.42]) {
                bullets.push({ x: b.x, y: b.y, vx: Math.cos(a + da) * spd, vy: Math.sin(a + da) * spd, r: 5, age: 0, homing: false, splitAt: 0, wave: null });
            }
            bullets.splice(i, 1); continue;
        }

        if (b.wave) {
            b.wave.bx += b.vx * dt;
            b.wave.by += b.vy * dt;
            const perpX = -b.wave.dirY;
            const perpY = b.wave.dirX;
            const off = Math.sin(b.age * b.wave.freq + b.wave.phase) * b.wave.amp;
            b.x = b.wave.bx + perpX * off;
            b.y = b.wave.by + perpY * off;
        } else {
            b.x += b.vx * dt;
            b.y += b.vy * dt;
        }

        if (b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) { bullets.splice(i, 1); continue; }

        const p = state.paddle;
        const hr = bossHitRect();
        if (b.x + b.r >= hr.x && b.x - b.r <= hr.x + hr.w && b.y + b.r >= hr.y && b.y - b.r <= hr.y + hr.h) {
            bullets.splice(i, 1);
            onPaddleHit(b);
            spawnParticles(b.x, b.y, "#ff6b9d", 8);
        }
    }
}

function onPaddleHit(bullet) {
    const pl = state.player;
    if (pl.shieldTimer > 0) { spawnRing(bullet.x, bullet.y, "rgba(120,230,255,0.9)"); playWallHit(); return; }
    if (state.invulnTimer > 0) return;
    if (Math.random() < pl.bossResist) { spawnFloatingText(state.paddle.x + state.paddle.width / 2, state.paddle.y - 24, "格挡！", "#7dff9b"); playWallHit(); return; }
    const extraDmg = pl.curseBulletExtraDmg || 0;
    if (pl.thorns > 0 && state.boss) damageBoss(pl.thorns, true);
    state.invulnTimer = 100;
    playerHurt();
    screenShake(9, 220);
    playPlayerHit();
    loseLife(1 + extraDmg);
}

export function damageBoss(dmg, silent = false) {
    const boss = state.boss;
    if (!boss) return;
    boss.hp -= dmg;
    boss.flash = 1;
    if (!silent) { playBossHit(); addScore(10); spawnFloatingText(boss.x, boss.y - boss.r - 14, `-${dmg}`, "#ff8866"); }
    if (boss.hp <= 0) defeatBoss();
}

function defeatBoss() {
    const boss = state.boss;
    spawnParticles(boss.x, boss.y, boss.color, 80);
    spawnParticles(boss.x, boss.y, "#ffffff", 40);
    for (let i = 0; i < 3; i++) spawnRing(boss.x, boss.y, "rgba(255,220,120,0.8)");
    screenShake(14, 400);
    state.boss = null; state.bossBullets = []; state.enemyBullets = [];
    playBossDeath();
    if (state.player.level >= 50) { state.player.score += 1000; state.gameState = STATE.VICTORY; playVictory(); }
    else state.gameState = STATE.BOSS_CLEAR;
}

// ─── 绘制 ───
export function drawBoss() {
    const boss = state.boss;
    if (!boss) return;
    ctx.save();
    ctx.translate(boss.x, boss.y);

    // 冲撞预警线
    if (boss.dash && boss.dash.phase === "warn") {
        ctx.strokeStyle = `rgba(255,80,80,${0.3 + Math.sin(Date.now() / 80) * 0.2})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(boss.dash.tx - boss.x, boss.dash.ty - boss.y); ctx.stroke();
        ctx.setLineDash([]);
    }

    // 卫星
    for (const m of boss.minions) {
        const mx = Math.cos(m.angle) * m.orbit;
        const my = Math.sin(m.angle) * m.orbit;
        ctx.fillStyle = boss.color;
        ctx.shadowColor = boss.color;
        ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(mx, my, 10, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
    }

    // 尖刺
    ctx.strokeStyle = boss.color; ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8 + boss.t * 0.01;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * (boss.r - 8), Math.sin(a) * (boss.r - 8));
        ctx.lineTo(Math.cos(a) * (boss.r + 16), Math.sin(a) * (boss.r + 16)); ctx.stroke();
    }

    // 主体
    const grad = ctx.createRadialGradient(-10, -10, 4, 0, 0, boss.r);
    grad.addColorStop(0, "#ffffff"); grad.addColorStop(0.35, boss.color); grad.addColorStop(1, boss.color);
    ctx.shadowColor = boss.color; ctx.shadowBlur = 30;
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, boss.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(0, 0, boss.r * 0.3 + Math.sin(boss.t * 0.15) * 3, 0, Math.PI * 2); ctx.fill();

    if (boss.flash > 0.02) {
        ctx.fillStyle = `rgba(255,255,255,${(boss.flash * 0.75).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(0, 0, boss.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

export function drawBossBar() {
    const boss = state.boss;
    if (!boss) return;
    const bw = 420, bx = W / 2 - bw / 2, by = 60;
    const ratio = Math.max(0, boss.hp / boss.maxHp);
    ctx.fillStyle = "rgba(16,12,24,0.85)"; ctx.fillRect(bx - 4, by - 4, bw + 8, 24);
    ctx.fillStyle = "#43203a"; ctx.fillRect(bx, by, bw, 16);
    const grad = ctx.createLinearGradient(bx, by, bx + bw, by);
    grad.addColorStop(0, boss.color); grad.addColorStop(1, "#ff7799");
    ctx.fillStyle = grad; ctx.fillRect(bx, by, bw * ratio, 16);
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, 16);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${boss.name}`, W / 2, by - 10);
}

export function drawBossBullets() {
    for (const b of state.bossBullets) {
        ctx.shadowColor = "#ff6b9d"; ctx.shadowBlur = 8;
        ctx.fillStyle = "#ff6b9d"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
}

export function drawEnemyBullets() {
    for (const b of state.enemyBullets) {
        ctx.shadowColor = "#ffa94d"; ctx.shadowBlur = 6;
        ctx.fillStyle = "#ffa94d"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
}