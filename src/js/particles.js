import { state } from "./state.js";
import { ctx } from "./canvas.js";
import { PX } from "./pixel.js";

export function spawnParticles(x, y, color, count = 10) {
    const MAX_PARTICLES = 200;
    const actual = Math.min(count, MAX_PARTICLES - state.particles.length);
    for (let i = 0; i < actual; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 1;
        state.particles.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2,
            life: 1,
            decay: Math.random() * 0.03 + 0.02,
            size: Math.random() * 4 + 2,
            color,
        });
    }
}

export function updateParticles() {
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
        p.life -= p.decay;
        if (p.life <= 0) state.particles.splice(i, 1);
    }
}

export function drawParticles() {
    // 像素碎块：尺寸吸附到 PX 网格，生命末期缩小一档而非淡出成雾
    for (const p of state.particles) {
        const step = p.life > 0.6 ? 2 : p.life > 0.3 ? 1.5 : 1;
        const s = Math.max(PX, Math.round((p.size * step) / PX) * PX);
        ctx.globalAlpha = p.life > 0.25 ? 1 : p.life / 0.25;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x / PX) * PX, Math.round(p.y / PX) * PX, s, s);
    }
    ctx.globalAlpha = 1;
}