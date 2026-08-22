// ═══ 布局区域定义 ═══
// 目标：HUD 只占用画面顶部与底部的保留带，绝不与游戏区（方块/球/挡板）重叠。
//
//  0 ┌────────────────────────────────┐
//    │  HUD_TOP  (顶栏：关卡/血量/分数) │  48px
// 48 ├────────────────────────────────┤
//    │                                │
//    │        FIELD (游戏区)           │  方块从 GRID_Y=88 开始
//    │                                │
// 544├────────────────────────────────┤
//    │  HUD_BOTTOM (技能槽 + 状态)      │  56px
// 600└────────────────────────────────┘
//
// 挡板在 y = H-40 = 560，落在底栏范围内，因此底栏只在两侧放内容，
// 中间留出挡板活动的通道。

import { W, H } from "./constants.js";

export const HUD_TOP_H = 48;

// 游戏区（方块生成与球体活动的垂直范围）
export const FIELD_TOP = HUD_TOP_H;

// 底部技能槽区域。
// 纵向位置有两个约束：槽位下方要放按键数字（+16px），且槽位底部不能
// 落进挡板行（挡板 y=H-40..H-26，且能左移到 x=0，会从技能槽下方穿过）。
// H-84 使槽位占 516..560，正好压在挡板上沿之上。
export const SKILL_SLOT = 44;
export const SKILL_GAP = 6;
export const SKILL_Y = H - 84;
export const SKILL_X = 10;

// 状态标签（buff/诅咒）区域：右下角，与技能槽同一基线，同样避开挡板行
export const STATUS_RIGHT = W - 10;
export const STATUS_Y = SKILL_Y;
export const STATUS_MAX = 4;

// 弹窗面板的统一宽度与居中辅助
export const PANEL_W = 680;
export const panelX = (w = PANEL_W) => Math.round((W - w) / 2);

// 卡片布局：三选一卡片的统一尺寸
export const CARD_W = 184;
export const CARD_H = 248;
export const CARD_GAP = 24;

export function cardRow(count, y, cw = CARD_W, gap = CARD_GAP) {
    const total = count * cw + (count - 1) * gap;
    const sx = Math.round((W - total) / 2);
    const out = [];
    for (let i = 0; i < count; i++) out.push({ x: sx + i * (cw + gap), y });
    return out;
}

// 按钮统一尺寸
export const BTN_W = 224;
export const BTN_H = 44;
export const BTN_SM_W = 140;
export const BTN_SM_H = 34;
