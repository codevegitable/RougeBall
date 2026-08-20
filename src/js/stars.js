import { W, H } from "./constants.js";
import { state } from "./state.js";
import { ctx } from "./canvas.js";

export function initStars() {
    state.stars = [];
    for (let i = 0; i < 100; i++) {
        state.stars.push({
            x: Math.random() * W,
            y: Math.random() * H,
            r: Math.random() * 1.5 + 0.5,
            twinkle: Math.random() * Math.PI * 2,
            speed: Math.random() * 0.02 + 0.01,
        });
    }
}

export function updateStars() {
    for (const s of state.stars) {
        s.twinkle += s.speed;
    }
}

export function drawStars() {
    for (const s of state.stars) {
        const alpha = 0.3 + Math.sin(s.twinkle) * 0.3;
        ctx.fillStyle = `rgba(200,210,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
    }
}