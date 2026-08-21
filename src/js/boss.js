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
    const base = PADDLE_BASE_W * (1 + (state.player.curseHitPenalty || 0));
    const extra = p.width - base;
    return { x: p.x + extra / 2, w: base, y: p.y, h: p.height };
}

export function createBoss(level) {
    const candidates = BOSS_CANDIDATES[level];
    const def = candidates[Math.floor(Math.random() * candidates.length)];
    state.boss = {
        // 基础
        level, name: def.name, color: def.color, bulletSpeed: def.bulletSpeed,
        hp: def.hp, maxHp: def.hp, skills: def.skills, patterns: def.patterns,
        bossType: def.bossType || "executor",
        desc: def.desc,
        x: W / 2, y: 130, r: 56, flash: 0, tier: BOSS_TIER_INDEX.indexOf(level),
t: 0,
        // 受击冷却：防止冲锋等技能与球连续碰撞造成瞬间多段伤害
        hitCooldown: 0,
        // 状态机
        action: null, // 当前技能 {type, phase, timer}
        actionCooldown: 20, // 技能间冷却（初始短，后续由恢复期设置）
        recoverTimer: 0, // 恢复阶段计时（易伤窗口）
        vulnerable: false, // 是否易伤
        // 冲锋
        chargeTarget: null,
        chargeSpeed: 0,
        // 跳砸
        slamTarget: null,
        slamWave: null,
        // 召唤物
        minions: [],
        // 祭坛（诅咒司祭专属）
        altars: [],
        // 蓄力大招
        chargeProgress: 0, // 0-100
        interrupted: false,
        // 阶段
        phase: 0, // 0=第一, 1=第二(半血后)
        // 弹幕
        volleyTimer: 0,
        volleyIdx: 0,
        spiralFrames: 0, spiralAngle: 0,
        homingQueue: 0, homingTick: 0,
        dash: null, dashCd: 0,
    };
    state.bossBullets = [];
    state.bossDangerZones = [];
    // 开场弹幕
    state.boss.volleyTimer = 60;
}

export function updateBoss() {
    const boss = state.boss;
    if (!boss) return;
    if (state.player.freezeTimer > 0) return;
    const dt = state.dt;
    boss.t++;
    boss.flash = Math.max(0, boss.flash - 0.08 * dt);
    boss.hitCooldown = Math.max(0, boss.hitCooldown - dt);

    // 飘移（仅在未执行移动类技能时：charge active / slam active 会自行控制位置）
    const movingAction = boss.action &&
        ((boss.action.type === "charge" && boss.action.phase === "active") ||
         (boss.action.type === "slam" && boss.action.phase === "active"));
    if (!movingAction) {
        boss.x = W / 2 + Math.sin(boss.t * 0.012) * 140;
        boss.y = 130 + Math.sin(boss.t * 0.023) * 20;
    }

    // 恢复阶段（易伤窗口）
    if (boss.recoverTimer > 0) {
        boss.recoverTimer -= dt;
        boss.vulnerable = true;
        if (boss.recoverTimer <= 0) {
            boss.vulnerable = false;
            boss.action = null;
            boss.actionCooldown = 20 + Math.random() * 15;
        }
        // 恢复阶段不执行其他动作
        updateBossBullets();
        updateDangerZones();
        return;
    }

    // 技能冷却
    if (boss.actionCooldown > 0) {
        boss.actionCooldown -= dt;
        if (boss.actionCooldown <= 0) {
            boss.actionCooldown = 0;
            pickNextAction(boss);
        }
    }

    // 执行当前技能
    if (boss.action) {
        executeAction(boss, dt);
    } else {
        // 闲时发射弹幕
        fireVolley(boss, dt);
    }

    // 更新召唤物
    updateMinions(boss, dt);
    // 应用祭坛诅咒效果
    altarCurseEffects();
    updateBossBullets();
    updateDangerZones();
}

// ─── 技能选择 ─────────────────────────────────────────────
function pickNextAction(boss) {
    const ratio = boss.hp / boss.maxHp;
    if (ratio < 0.5 && boss.phase === 0) {
        boss.phase = 1;
        spawnFloatingText(boss.x, boss.y - 60, "第二阶段！", boss.color);
    }
    // 轮换技能，避免连续重复
    let available = boss.skills.filter(s => s !== boss._lastSkill);
    if (available.length === 0) available = [...boss.skills];
    const skill = available[Math.floor(Math.random() * available.length)];
    boss._lastSkill = skill;
    boss.action = { type: skill, phase: "warn", timer: 0 };
    boss.chargeProgress = 0;
    boss.interrupted = false;
}

// ─── 技能执行 ─────────────────────────────────────────────
function executeAction(boss, dt) {
    const a = boss.action;
    if (!a) return;
    a.timer += dt;

    switch (a.type) {
        case "charge": executeCharge(boss, a, dt); break;
        case "slam": executeSlam(boss, a, dt); break;
        case "summon": executeSummon(boss, a, dt); break;
        case "ultimate": executeUltimate(boss, a, dt); break;
        case "altar": executeAltar(boss, a, dt); break;
        default: startRecovery(boss, 30); break;
    }
}

// ─── 冲锋 ─────────────────────────────────────────────────
function executeCharge(boss, a, dt) {
    if (a.phase === "warn") {
        // 预警：锁定玩家，显示路径
        boss.chargeTarget = { x: state.paddle.x + state.paddle.width / 2, y: state.paddle.y };
        if (a.timer > 30) {
            a.phase = "active";
            a.timer = 0;
            boss.chargeSpeed = 16 + boss.tier * 1.8;
            playBossShoot();
        }
    } else if (a.phase === "active") {
        // 冲锋
        const dx = boss.chargeTarget.x - boss.x;
        const dy = boss.chargeTarget.y - boss.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 10) {
            const spd = boss.chargeSpeed * dt;
            boss.x += (dx / dist) * spd;
            boss.y += (dy / dist) * spd;
            // 撞墙检测
            if (boss.x < boss.r || boss.x > W - boss.r || boss.y < 60 || boss.y > H - 60) {
                // 撞墙眩晕
                onChargeWallHit(boss);
                startRecovery(boss, 90 + boss.tier * 15);
                return;
            }
            // 撞到挡板
            const hr = bossHitRect();
            if (boss.x + boss.r >= hr.x && boss.x - boss.r <= hr.x + hr.w &&
                boss.y + boss.r >= hr.y && boss.y + boss.r <= hr.y + hr.h + 20) {
                onDashHit();
                startRecovery(boss, 30);
                return;
            }
        } else {
            startRecovery(boss, 30);
        }
    }
}

function onChargeWallHit(boss) {
    screenShake(12, 200);
    spawnParticles(boss.x, boss.y, "#ffffff", 20);
    spawnFloatingText(boss.x, boss.y - 30, "撞墙眩晕！", "#ffd700");
    playWallHit();
}

function startRecovery(boss, frames) {
    boss.recoverTimer = frames;
    boss.vulnerable = true;
    boss.action = null;
    boss.actionCooldown = 0;
    spawnFloatingText(boss.x, boss.y - 50, "易伤！", "#ffd700");
}

// ─── 跳砸 ─────────────────────────────────────────────────
function executeSlam(boss, a, dt) {
    if (a.phase === "warn") {
        // 预警：显示落点
        boss.slamTarget = {
            x: Math.max(60, Math.min(W - 60, state.paddle.x + state.paddle.width / 2 + (Math.random() - 0.5) * 60)),
            y: Math.max(100, Math.min(H - 100, state.paddle.y + (Math.random() - 0.5) * 40)),
        };
        if (a.timer > 30) {
            a.phase = "active";
            a.timer = 0;
            boss.x = boss.slamTarget.x;
            boss.y = 30;
            playBossShoot();
        }
    } else if (a.phase === "active") {
        // 下落
        boss.y += 12 * dt;
        if (boss.y >= boss.slamTarget.y) {
            boss.y = boss.slamTarget.y;
            // 落地冲击
            screenShake(14, 300);
            spawnParticles(boss.x, boss.y, boss.color, 40);
            spawnRing(boss.x, boss.y, `rgba(255,${120 + boss.tier * 30},80,0.8)`);
            playBossHit();
            // 冲击波
            const waveSpeed = 4 + boss.tier * 0.5;
            state.bossDangerZones.push({ x: boss.x, y: boss.y, r: 0, maxR: 180 + boss.tier * 20, life: 60, type: "shockwave", speed: waveSpeed });
            // 危险区
            state.bossDangerZones.push({ x: boss.x, y: boss.y, r: 40 + boss.tier * 10, life: 240, type: "hazard", color: boss.color });
            // 挡板在冲击波范围内则扣血
            const p = state.paddle;
            if (Math.hypot(p.x + p.width / 2 - boss.x, p.y - boss.y) < 180) {
                onSlamHit();
            }
            startRecovery(boss, 50 + boss.tier * 10);
        }
    }
}

function onSlamHit() {
    const pl = state.player;
    if (pl.shieldTimer > 0) { playWallHit(); return; }
    if (state.invulnTimer > 0) return;
    if (pl.bounceShield > 0 && Math.random() < pl.bounceShield) { playWallHit(); return; }
    state.invulnTimer = 100;
    playerHurt();
    screenShake(10, 200);
    playPlayerHit();
    loseLife(1);
}

// ─── 召唤 ─────────────────────────────────────────────────
function executeSummon(boss, a, dt) {
    if (a.phase === "warn") {
        if (a.timer > 20) {
            a.phase = "active";
            a.timer = 0;
        }
    } else if (a.phase === "active") {
        if (a.timer < 8) {
            spawnMinionForType(boss);
            playBossShoot();
        }
        if (a.timer > 10) {
            startRecovery(boss, 30);
        }
    }
}

// 召唤物类型池（母体）：
// healer=治疗花 / poison=腐化花（制造毒区） / vine=藤蔓（束缚减速）
// 蜂巢：repair=修复无人机 / shield=护盾无人机（给 Boss 减伤） / bomber=自爆无人机
const MOTHER_MINIONS = [
    ["healer", 1], ["healer", 1], ["poison", 1.5], ["poison", 1.5], ["vine", 1.2],
];
const HIVE_MINIONS = [
    ["repair", 1], ["repair", 1], ["shield", 1.2], ["bomber", 1.5],
];

function spawnMinionForType(boss) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 120 + Math.random() * 60;
    const mx = Math.max(40, Math.min(W - 40, boss.x + Math.cos(angle) * dist));
    const my = Math.max(80, Math.min(H - 60, boss.y + Math.sin(angle) * dist));
    let kinds;
    if (boss.bossType === "mother") {
        kinds = MOTHER_MINIONS;
    } else if (boss.bossType === "hive") {
        kinds = HIVE_MINIONS;
    } else {
        kinds = MOTHER_MINIONS;
    }
    const totalW = kinds.reduce((s, k) => s + k[1], 0);
    let roll = Math.random() * totalW;
    let picked = kinds[0][0];
    for (const [kind, w] of kinds) {
        roll -= w;
        if (roll <= 0) { picked = kind; break; }
    }
    const colors = { healer: "#7dff9b", poison: "#b26bff", vine: "#5aa7ff", repair: "#7dff9b", shield: "#ffcc33", bomber: "#ff6644" };
    const bossId = state.boss;
    boss.minions.push({
        x: mx, y: my, r: 14, hp: 20 + boss.tier * 10,
        maxHp: 20 + boss.tier * 10, type: picked,
        healTimer: picked === "healer" || picked === "repair" ? 180 : 0,
        poisonTimer: picked === "poison" ? 120 : 0,
        seekTimer: picked === "bomber" ? 90 : 0,
        flash: 0, angle: 0, color: colors[picked] || "#ffffff",
    });
    spawnFloatingText(mx, my - 20, `召唤：${picked}`, colors[picked]);
}

function updateMinions(boss, dt) {
    for (let i = boss.minions.length - 1; i >= 0; i--) {
        const m = boss.minions[i];
        m.flash = Math.max(0, m.flash - 0.08 * dt);
        if (m.type === "healer" || m.type === "repair") {
            m.healTimer -= dt;
            if (m.healTimer <= 0) {
                m.healTimer = 180;
                const healAmount = 2 + boss.tier;
                boss.hp = Math.min(boss.maxHp, boss.hp + healAmount);
                spawnFloatingText(m.x, m.y - 16, `治疗 +${healAmount}`, "#7dff9b");
            }
        }
        // 腐化花：定期生成毒区
        if (m.type === "poison") {
            m.poisonTimer -= dt;
            if (m.poisonTimer <= 0) {
                m.poisonTimer = 120;
                const r = 40;
                state.bossDangerZones.push({ x: boss.x + (m.x - boss.x) * 0.25, y: m.y + 20, r, life: 180, type: "hazard", color: "#b26bff", _poison: true });
                spawnFloatingText(m.x, m.y - 20, "毒雾扩散！", "#b26bff");
            }
        }
        // 藤蔓：束缚挡板（短暂移速降低）
        if (m.type === "vine" && Math.hypot(state.paddle.x - m.x, state.paddle.y - m.y) < 80) {
            state.player.curseMoveResist = (state.player.curseMoveResist || 0) + 0.3;
        }
        // 自爆无人机：追向挡板5秒后爆炸
        if (m.type === "bomber") {
            m.seekTimer -= dt;
            const dx = state.paddle.x + state.paddle.width / 2 - m.x;
            const dy = state.paddle.y - m.y;
            const len = Math.hypot(dx, dy) || 1;
            m.x += (dx / len) * 0.6 * dt;
            m.y += (dy / len) * 0.6 * dt;
            if (m.seekTimer <= 0 || len < 20) {
                // 爆炸，伤害挡板
                state.boss.minions.splice(i, 1);
                if (len < 80) {
                    state.invulnTimer = 100;
                    loseLife(1);
                    screenShake(10, 200);
                    spawnFloatingText(m.x, m.y, "爆炸！", "#ff6644");
                }
                continue;
            }
        }
        // 受击（由 physics.js 处理碰撞）
        if (m.hp <= 0) {
            spawnParticles(m.x, m.y, m.color || "#7dff9b", 12);
            boss.minions.splice(i, 1);
            // 召唤物死亡削弱 Boss
            boss.hp -= 10;
            boss.flash = 1;
            spawnFloatingText(boss.x, boss.y - 40, "召唤物死亡反噬！", "#ff4444");
        }
    }
}

// ─── 祭坛（诅咒司祭专属）──────────────────────────────────
function executeAltar(boss, a, dt) {
    if (a.phase === "warn") {
        if (a.timer > 20) {
            a.phase = "active";
            a.timer = 0;
        }
    } else if (a.phase === "active") {
        if (a.timer < 8) {
            // 生成祭坛：同时最多 2 个
            if (boss.altars.length < 2) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 150 + Math.random() * 100;
                const ax = Math.max(50, Math.min(W - 50, boss.x + Math.cos(angle) * dist));
                const ay = Math.max(100, Math.min(H - 80, boss.y + Math.sin(angle) * dist));
                // 诅咒类型随机
                const kinds = ["dmg", "speed", "cd"];
                const kind = kinds[Math.floor(Math.random() * kinds.length)];
                boss.altars.push({
                    x: ax, y: ay, r: 20, hp: 15 + boss.tier * 8,
                    maxHp: 15 + boss.tier * 8, type: kind, flash: 0,
                });
                spawnFloatingText(ax, ay - 20, "诅咒祭坛出现！", "#cc66ff");
                playBossShoot();
            }
        }
        if (a.timer < 12 + Math.random() * 8) {
            // 多生成 1 个
            if (boss.altars.length < 4 && Math.random() < 0.5) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 150 + Math.random() * 100;
                const ax = Math.max(50, Math.min(W - 50, boss.x + Math.cos(angle) * dist));
                const ay = Math.max(100, Math.min(H - 80, boss.y + Math.sin(angle) * dist));
                const kinds = ["dmg", "speed", "cd"];
                const kind = kinds[Math.floor(Math.random() * kinds.length)];
                boss.altars.push({ x: ax, y: ay, r: 20, hp: 15 + boss.tier * 8, maxHp: 15 + boss.tier * 8, type: kind, flash: 0 });
                spawnFloatingText(ax, ay - 20, "诅咒祭坛出现！", "#cc66ff");
            }
        }
        if (a.timer > 10) {
            startRecovery(boss, 30);
        }
    }
}

// 祭坛持续的诅咒效果（每帧应用）
function altarCurseEffects() {
    const boss = state.boss;
    const p = state.player;
    if (!boss || !boss.altars) {
        p.altarDmgP = 0;
        p.altarSpeedP = 1;
        p.altarCdP = 1;
        return;
    }
    const hasDmg = boss.altars.some(x => x.type === "dmg");
    const hasSpeed = boss.altars.some(x => x.type === "speed");
    const hasCd = boss.altars.some(x => x.type === "cd");
    // dmg：玩家伤害 -1
    p.altarDmgP = hasDmg ? 1 : 0;
    // speed：球速 +10%
    p.altarSpeedP = hasSpeed ? 1.1 : 1;
    // cd：玩家技能CD +50%
    p.altarCdP = hasCd ? 1.5 : 1;
}

// ─── 可打断蓄力大招 ───────────────────────────────────────
function executeUltimate(boss, a, dt) {
    if (a.phase === "warn") {
        // 蓄力阶段
        boss.chargeProgress = Math.min(100, boss.chargeProgress + 1.2 * dt);
        // 暴露弱点（boss 中心闪烁）
        if (boss.chargeProgress >= 100) {
            if (!boss.interrupted) {
                // 大招释放：多波高强度弹幕
                a.phase = "active";
                a.timer = 0;
                a._waves = 0;
                spawnFloatingText(boss.x, boss.y - 50, "蓄力完成！大招释放！", "#ff4444");
            }
        }
    } else if (a.phase === "active") {
        // 每 15 帧发射一波
        a._waves = a._waves || 0;
        if (a.timer > a._waves * 15) {
            const count = 8 + boss.tier * 3;
            const speed = 3.0 + boss.tier * 0.3;
            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 * i) / count + a._waves * 0.3;
                state.bossBullets.push({
                    x: boss.x, y: boss.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    r: 7, age: 0, homing: false, splitAt: 0, wave: null,
                });
            }
            playBossShoot();
            a._waves++;
            // 3 波后结束
            if (a._waves >= 3) {
                startRecovery(boss, 50);
            }
        }
        if (a.timer > 60) {
            startRecovery(boss, 50);
        }
    }
}

// 打断蓄力（由 physics.js 碰撞检测调用）
export function interruptBossUltimate() {
    const boss = state.boss;
    if (!boss || !boss.action || boss.action.type !== "ultimate" || boss.action.phase !== "warn") return;
    boss.interrupted = true;
    boss.chargeProgress = 0;
    spawnFloatingText(boss.x, boss.y - 50, "大招被打断！", "#7dff9b");
    screenShake(6, 100);
    startRecovery(boss, 120); // 更长易伤
}

// ─── 弹幕（辅助技能，闲时发射） ────────────────────────────
function fireVolley(boss, dt) {
    boss.volleyTimer -= dt;
    if (boss.volleyTimer <= 0) {
        boss.volleyTimer = 90 + Math.random() * 60;
        const pattern = boss.patterns[boss.volleyIdx % boss.patterns.length];
        boss.volleyIdx++;
        fireVolleySingle(boss, pattern);
    }
}

function fireVolleySingle(boss, pattern) {
    const spd = boss.bulletSpeed * (1 + boss.phase * 0.1);
    switch (pattern) {
        case "fan": aimedFan(boss, spd, 3 + boss.tier); break;
        case "ring": ringBurst(boss, spd * 0.85, 6 + boss.tier * 2); break;
        case "split": aimedFan(boss, spd, 3, { splitAt: 46 }); break;
        case "wave": aimedFan(boss, spd, 4, { wave: true }); break;
        case "homing": boss.homingQueue = 2; boss.homingTick = 8; break;
        case "spiral": boss.spiralFrames = 36; boss.spiralAngle = Math.random() * Math.PI * 2; break;
        default: aimedFan(boss, spd, 3); break;
    }
    playBossShoot();
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

// ─── 伤害与死亡 ───────────────────────────────────────────
export function damageBoss(dmg, silent = false) {
    const boss = state.boss;
    if (!boss) return;
    // 受击冷却：冲锋等持续接触技能期间防止连续多段伤害
    if (boss.hitCooldown > 0) return;
    boss.hitCooldown = 25; // 约 0.4 秒
    let finalDmg = dmg;
    // 易伤阶段额外伤害
    if (boss.vulnerable) finalDmg = Math.round(finalDmg * 1.5);
    // 蜂巢：护盾无人机存活时 Boss 减伤
    if (boss.minions && boss.minions.some(m => m.type === "shield")) {
        finalDmg = Math.round(finalDmg * 0.5);
    }
    boss.hp -= finalDmg;
    boss.flash = 1;
    if (!silent) {
        playBossHit();
        addScore(10);
        spawnFloatingText(boss.x, boss.y - boss.r - 14, `-${finalDmg}`, boss.vulnerable ? "#ffd700" : "#ff8866");
    }
    // 蓄力时受伤可打断
    if (boss.action && boss.action.type === "ultimate" && boss.action.phase === "warn") {
        if (Math.random() < 0.3) interruptBossUltimate();
    }
    if (boss.hp <= 0) defeatBoss();
}

function defeatBoss() {
    const boss = state.boss;
    spawnParticles(boss.x, boss.y, boss.color, 80);
    spawnParticles(boss.x, boss.y, "#ffffff", 40);
    for (let i = 0; i < 3; i++) spawnRing(boss.x, boss.y, "rgba(255,220,120,0.8)");
    screenShake(14, 400);
    state.boss = null; state.bossBullets = []; state.enemyBullets = []; state.bossDangerZones = [];
    playBossDeath();
    if (state.player.level >= 50) { state.player.score += 1000; state.gameState = STATE.VICTORY; playVictory(); }
    else state.gameState = STATE.BOSS_CLEAR;
}

// ─── 子弹更新 ─────────────────────────────────────────────
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

// ─── 危险区更新 ───────────────────────────────────────────
function updateDangerZones() {
    const dt = state.dt;
    const zones = state.bossDangerZones;
    for (let i = zones.length - 1; i >= 0; i--) {
        const z = zones[i];
        z.life -= dt;
        if (z.type === "shockwave" && z.r < z.maxR) z.r += z.speed * dt;
        if (z.life <= 0) { zones.splice(i, 1); continue; }
        // 挡板在危险区中扣血（仅对 hazard 类型）
        if (z.type === "hazard") {
            const p = state.paddle;
            if (Math.hypot(p.x + p.width / 2 - z.x, p.y - z.y) < z.r) {
                // 每帧检查，但加冷却防止秒杀
                z._dmgTick = (z._dmgTick || 0) - dt;
                if (z._dmgTick <= 0) {
                    z._dmgTick = 30;
                    const pl = state.player;
                    if (!pl.shieldTimer && !state.invulnTimer) {
                        state.invulnTimer = 60;
                        playerHurt();
                        playPlayerHit();
                        loseLife(1);
                    }
                }
            }
        }
    }
}

// ─── 受击处理 ─────────────────────────────────────────────
function onPaddleHit(bullet) {
    const pl = state.player;
    if (pl.shieldTimer > 0) { spawnRing(bullet.x, bullet.y, "rgba(120,230,255,0.9)"); playWallHit(); return; }
    if (state.invulnTimer > 0) return;
    if (pl.bounceShield > 0 && Math.random() < pl.bounceShield) { spawnRing(bullet.x, bullet.y, "rgba(255,220,100,0.9)"); playWallHit(); return; }
    if (Math.random() < pl.bossResist) { spawnFloatingText(state.paddle.x + state.paddle.width / 2, state.paddle.y - 24, "格挡！", "#7dff9b"); playWallHit(); return; }
    const extraDmg = pl.curseBulletExtraDmg || 0;
    if (pl.thorns > 0 && state.boss) damageBoss(pl.thorns, true);
    state.invulnTimer = 100;
    playerHurt();
    screenShake(9, 220);
    playPlayerHit();
    loseLife(1 + extraDmg);
}

function onDashHit() {
    const pl = state.player;
    if (pl.shieldTimer > 0) { spawnRing(state.paddle.x, state.paddle.y, "rgba(120,230,255,0.9)"); playWallHit(); return; }
    if (state.invulnTimer > 0) return;
    if (pl.bounceShield > 0 && Math.random() < pl.bounceShield) { spawnRing(state.paddle.x, state.paddle.y, "rgba(255,220,100,0.9)"); playWallHit(); return; }
    if (Math.random() < pl.bossResist) { spawnFloatingText(state.paddle.x + state.paddle.width / 2, state.paddle.y - 24, "格挡！", "#7dff9b"); playWallHit(); return; }
    state.invulnTimer = 100;
    playerHurt();
    screenShake(12, 220);
    playPlayerHit();
    loseLife(1);
}

// ─── 绘制 ─────────────────────────────────────────────────
export function drawBoss() {
    const boss = state.boss;
    if (!boss) return;
    ctx.save();
    ctx.translate(boss.x, boss.y);

    // 冲锋预警线
    if (boss.action?.type === "charge" && boss.action.phase === "warn" && boss.chargeTarget) {
        ctx.strokeStyle = `rgba(255,80,80,${0.3 + Math.sin(Date.now() / 80) * 0.2})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(boss.chargeTarget.x - boss.x, boss.chargeTarget.y - boss.y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // 跳砸落点标记
    if (boss.action?.type === "slam" && boss.action.phase === "warn" && boss.slamTarget) {
        const sx = boss.slamTarget.x - boss.x;
        const sy = boss.slamTarget.y - boss.y;
        ctx.strokeStyle = `rgba(255,100,100,${0.5 + Math.sin(Date.now() / 120) * 0.3})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx, sy, 30 + Math.sin(Date.now() / 100) * 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,50,50,0.15)";
        ctx.fill();
    }

    // 蓄力进度
    if (boss.action?.type === "ultimate" && boss.action.phase === "warn") {
        const angle = boss.chargeProgress / 100 * Math.PI * 2;
        ctx.strokeStyle = "#ffcc00";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, boss.r + 8, -Math.PI / 2, -Math.PI / 2 + angle);
        ctx.stroke();
        ctx.fillStyle = "#ffcc00";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${Math.round(boss.chargeProgress)}%`, 0, 4);
    }

    // 召唤物（按类型区分图标）
    const MINION_ICONS = { healer: "🌼", poison: "🌸", vine: "🌿", repair: "🛠️", shield: "🛡️", bomber: "💣" };
    for (const m of boss.minions) {
        const mx = m.x - boss.x;
        const my = m.y - boss.y;
        const mc = m.color || "#7dff9b";
        ctx.fillStyle = mc;
        ctx.shadowColor = mc;
        ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(mx, my, m.r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        if (m.flash > 0.02) {
            ctx.fillStyle = `rgba(255,255,255,${(m.flash * 0.7).toFixed(3)})`;
            ctx.beginPath(); ctx.arc(mx, my, m.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(MINION_ICONS[m.type] || "?", mx, my + 4);
        // HP 条
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(mx - m.r, my - m.r - 6, m.r * 2, 4);
        ctx.fillStyle = mc;
        ctx.fillRect(mx - m.r, my - m.r - 6, (m.r * 2) * (m.hp / m.maxHp), 4);
    }

    // 祭坛
    const ALTAR_ICONS = { dmg: "🗡️", speed: "💨", cd: "⏳" };
    for (const al of boss.altars) {
        const ax = al.x - boss.x;
        const ay = al.y - boss.y;
        ctx.fillStyle = "#3a2a4a";
        ctx.strokeStyle = "#cc66ff";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#cc66ff";
        ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(ax, ay, al.r, 0, Math.PI * 2); ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        if (al.flash > 0.02) {
            ctx.fillStyle = `rgba(255,255,255,${(al.flash * 0.7).toFixed(3)})`;
            ctx.beginPath(); ctx.arc(ax, ay, al.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(ALTAR_ICONS[al.type] || "🕯️", ax, ay + 4);
        // HP 条
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(ax - al.r, ay - al.r - 6, al.r * 2, 4);
        ctx.fillStyle = "#cc66ff";
        ctx.fillRect(ax - al.r, ay - al.r - 6, (al.r * 2) * (al.hp / al.maxHp), 4);
    }

    // 易伤闪烁
    if (boss.vulnerable) {
        ctx.fillStyle = `rgba(255,220,50,${0.1 + Math.sin(Date.now() / 60) * 0.1})`;
        ctx.beginPath(); ctx.arc(0, 0, boss.r + 8, 0, Math.PI * 2); ctx.fill();
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
    ctx.fillText(`${boss.name}${boss.vulnerable ? " [易伤]" : ""}${boss.phase > 0 ? " [P2]" : ""}`, W / 2, by - 10);
}

export function drawBossBullets() {
    for (const b of state.bossBullets) {
        ctx.shadowColor = "#ff6b9d"; ctx.shadowBlur = 8;
        ctx.fillStyle = "#ff6b9d"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
}

// 地面危险区
export function drawBossDangerZones() {
    for (const z of state.bossDangerZones) {
        if (z.type === "shockwave") {
            ctx.strokeStyle = `rgba(255,200,100,${z.life / 60 * 0.6})`;
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke();
        } else if (z.type === "hazard") {
            ctx.fillStyle = `rgba(200,50,50,${z.life / 240 * 0.25})`;
            ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = `rgba(255,80,80,${z.life / 240 * 0.4})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
        }
    }
}

export function drawEnemyBullets() {
    for (const b of state.enemyBullets) {
        ctx.shadowColor = "#ffa94d"; ctx.shadowBlur = 6;
        ctx.fillStyle = "#ffa94d"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
}