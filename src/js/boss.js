import { W, H, STATE, PADDLE_BASE_W } from "./constants.js";
import { state, addScore, loseLife } from "./state.js";
import { ctx } from "./canvas.js";
import { spawnParticles } from "./particles.js";
import { screenShake, spawnRing, spawnFloatingText, playerHurt } from "./fx.js";
import { playBossHit, playBossShoot, playBossDeath, playVictory, playPlayerHit, playWallHit } from "./sound.js";
import { BOSS_CANDIDATES, BOSS_TIER_INDEX } from "./data/bosses.js";
import { PAL, rgba } from "./palette.js";
import { PX, pRectRaw, pRing, pBar, pText, pDitherMask, pCircle, pBlob } from "./pixel.js";
import { HUD_TOP_H } from "./layout.js";
import { drawIcon } from "./icons.js";
import { drawBossSprite, drawBossCrown } from "./boss_art.js";

// 以任意中心绘制像素圆（pCircle 的别名，便于 boss 局部坐标系调用）
const pCircleAt = (cx, cy, r, color) => pCircle(cx, cy, r, color);

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
    let skill;
    // 诅咒司祭：祭坛技能权重提高（1.25 倍频率）
    if (boss.bossType === "priest" && available.includes("altar") && Math.random() < 0.6) {
        skill = "altar";
    } else {
        skill = available[Math.floor(Math.random() * available.length)];
    }
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
    spawnParticles(boss.x, boss.y, PAL.bone1, 20);
    spawnFloatingText(boss.x, boss.y - 30, "撞墙眩晕！", PAL.gold3);
    playWallHit();
}

function startRecovery(boss, frames) {
    boss.recoverTimer = frames;
    boss.vulnerable = true;
    boss.action = null;
    boss.actionCooldown = 0;
    spawnFloatingText(boss.x, boss.y - 50, "易伤！", PAL.gold3);
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

// 召唤物类型池
// 母体（tier 1）：healer=治疗花 / poison=腐化花 / vine=藤蔓
const MOTHER_MINIONS = [
    ["healer", 1], ["poison", 1.5], ["poison", 1.5], ["vine", 1.2],
];
// 蜂巢（tier 2）：turret=弹幕无人机 / shield=护盾无人机 / bomber=自爆无人机（无回血）
const HIVE_MINIONS = [
    ["turret", 1.5], ["turret", 1.5], ["shield", 1.2], ["bomber", 1.2],
];

function spawnMinionForType(boss) {
    // 根据层级减少召唤频率：tier 1-2 有概率跳过
    if (boss.tier >= 1 && Math.random() < 0.4) return;
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
    const colors = { healer: PAL.moss3, poison: PAL.vio3, vine: PAL.arc2, turret: PAL.ember2, shield: PAL.gold3, bomber: PAL.ember2 };
    const bossId = state.boss;
    boss.minions.push({
        x: mx, y: my, r: 14, hp: 20 + boss.tier * 10,
        maxHp: 20 + boss.tier * 10, type: picked,
        healTimer: picked === "healer" ? 180 : 0,
        poisonTimer: picked === "poison" ? 120 : 0,
        shootTimer: picked === "turret" ? 60 : 0,
        seekTimer: picked === "bomber" ? 90 : 0,
        flash: 0, angle: 0, color: colors[picked] || PAL.bone1,
    });
    spawnFloatingText(mx, my - 20, `召唤：${picked}`, colors[picked]);
}

function updateMinions(boss, dt) {
    for (let i = boss.minions.length - 1; i >= 0; i--) {
        const m = boss.minions[i];
        m.flash = Math.max(0, m.flash - 0.08 * dt);
        if (m.type === "healer") {
            m.healTimer -= dt;
            if (m.healTimer <= 0) {
                m.healTimer = 180;
                const healAmount = 2 + boss.tier;
                boss.hp = Math.min(boss.maxHp, boss.hp + healAmount);
                spawnFloatingText(m.x, m.y - 16, `治疗 +${healAmount}`, PAL.moss3);
            }
        }
        // 腐化花：定期生成毒区
        if (m.type === "poison") {
            m.poisonTimer -= dt;
            if (m.poisonTimer <= 0) {
                m.poisonTimer = 120;
                const r = 40;
                state.bossDangerZones.push({ x: boss.x + (m.x - boss.x) * 0.25, y: m.y + 20, r, life: 180, type: "hazard", color: PAL.vio2, _poison: true });
                spawnFloatingText(m.x, m.y - 20, "毒雾扩散！", PAL.vio3);
            }
        }
        // 藤蔓：束缚挡板（短暂移速降低）
        if (m.type === "vine" && Math.hypot(state.paddle.x - m.x, state.paddle.y - m.y) < 80) {
            state.player.curseMoveResist = (state.player.curseMoveResist || 0) + 0.3;
        }
        // 自爆无人机：追向挡板
        if (m.type === "bomber") {
            m.seekTimer -= dt;
            const dx = state.paddle.x + state.paddle.width / 2 - m.x;
            const dy = state.paddle.y - m.y;
            const len = Math.hypot(dx, dy) || 1;
            m.x += (dx / len) * 0.6 * dt;
            m.y += (dy / len) * 0.6 * dt;
            if (m.seekTimer <= 0 || len < 20) {
                state.boss.minions.splice(i, 1);
                if (len < 80) {
                    state.invulnTimer = 100;
                    loseLife(1);
                    screenShake(10, 200);
                    spawnFloatingText(m.x, m.y, "爆炸！", PAL.ember3);
                }
                continue;
            }
        }
        // 弹幕无人机：定期发射单发子弹
        if (m.type === "turret") {
            m.shootTimer -= dt;
            if (m.shootTimer <= 0) {
                m.shootTimer = 60 + Math.random() * 30;
                const px = state.paddle.x + state.paddle.width / 2;
                const py = state.paddle.y;
                const ang = Math.atan2(py - m.y, px - m.x);
                const spd = 2.0 + boss.tier * 0.2;
                state.bossBullets.push({
                    x: m.x, y: m.y,
                    vx: Math.cos(ang) * spd,
                    vy: Math.sin(ang) * spd,
                    r: 6, age: 0, homing: false, splitAt: 0, wave: null,
                });
                playBossShoot();
            }
        }
        // 受击（由 physics.js 处理碰撞）
        if (m.hp <= 0) {
            spawnParticles(m.x, m.y, m.color || PAL.moss3, 12);
            boss.minions.splice(i, 1);
            // 召唤物死亡削弱 Boss
            boss.hp -= 10;
            boss.flash = 1;
            spawnFloatingText(boss.x, boss.y - 40, "召唤物死亡反噬！", PAL.blood2);
        }
    }
}

// ─── 祭坛（诅咒司祭专属）──────────────────────────────────
function executeAltar(boss, a, dt) {
    if (a.phase === "warn") {
        // 预警 16 帧（1.25 倍频率）
        if (a.timer > 16) {
            a.phase = "active";
            a.timer = 0;
        }
    } else if (a.phase === "active") {
        if (a.timer < 8) {
            // 生成 1-5 个祭坛（普通三型共用一个上限）
            const count = 1 + Math.floor(Math.random() * 5);
            for (let n = 0; n < count; n++) {
                if (boss.altars.filter(x => !x.chasing).length < 4) {
                    spawnStaticAltar(boss);
                }
                // 30% 概率附带生成一个追踪祭坛（独立计数，上限 2）
                if (Math.random() < 0.3 && boss.altars.filter(x => x.chasing).length < 2) {
                    spawnChaseAltar(boss);
                }
            }
            playBossShoot();
        }
        if (a.timer > 10) {
            startRecovery(boss, 30);
        }
    }
}

// 普通静态祭坛
function spawnStaticAltar(boss) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 150 + Math.random() * 100;
    const ax = Math.max(50, Math.min(W - 50, boss.x + Math.cos(angle) * dist));
    const ay = Math.max(100, Math.min(H - 80, boss.y + Math.sin(angle) * dist));
    const kinds = ["dmg", "speed", "cd"];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    boss.altars.push({
        x: ax, y: ay, r: 20, hp: 15 + boss.tier * 8,
        maxHp: 15 + boss.tier * 8, type: kind, flash: 0, chasing: false,
    });
    spawnFloatingText(ax, ay - 20, "诅咒祭坛出现！", PAL.vio2);
}

// 追踪祭坛：半场生成，缓慢移向玩家
function spawnChaseAltar(boss) {
    const ax = W / 2 + (Math.random() - 0.5) * 240;
    const ay = 100 + Math.random() * (H - 200);
    const kinds = ["dmg", "speed", "cd"];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    boss.altars.push({
        x: ax, y: ay, r: 18, hp: 12 + boss.tier * 6,
        maxHp: 12 + boss.tier * 6, type: kind, flash: 0, chasing: true,
    });
    spawnFloatingText(ax, ay - 20, "追踪祭坛！", PAL.ember2);
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
    // 追踪祭坛：缓慢移向挡板
    const dt = state.dt;
    for (const al of boss.altars) {
        if (!al.chasing) continue;
        const px = state.paddle.x + state.paddle.width / 2;
        const py = state.paddle.y;
        const dx = px - al.x;
        const dy = py - al.y;
        const len = Math.hypot(dx, dy) || 1;
        const spd = (0.7 + boss.tier * 0.1) * dt;
        al.x += (dx / len) * spd;
        al.y += (dy / len) * spd;
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
                spawnFloatingText(boss.x, boss.y - 50, "蓄力完成！大招释放！", PAL.blood2);
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
    spawnFloatingText(boss.x, boss.y - 50, "大招被打断！", PAL.moss3);
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
        spawnFloatingText(boss.x, boss.y - boss.r - 14, `-${finalDmg}`, boss.vulnerable ? PAL.gold3 : PAL.ember3);
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
    spawnParticles(boss.x, boss.y, PAL.bone1, 40);
    for (let i = 0; i < 3; i++) spawnRing(boss.x, boss.y, PAL.gold3);
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
            spawnParticles(b.x, b.y, bulletColor(b), 8);
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
    if (pl.shieldTimer > 0) { spawnRing(bullet.x, bullet.y, PAL.arc3); playWallHit(); return; }
    if (state.invulnTimer > 0) return;
    if (pl.bounceShield > 0 && Math.random() < pl.bounceShield) { spawnRing(bullet.x, bullet.y, PAL.gold3); playWallHit(); return; }
    if (Math.random() < pl.bossResist) { spawnFloatingText(state.paddle.x + state.paddle.width / 2, state.paddle.y - 24, "格挡！", PAL.moss3); playWallHit(); return; }
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
    if (pl.shieldTimer > 0) { spawnRing(state.paddle.x, state.paddle.y, PAL.arc3); playWallHit(); return; }
    if (state.invulnTimer > 0) return;
    if (pl.bounceShield > 0 && Math.random() < pl.bounceShield) { spawnRing(state.paddle.x, state.paddle.y, PAL.gold3); playWallHit(); return; }
    if (Math.random() < pl.bossResist) { spawnFloatingText(state.paddle.x + state.paddle.width / 2, state.paddle.y - 24, "格挡！", PAL.moss3); playWallHit(); return; }
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

    // 冲锋预警：像素虚线（等距方块），闪烁用离散帧
    if (boss.action?.type === "charge" && boss.action.phase === "warn" && boss.chargeTarget) {
        const dx = boss.chargeTarget.x - boss.x;
        const dy = boss.chargeTarget.y - boss.y;
        const dist = Math.hypot(dx, dy);
        const steps = Math.floor(dist / (PX * 4));
        const on = Math.floor(boss.t / 5) % 2 === 0;
        for (let i = 1; i <= steps; i++) {
            if (i % 2 === (on ? 0 : 1)) continue;
            const px = Math.round((dx * (i / steps)) / PX) * PX;
            const py = Math.round((dy * (i / steps)) / PX) * PX;
            pRectRaw(px - PX, py - PX, PX * 2, PX * 2, PAL.blood2);
        }
    }

    // 跳砸落点：像素同心环 + 网点填充
    if (boss.action?.type === "slam" && boss.action.phase === "warn" && boss.slamTarget) {
        const sx = boss.slamTarget.x - boss.x;
        const sy = boss.slamTarget.y - boss.y;
        const pulse = Math.floor(boss.t / 8) % 2 === 0 ? 0 : PX;
        pRing(sx, sy, 30 + pulse, PAL.blood2, 1);
        pRing(sx, sy, 20 + pulse, PAL.blood1, 1);
        pRectRaw(sx - PX, sy - PX * 4, PX * 2, PX * 8, PAL.blood1);
        pRectRaw(sx - PX * 4, sy - PX, PX * 8, PX * 2, PAL.blood1);
    }

    // 蓄力进度：环形改为顶部像素条 + 百分比
    if (boss.action?.type === "ultimate" && boss.action.phase === "warn") {
        const bw = boss.r * 2;
        pBar(-bw / 2, -boss.r - PX * 8, bw, PX * 3, boss.chargeProgress / 100, PAL.gold2, {
            bg: PAL.ink0, light: PAL.gold3,
        });
        pText(`${Math.round(boss.chargeProgress)}%`, 0, -boss.r - PX * 10, PAL.gold3, {
            size: 12, bold: true, align: "center",
        });
    }

    // 召唤物：像素圆 + 类型点阵图标 + 顶部血条
    const MINION_ICONS = { healer: "flower", poison: "potion", vine: "vine", turret: "target", shield: "shield", bomber: "bomb" };
    for (const m of boss.minions) {
        const mx = m.x - boss.x;
        const my = m.y - boss.y;
        const mc = m.color || PAL.moss3;
        pCircleAt(mx, my, m.r, PAL.ink0);
        pCircleAt(mx, my, m.r - PX, mc);
        drawIcon(MINION_ICONS[m.type] || "star", mx, my, 2, PAL.ink0);
        if (m.flash > 0.02) {
            ctx.globalAlpha = Math.min(1, m.flash * 0.8);
            pCircleAt(mx, my, m.r - PX, PAL.bone1);
            ctx.globalAlpha = 1;
        }
        pBar(mx - m.r, my - m.r - PX * 3, m.r * 2, PX * 2, m.hp / m.maxHp, mc, { bg: PAL.ink0 });
    }

    // 祭坛：石座 + 悬浮符文（追踪祭坛用红色调标记）
    const ALTAR_ICONS = { dmg: "sword", speed: "lightning", cd: "hourglass" };
    for (const al of boss.altars) {
        const ax = al.x - boss.x;
        const ay = al.y - boss.y;
        const ringCol = al.chasing ? PAL.ember2 : PAL.vio1;
        const orbCol = al.chasing ? PAL.ember3 : PAL.vio3;
        pCircleAt(ax, ay, al.r, PAL.ink0);
        pCircleAt(ax, ay, al.r - PX, ringCol);
        // 旋转符文点：三个绕祭坛公转的像素点
        for (let i = 0; i < 3; i++) {
            const a = boss.t * 0.03 + (Math.PI * 2 * i) / 3;
            pRectRaw(ax + Math.cos(a) * (al.r + PX) - PX / 2, ay + Math.sin(a) * (al.r + PX) - PX / 2, PX, PX, orbCol);
        }
        drawIcon(ALTAR_ICONS[al.type] || "candle", ax, ay, 2, orbCol);
        if (al.flash > 0.02) {
            ctx.globalAlpha = Math.min(1, al.flash * 0.8);
            pCircleAt(ax, ay, al.r - PX, PAL.bone1);
            ctx.globalAlpha = 1;
        }
        pBar(ax - al.r, ay - al.r - PX * 3, al.r * 2, PX * 2, al.hp / al.maxHp, ringCol, { bg: PAL.ink0 });
    }

    // 尖刺环：像素方块沿圆周排布，替代描线尖刺
    const spikeN = 12;
    for (let i = 0; i < spikeN; i++) {
        const a = (Math.PI * 2 * i) / spikeN + boss.t * 0.008;
        const sr = boss.r + PX * 2 + (Math.floor(boss.t / 20) % 2 === 0 ? PX : 0);
        const sx = Math.round((Math.cos(a) * sr) / PX) * PX;
        const sy = Math.round((Math.sin(a) * sr) / PX) * PX;
        pRectRaw(sx - PX, sy - PX, PX * 2, PX * 2, boss.phase > 0 ? PAL.blood2 : boss.color);
    }

    // 主体像素造型
    const { cell } = drawBossSprite(boss.bossType, boss.color, boss.r, boss.t, {
        phase2: boss.phase > 0,
        flash: boss.flash,
        vulnerable: boss.vulnerable,
    });

    // 最终 Boss 加冠
    if (boss.level >= 50) drawBossCrown(boss.r, cell);

    ctx.restore();
}

// Boss 血条：紧贴顶栏下沿，居中；名称与状态标签在条内，避免占用额外纵向空间
export function drawBossBar() {
    const boss = state.boss;
    if (!boss) return;
    const bw = 440;
    const bx = Math.round((W - bw) / 2);
    const by = HUD_TOP_H + 8;
    const ratio = Math.max(0, boss.hp / boss.maxHp);

    // 名称 + 状态
    let label = boss.name;
    if (boss.phase > 0) label += " · 二阶段";
    if (boss.vulnerable) label += " · 易伤";
    pText(label, W / 2, by - PX, boss.vulnerable ? PAL.gold3 : PAL.bone1, {
        size: 13, bold: true, align: "center",
    });

    // 血条：分段刻度，像素风更易读
    pBar(bx, by + PX, bw, PX * 4, ratio, boss.phase > 0 ? PAL.blood2 : boss.color, {
        bg: PAL.ink1, light: boss.phase > 0 ? PAL.blood3 : PAL.bone1, border: PAL.ink0,
    });
    // 每 25% 一道分隔刻线
    for (let i = 1; i < 4; i++) {
        pRectRaw(bx + (bw * i) / 4, by + PX, PX, PX * 4, PAL.ink0);
    }
}

// Boss 弹幕：实心菱形弹。
//
// 三个此前的可读性问题，逐个对应修复：
//  1. 太小 —— 原本只画十字骨架（横竖各 PX*2 厚），r=6 的弹在混战里只有约
//     10px 的亮部。现在画实心菱形并把最小视觉半径提到 PX*3，亮部约 24px。
//  2. 白色难分辨 —— 原本核心恒为 bone1(#f4eee2)、主体为 blood3(#f07d84)，
//     在骨白文字、金色球、亮色地板前都糊成一片。现在按弹种取高饱和暖色，
//     白色只留作 1px 的高光点缀，不再充当主色。
//  3. 弹种无从判断 —— homing/split/wave 与普通弹外观完全相同。现在各有配色
//     与标记（追踪=紫环、分裂=十字芯、波动=侧翼点）。
//
// 分层顺序：暗轮廓 → 主体 → 亮内芯 → 高光，保证任何背景上都有明暗边界。
// 四个弹种各占一个色系，且都不以骨白为主色——骨白是文字与主球的颜色，
// 弹幕再用白就会和它们糊在一起（这正是"白色子弹不易分辨"的来源）。
const BULLET_KIND = {
    normal: { edge: PAL.ember0, body: PAL.ember2, core: PAL.ember3 },
    homing: { edge: PAL.vio0, body: PAL.vio2, core: PAL.vio3 },
    split: { edge: PAL.blood0, body: PAL.blood2, core: PAL.blood3 },
    wave: { edge: PAL.arc0, body: PAL.arc2, core: PAL.arc3 },
};

function bulletKind(b) {
    if (b.homing) return BULLET_KIND.homing;
    if (b.splitAt > 0) return BULLET_KIND.split;
    if (b.wave) return BULLET_KIND.wave;
    return BULLET_KIND.normal;
}

// 供 physics.js 生成击毁碎屑用，保证碎屑与弹体同色
export function bulletColor(b) {
    return bulletKind(b).body;
}

export function drawBossBullets() {
    for (const b of state.bossBullets) {
        const k = bulletKind(b);
        // 视觉半径下限 9px（直径 ~20px）。碰撞半径只有 5~6，按碰撞半径画必然
        // 小到看不清；放大的部分是外圈暗轮廓与光晕，亮色主体仍贴着碰撞体，
        // 玩家据主体判断走位不会吃亏。
        // 菱形只有外接方形一半的面积，同样半径下亮部远小于方形弹，
        // 因此下限取 14px（直径 28px），实测亮部约 400px，混战中足够醒目。
        const r = Math.max(14, b.r * 2);
        pBlob(b.x, b.y, r + PX, PAL.ink0, "diamond");   // 暗轮廓：任何背景都压出边界
        pBlob(b.x, b.y, r, k.body, "diamond");
        // 内芯只缩 1 格：菱形每缩一格就掉两圈面积，缩 2 格会塌成单像素，
        // 亮色内芯等于没画（实测只剩 16px）。
        pBlob(b.x, b.y, r - PX, k.core, "diamond");
        pRectRaw(b.x - PX / 2, b.y - PX / 2, PX, PX, PAL.bone1);  // 中心高光点（仅 1 格）

        // 弹种标记：用形状而非仅靠颜色区分，色盲玩家同样能读。
        // 标记一律取本弹种的亮色档，不用骨白——避免又变成"白弹"。
        // 所有标记都画在暗轮廓以内，否则亮点会在浅色地板上脱离弹体单独漂浮。
        if (b.homing) {
            const on = Math.floor(b.age / 6) % 2 === 0;   // 脉动环："会跟着你走"
            pRing(b.x, b.y, r + PX * 2, on ? PAL.vio3 : PAL.vio1, 1);
        } else if (b.splitAt > 0) {
            // 横贯十字："会炸成多发"
            pRectRaw(b.x - r + PX, b.y - PX / 2, r * 2 - PX * 2, PX, k.core);
        } else if (b.wave) {
            // 两侧翼点：走蛇形
            pRectRaw(b.x - r + PX, b.y - PX / 2, PX, PX, k.core);
            pRectRaw(b.x + r - PX * 2, b.y - PX / 2, PX, PX, k.core);
        }
    }
}

// 地面危险区：像素环 + 网点填充，保持地面可读
export function drawBossDangerZones() {
    for (const z of state.bossDangerZones) {
        if (z.type === "shockwave") {
            ctx.globalAlpha = Math.max(0, Math.min(1, (z.life / 60) * 0.9));
            pRing(z.x, z.y, z.r, PAL.ember2, 2);
            pRing(z.x, z.y, z.r - PX * 2, PAL.ember1, 1);
            ctx.globalAlpha = 1;
        } else if (z.type === "hazard") {
            const a = Math.max(0, Math.min(1, z.life / 240));
            // 毒雾用紫色，与中毒后变紫的球对应；其他 hazard 仍是血红。
            // 配色一致玩家才能把"踩到这个"和"球变紫了"联系起来。
            const fill = z._poison ? PAL.vio1 : PAL.blood1;
            const ring = z._poison ? PAL.vio2 : PAL.blood2;
            const d = a * 0.35;
            if (d > 0.02) drawZoneFill(z.x, z.y, z.r, fill, d);
            ctx.globalAlpha = Math.min(1, a * 1.2);
            pRing(z.x, z.y, z.r, ring, 1);
            ctx.globalAlpha = 1;
        }
    }
}

// 圆形网点填充：逐行裁剪到圆内。
// pDitherMask 填的是正方形，会溢出到圆环之外，让"圆形危险区"的边界失真——
// 而这个边界正是玩家判断进出的依据。
function drawZoneFill(cx, cy, r, color, density) {
    const gx = Math.round(cx / PX), gy = Math.round(cy / PX);
    const gr = Math.max(1, Math.round(r / PX));
    ctx.fillStyle = color;
    for (let dy = -gr; dy <= gr; dy++) {
        const span = Math.floor(Math.sqrt(Math.max(0, gr * gr - dy * dy)));
        for (let dx = -span; dx <= span; dx++) {
            if ((ZONE_BAYER[(dy + gr) & 3][(dx + gr) & 3] + 0.5) / 16 >= density) continue;
            ctx.fillRect((gx + dx) * PX, (gy + dy) * PX, PX, PX);
        }
    }
}

const ZONE_BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
];

// 方块射出的子弹：方形弹丸 + 尾迹。
// 原实现 r=5 经 round(5/4)*4 量化成 4，整颗弹只有 8×8 且大半是黑边，
// 亮部不到 6px——这就是"子弹太小看不清"的直接原因。
// 现在视觉半径下限 PX*2.5（约 20px footprint），并用方形轮廓与 Boss 的
// 菱形弹拉开区分：玩家扫一眼就知道威胁来自方块还是 Boss。
export function drawEnemyBullets() {
    for (const b of state.enemyBullets) {
        const r = Math.max(10, b.r * 2);   // 视觉半径下限 10px → 直径 20px

        // 运动尾迹：沿速度反方向拖两段，让高速小物体在视觉上"拉长"更易追踪。
        // 偏移必须大于弹体半径 + 轮廓厚度，否则尾迹会整段被弹体自己的暗轮廓盖掉。
        const len = Math.hypot(b.vx, b.vy) || 1;
        const ux = b.vx / len, uy = b.vy / len;
        const off = r + PX * 2;
        pBlob(b.x - ux * (off + PX * 3), b.y - uy * (off + PX * 3), r * 0.35, PAL.ember0, "square");
        pBlob(b.x - ux * off, b.y - uy * off, r * 0.6, PAL.ember1, "square");

        pBlob(b.x, b.y, r + PX, PAL.ink0, "square");     // 暗轮廓
        pBlob(b.x, b.y, r, PAL.ember2, "square");
        pBlob(b.x, b.y, r - PX, PAL.ember3, "square");
        pRectRaw(b.x - PX / 2, b.y - PX / 2, PX, PX, PAL.bone1);  // 中心高光
    }
}