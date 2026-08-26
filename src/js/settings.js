// 持久化游戏设置
const KEY = "bounceRoguelikeSettings";

const DEFAULTS = {
    sound: { enabled: true, volume: 0.4 },
    screenShake: true,
    hitStop: true,
    eventChance: 0.3,
    speedZone: { enabled: true, multiplier: 4 },
};

export function loadSettings() {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return { ...DEFAULTS, ...parsed };
        }
    } catch (e) { /* ignore */ }
    return { ...DEFAULTS };
}

export function saveSettings(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}

export function applySettings(s, config) {
    config.sound.enabled = s.sound.enabled;
    config.sound.volume = s.sound.volume;
    config.screenShake = s.screenShake;
    config.hitStop = s.hitStop;
    config.event.chance = s.eventChance;
    config.speedZone.enabled = s.speedZone.enabled;
    config.speedZone.multiplier = s.speedZone.multiplier;
}