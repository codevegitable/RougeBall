import { W, H } from "./constants.js";

export const canvas = document.getElementById("game");
export const ctx = canvas.getContext("2d");

canvas.width = W;
canvas.height = H;

export function resize() {
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H) * 0.95;
    canvas.style.width = (W * scale) + "px";
    canvas.style.height = (H * scale) + "px";
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