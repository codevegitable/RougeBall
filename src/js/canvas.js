import { W, H } from "./constants.js";

export const canvas = document.getElementById("game");
export const ctx = canvas.getContext("2d");

canvas.width = W;
canvas.height = H;

// 像素风缩放：只允许整数倍或 0.5 步进，避免非整数缩放导致像素被插值抹平。
// 屏幕过小时退化为 0.5 步进（仍能保持较规整的像素块）。
export function resize() {
    const raw = Math.min(window.innerWidth / W, window.innerHeight / H) * 0.95;
    let scale;
    if (raw >= 1) {
        scale = Math.floor(raw);            // 1×, 2×, 3× …
    } else {
        scale = Math.max(0.5, Math.floor(raw * 2) / 2); // 0.5× 步进
    }
    canvas.style.width = (W * scale) + "px";
    canvas.style.height = (H * scale) + "px";
    // 关闭平滑（部分浏览器在 canvas 尺寸变化后会重置该标记）
    ctx.imageSmoothingEnabled = false;
}

export function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
    };
}