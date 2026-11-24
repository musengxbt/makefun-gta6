// save.js — the run's persistence, kept in localStorage under one key.
// What is saved is the shape of a life in Puerto Sombra: cash, story
// progress, collected buoys, weapon and ammo, health and where Mara was
// standing. Storage failures (private windows, quotas) degrade to a
// session-only game instead of an error.

import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (typeof data.cash !== 'number' || typeof data.chapter !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function writeSave(G) {
  try {
    const p = G.player;
    const data = {
      cash: Math.round(G.cash),
      respect: G.respect,
      chapter: G.chapter,
      buoys: [...G.buoysFound],
      hasGun: p.hasGun,
      ammo: p.ammo,
      health: Math.round(p.health),
      x: Math.round(p.x),
      y: Math.round(p.y),
      minutes: Math.round(G.minutes),
      taxiFares: G.taxiFares,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear if storage itself is unavailable.
  }
}
