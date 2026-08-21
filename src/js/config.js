// 打击感、音效与进程配置
export const GAME_CONFIG = {
    sound: {
        enabled: true, // 音效开关（游戏内按 M 键切换）
        volume: 0.4, // 主音量 0 ~ 1
    },
    screenShake: true, // 击碎方块时的震屏
    hitStop: true, // 击碎方块时的顿帧
    event: {
        chance: 0.20, // 通过关卡后进入事件房的概率
    },
};