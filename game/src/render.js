// render.js — everything Sombra Heat draws, and nothing it decides. The
// world is painted around a camera that follows Mara: ground, roads, the
// park and the beach first, then buildings, props, cars and people, then
// the day-cycle tint and lamplight, and finally the HUD, the minimap and
// whichever screen (title, pause, busted, wasted) owns the moment.

import {
  AVENUE_YS, BEACH_X, COLORS, GAME_TITLE, PARK, PLACES, ROAD_HALF, STREET_XS, WATER_X, WORLD,
} from './config.js';
import { clamp, dist } from './random.js';
import { placePoint } from './world.js';
import { CHAPTERS, STORY_INTRO } from './missions.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function star(ctx, cx, cy, r, filled, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
}

/** The title screen's buttons, shared by the painter and the click handler. */
export function menuButtons(G, w, h) {
  const bw = 280;
  const bh = 48;
  const x = (w - bw) / 2;
  const y0 = h * 0.545;
  return [
    { id: 'new', label: 'NEW GAME', x, y: y0, w: bw, h: bh, enabled: true },
    { id: 'continue', label: 'CONTINUE', x, y: y0 + bh + 12, w: bw, h: bh, enabled: !!G.hasSave },
  ];
}

/** How dark the world is right now: 0 at noon, 1 at deep night. */
export function nightFactor(minutes) {
  const t = minutes / 60;
  const day = Math.sin(((t - 6) / 12) * Math.PI); // peaks at 13:00
  return clamp(1 - Math.max(0, day) * 1.25, 0, 1);
}

function drawGround(ctx, G, view) {
  const { city } = G;
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  // The park: greener grass, a pond, and pale paths crossing it.
  ctx.fillStyle = COLORS.parkGrass;
  ctx.fillRect(PARK.x, PARK.y, PARK.w, PARK.h);
  ctx.fillStyle = COLORS.plaza;
  ctx.fillRect(PARK.x, PARK.y + PARK.h / 2 - 13, PARK.w, 26);
  ctx.fillRect(PARK.x + PARK.w / 2 - 13, PARK.y, 26, PARK.h);
  ctx.fillStyle = COLORS.pond;
  ctx.beginPath();
  ctx.ellipse(PARK.x + PARK.w / 2, PARK.y + PARK.h / 2, 92, 62, 0, 0, Math.PI * 2);
  ctx.fill();
  // Sand and sea down the east side, with a wooden boardwalk between.
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(BEACH_X, 0, WORLD.w - BEACH_X, WORLD.h);
  ctx.fillStyle = COLORS.boardwalk;
  ctx.fillRect(BEACH_X - 16, 0, 20, WORLD.h);
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(WATER_X, 0, WORLD.w - WATER_X, WORLD.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  const waveOff = (G.time * 22) % 46;
  for (let x = WATER_X + 24 - waveOff; x < WORLD.w; x += 46) {
    for (let y = 30; y < WORLD.h; y += 92) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 9, y - 6, x + 18, y);
      ctx.stroke();
    }
  }
  void city;
}

function drawRoads(ctx) {
  // Pavements first (a pale slab under every road), then asphalt, then paint.
  ctx.fillStyle = COLORS.sidewalk;
  for (const sx of STREET_XS) ctx.fillRect(sx - ROAD_HALF - 9, 0, (ROAD_HALF + 9) * 2, WORLD.h);
  for (const ay of AVENUE_YS) ctx.fillRect(0, ay - ROAD_HALF - 9, BEACH_X + 20, (ROAD_HALF + 9) * 2);
  ctx.fillStyle = COLORS.road;
  for (const sx of STREET_XS) ctx.fillRect(sx - ROAD_HALF, 0, ROAD_HALF * 2, WORLD.h);
  for (const ay of AVENUE_YS) ctx.fillRect(0, ay - ROAD_HALF, BEACH_X + 20, ROAD_HALF * 2);
  ctx.strokeStyle = COLORS.roadLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 30]);
  ctx.beginPath();
  for (const sx of STREET_XS) { ctx.moveTo(sx, 0); ctx.lineTo(sx, WORLD.h); }
  for (const ay of AVENUE_YS) { ctx.moveTo(0, ay); ctx.lineTo(BEACH_X, ay); }
  ctx.stroke();
  ctx.setLineDash([]);
  // Kerb lines.
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const sx of STREET_XS) {
    ctx.moveTo(sx - ROAD_HALF + 3, 0); ctx.lineTo(sx - ROAD_HALF + 3, WORLD.h);
    ctx.moveTo(sx + ROAD_HALF - 3, 0); ctx.lineTo(sx + ROAD_HALF - 3, WORLD.h);
  }
  ctx.stroke();
}

function drawBuildings(ctx, G, view) {
  ctx.font = `600 13px ${FONT}`;
  for (const b of G.city.buildings) {
    if (b.x + b.w < view.x0 || b.x > view.x1 || b.y + b.h < view.y0 || b.y > view.y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    ctx.fillStyle = b.place ? '#8a6d3b' : b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    const rows = Math.max(1, b.floors);
    for (let i = 1; i < rows; i += 1) {
      const y = b.y + (b.h / rows) * i;
      ctx.beginPath();
      ctx.moveTo(b.x + 6, y);
      ctx.lineTo(b.x + b.w - 6, y);
      ctx.stroke();
    }
    const d = dist(G.cam.x, G.cam.y, b.x + b.w / 2, b.y + b.h / 2);
    if (d < 430) {
      ctx.fillStyle = 'rgba(20,22,26,0.72)';
      ctx.textAlign = 'center';
      const label = b.name;
      const tw = ctx.measureText(label).width + 12;
      ctx.fillRect(b.x + b.w / 2 - tw / 2, b.y - 24, tw, 18);
      ctx.fillStyle = '#f2ead8';
      ctx.fillText(label, b.x + b.w / 2, b.y - 11);
    }
  }
}

function drawProps(ctx, G, view) {
  for (const t of G.city.trees) {
    if (t.x < view.x0 - 30 || t.x > view.x1 + 30 || t.y < view.y0 - 30 || t.y > view.y1 + 30) continue;
    ctx.fillStyle = '#6e4f30';
    ctx.fillRect(t.x - 2.5, t.y - 2, 5, 9);
    ctx.fillStyle = '#3f7031';
    ctx.beginPath();
    ctx.arc(t.x, t.y - 4, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.4 - 4, t.r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const l of G.city.lamps) {
    ctx.fillStyle = '#3a3f45';
    ctx.fillRect(l.x - 1.5, l.y - 1.5, 3, 3);
  }
}

function drawPickupsAndCrates(ctx, G) {
  const bob = Math.sin(G.time * 3.2) * 3;
  for (const pk of G.pickups) {
    if (!pk.ready) continue;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    ctx.fillStyle = 'rgba(255,215,106,0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.fill();
    if (pk.kind === 'gun') {
      ctx.fillStyle = '#22262c';
      ctx.fillRect(-10, -3, 17, 6);
      ctx.fillRect(4, -3, 5, 10);
      ctx.fillStyle = '#4a5058';
      ctx.fillRect(-10, -3, 17, 2.4);
    } else if (pk.kind === 'ammo') {
      ctx.fillStyle = '#3f5a36';
      ctx.fillRect(-9, -7, 18, 14);
      ctx.fillStyle = '#d9c25a';
      ctx.fillRect(-9, -2, 18, 4);
    } else if (pk.kind === 'health') {
      ctx.fillStyle = '#eef1f5';
      ctx.fillRect(-10, -10, 20, 20);
      ctx.fillStyle = '#c23b2e';
      ctx.fillRect(-3, -8, 6, 16);
      ctx.fillRect(-8, -3, 16, 6);
    } else {
      ctx.fillStyle = '#4f9e57';
      ctx.fillRect(-10, -6, 20, 12);
      ctx.fillStyle = '#e8f5e3';
      ctx.font = `700 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 3.5);
    }
    ctx.restore();
  }
  for (const crate of G.crates) {
    if (crate.taken) continue;
    ctx.save();
    ctx.translate(crate.x, crate.y);
    ctx.fillStyle = '#8a6a42';
    ctx.fillRect(-13, -13, 26, 26);
    ctx.strokeStyle = '#5f4525';
    ctx.lineWidth = 3;
    ctx.strokeRect(-13, -13, 26, 26);
    ctx.beginPath();
    ctx.moveTo(-13, -13);
    ctx.lineTo(13, 13);
    ctx.moveTo(13, -13);
    ctx.lineTo(-13, 13);
    ctx.stroke();
    ctx.restore();
  }
  // Glass buoys: little spheres of sea-glass, glowing faintly.
  for (const buoy of G.city.buoys) {
    if (G.buoysFound.has(buoy.id)) continue;
    const pulse = 6 + Math.sin(G.time * 2.6 + buoy.id) * 1.6;
    ctx.fillStyle = 'rgba(127,227,208,0.3)';
    ctx.beginPath();
    ctx.arc(buoy.x, buoy.y, pulse + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7fe3d0';
    ctx.beginPath();
    ctx.arc(buoy.x, buoy.y, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(buoy.x - 2, buoy.y - 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCar(ctx, car, G) {
  const { spec } = car;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const w = spec.w;
  const h = spec.h;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
  // Wheels.
  ctx.fillStyle = '#15171a';
  const ww = car.type === 'moto' ? 9 : 10;
  ctx.fillRect(-w / 2 + 4, -h / 2 - 2.5, ww, 5);
  ctx.fillRect(-w / 2 + 4, h / 2 - 2.5, ww, 5);
  ctx.fillRect(w / 2 - ww - 4, -h / 2 - 2.5, ww, 5);
  ctx.fillRect(w / 2 - ww - 4, h / 2 - 2.5, ww, 5);
  // Body.
  ctx.fillStyle = car.mode === 'wreck' ? '#3c3a38' : car.color;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 6);
  ctx.fill();
  if (car.mode !== 'wreck') {
    // Cabin and glass.
    ctx.fillStyle = '#1d2733';
    ctx.beginPath();
    ctx.roundRect(-w * 0.16, -h / 2 + 3, w * 0.34, h - 6, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,200,230,0.5)';
    ctx.fillRect(w * 0.13, -h / 2 + 4.5, 3.4, h - 9);
    if (car.type === 'taxi') {
      ctx.fillStyle = '#20304a';
      ctx.font = `700 8px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', -w * 0.02, 2.8);
      ctx.fillStyle = '#f7f3e8';
      ctx.fillRect(-6, -h / 2 - 4, 12, 4);
    }
    if (car.type === 'patrulla') {
      ctx.fillStyle = '#eef1f5';
      ctx.fillRect(-w * 0.2, -h / 2, w * 0.42, h);
      // The light bar: red and blue, trading places twice a second.
      const phase = Math.sin(car.sirenPhase + G.time * 10) > 0;
      ctx.fillStyle = phase ? '#ff4444' : '#662222';
      ctx.fillRect(-7, -h / 2 + 1.5, 6.4, 5);
      ctx.fillStyle = phase ? '#223366' : '#4488ff';
      ctx.fillRect(0.6, -h / 2 + 1.5, 6.4, 5);
      ctx.fillStyle = phase ? '#ff4444' : '#662222';
      ctx.fillRect(-7, h / 2 - 6.5, 6.4, 5);
      ctx.fillStyle = phase ? '#223366' : '#4488ff';
      ctx.fillRect(0.6, h / 2 - 6.5, 6.4, 5);
    }
    if (car.type === 'burro') {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(-w / 2 + 4, -h / 2 + 4, w * 0.5, h - 8);
    }
    // Brake lights.
    if (car.brake || car.speed < -2) {
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(-w / 2 - 1.6, -h / 2 + 2, 2.6, 4.6);
      ctx.fillRect(-w / 2 - 1.6, h / 2 - 6.6, 2.6, 4.6);
    }
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(w / 2 - 1, -h / 2 + 2, 2.2, 4.2);
    ctx.fillRect(w / 2 - 1, h / 2 - 6.2, 2.2, 4.2);
  }
  if (car.hitFlash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${car.hitFlash * 2.4})`;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 6);
    ctx.fill();
  }
  if (car.missionCar) {
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath();
    ctx.arc(0, -h / 2 - 13 + Math.sin(G.time * 4) * 2.4, 4.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPed(ctx, ped, G) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(1, 2, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(-14, 0, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const stride = ped.speed > 4 ? Math.sin(G.time * 11 + ped.id * 1.7) * 4.4 : 0;
  ctx.rotate(ped.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(1, 2, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Legs.
  ctx.strokeStyle = '#2c2f36';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(0, -3.4);
  ctx.lineTo(-3 + stride, -6);
  ctx.moveTo(0, 3.4);
  ctx.lineTo(-3 - stride, 6);
  ctx.stroke();
  // Torso and head.
  ctx.fillStyle = ped.police ? '#20304a' : ped.shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 7.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(2.4, 0, 4.7, 0, Math.PI * 2);
  ctx.fill();
  if (ped.police) {
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(0.4, -4.6, 4.4, 9.2);
  }
  if (ped.hostile) {
    ctx.strokeStyle = '#22262c';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(5, 3);
    ctx.lineTo(14, 3.6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayer(ctx, G) {
  const p = G.player;
  if (!p || p.inCar) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  const stride = p.moving ? Math.sin(p.walkPhase) * 4.6 : 0;
  ctx.rotate(p.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(1, 2, 11.5, 8.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#26303c';
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(0, -3.6);
  ctx.lineTo(-3 + stride, -6.4);
  ctx.moveTo(0, 3.6);
  ctx.lineTo(-3 - stride, 6.4);
  ctx.stroke();
  ctx.fillStyle = COLORS.player;
  ctx.beginPath();
  ctx.arc(0, 0, 8.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8a5a3b';
  ctx.beginPath();
  ctx.arc(2.6, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  // Mara's dark braid, swinging behind her.
  ctx.strokeStyle = '#1f150e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-1, 0);
  ctx.lineTo(-8 - Math.abs(stride) * 0.4, Math.sin(p.walkPhase * 0.5) * 2);
  ctx.stroke();
  if (p.hasGun) {
    ctx.strokeStyle = '#22262c';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(6, 3.4);
    ctx.lineTo(16, 3.8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticles(ctx, G) {
  for (const pt of G.particles) {
    const a = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
}

function drawObjectiveMarker(ctx, G) {
  const o = G.objective;
  if (!o || G.screen !== 'play') return;
  const bounce = Math.sin(G.time * 4) * 4;
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.fillStyle = 'rgba(255,215,106,0.16)';
  ctx.fillRect(-2.4, -150, 4.8, 150);
  ctx.fillStyle = '#ffd76a';
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a5b12';
  ctx.beginPath();
  ctx.arc(0, 0, 6.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(0, -34 + bounce);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#ffd76a';
  ctx.fillRect(-7, -7, 14, 14);
  ctx.restore();
}

function drawDayTint(ctx, G, w, h) {
  const nf = nightFactor(G.minutes);
  if (nf > 0.02) {
    ctx.fillStyle = `rgba(10,16,44,${(nf * 0.44).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }
  const hour = G.minutes / 60;
  if ((hour > 17.4 && hour < 19.6) || (hour > 5.4 && hour < 7.2)) {
    ctx.fillStyle = 'rgba(255,140,60,0.10)';
    ctx.fillRect(0, 0, w, h);
  }
  return nf;
}

function drawLampGlow(ctx, G, view, nf) {
  if (nf < 0.25) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const l of G.city.lamps) {
    if (l.x < view.x0 - 60 || l.x > view.x1 + 60 || l.y < view.y0 - 60 || l.y > view.y1 + 60) continue;
    const grad = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, 52);
    grad.addColorStop(0, 'rgba(255,214,140,0.20)');
    grad.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(l.x, l.y, 52, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function panel(ctx, x, y, w, h, alpha = 0.78) {
  ctx.fillStyle = `rgba(13,16,22,${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawMinimap(ctx, G, w, h) {
  const mw = 196;
  const mh = 147;
  const x = 14;
  const y = h - mh - 14;
  const sx = mw / WORLD.w;
  const sy = mh / WORLD.h;
  ctx.save();
  panel(ctx, x - 4, y - 4, mw + 8, mh + 8, 0.66);
  ctx.fillStyle = '#41663a';
  ctx.fillRect(x, y, mw, mh);
  ctx.fillStyle = '#dec084';
  ctx.fillRect(x + BEACH_X * sx, y, (WORLD.w - BEACH_X) * sx, mh);
  ctx.fillStyle = '#2e6f8e';
  ctx.fillRect(x + WATER_X * sx, y, (WORLD.w - WATER_X) * sx, mh);
  ctx.fillStyle = '#55803f';
  ctx.fillRect(x + PARK.x * sx, y + PARK.y * sy, PARK.w * sx, PARK.h * sy);
  ctx.strokeStyle = 'rgba(230,230,230,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const s of STREET_XS) { ctx.moveTo(x + s * sx, y); ctx.lineTo(x + s * sx, y + mh); }
  for (const a of AVENUE_YS) { ctx.moveTo(x, y + a * sy); ctx.lineTo(x + BEACH_X * sx, y + a * sy); }
  ctx.stroke();
  const dot = (wx, wy, color, r = 2.4) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + wx * sx, y + wy * sy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const buoy of G.city.buoys) if (!G.buoysFound.has(buoy.id)) dot(buoy.x, buoy.y, '#7fe3d0', 1.8);
  for (const crate of G.crates) if (!crate.taken) dot(crate.x, crate.y, '#ffa53a', 2.2);
  for (const car of G.cars) {
    if (car.mode === 'police') dot(car.x, car.y, Math.sin(G.time * 8) > 0 ? '#ff5555' : '#5599ff', 2.4);
  }
  if (G.objective) dot(G.objective.x, G.objective.y, '#ffd76a', 3.2);
  const p = G.player;
  ctx.save();
  ctx.translate(x + p.x * sx, y + p.y * sy);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(5.4, 0);
  ctx.lineTo(-3.8, -3.4);
  ctx.lineTo(-3.8, 3.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function formatClock(minutes) {
  const hh = Math.floor(minutes / 60) % 24;
  const mm = Math.floor(minutes % 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function drawHud(ctx, G, w, h) {
  const p = G.player;
  ctx.textBaseline = 'alphabetic';
  // Top-left: money, health, standing.
  panel(ctx, 14, 14, 218, 86);
  ctx.fillStyle = '#ffd76a';
  ctx.font = `700 25px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(`$${G.cash}`, 28, 46);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `600 12.5px ${FONT}`;
  const chapterLabel = G.storyDone ? 'Story complete — free roam' : `Chapter ${Math.min(G.chapter + 1, CHAPTERS.length)} of ${CHAPTERS.length}`;
  ctx.fillText(chapterLabel, 28, 66);
  ctx.fillText(`Respect ${G.respect} · Buoys ${G.buoysFound.size}/${G.city.buoys.length}`, 28, 84);
  // Health bar.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(120, 30, 96, 12);
  ctx.fillStyle = p.health > 30 ? '#69c24a' : '#e0483c';
  ctx.fillRect(120, 30, 96 * clamp(p.health / 100, 0, 1), 12);
  // Top-right: stars and clock.
  const starY = 34;
  for (let i = 0; i < 5; i += 1) {
    star(ctx, w - 34 - (4 - i) * 30, starY, 12.5, i < G.stars, G.seenT < 1.2 ? '#ffd76a' : '#f2a541');
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `600 15px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(formatClock(G.minutes), w - 22, 66);
  if (G.busted > 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(w - 172, 76, 150, 9);
    ctx.fillStyle = '#e0483c';
    ctx.fillRect(w - 172, 76, 150 * (G.busted / 100), 9);
    ctx.font = `700 10.5px ${FONT}`;
    ctx.fillText('BUSTED', w - 22, 74);
  }
  // Objective, top-centre, with the distance left to run.
  if (G.objective) {
    ctx.font = `600 16.5px ${FONT}`;
    const label = G.objective.label;
    const d = Math.round(dist(p.x, p.y, G.objective.x, G.objective.y) / 10);
    const full = `${label}  ·  ${d} m`;
    const tw = Math.max(ctx.measureText(label).width, ctx.measureText(full).width) + 30;
    panel(ctx, (w - tw) / 2, 14, tw, 44, 0.66);
    ctx.fillStyle = '#ffe9a8';
    ctx.textAlign = 'center';
    ctx.fillText(full, w / 2, 42);
  }
  if (G.mission && typeof G.mission.timer === 'number' && G.mission.stage && G.mission.stage.kind === 'race') {
    ctx.font = `800 30px ${FONT}`;
    ctx.fillStyle = G.mission.timer < 15 ? '#ff6a5e' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.max(0, Math.ceil(G.mission.timer))}`, w / 2, 96);
  }
  // Message feed under the money panel.
  ctx.font = `500 13.5px ${FONT}`;
  ctx.textAlign = 'left';
  let fy = 122;
  for (const f of G.feed) {
    ctx.fillStyle = `rgba(10,12,16,${0.55 * clamp(f.t, 0, 1)})`;
    const tw = ctx.measureText(f.text).width + 18;
    ctx.beginPath();
    ctx.roundRect(14, fy - 14, tw, 21, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,246,224,0.95)';
    ctx.fillText(f.text, 23, fy + 1);
    fy += 26;
  }
  // Bottom-right: speed and weapon.
  if (p.inCar && p.car) {
    const kmh = Math.round(Math.abs(p.car.speed) * 0.29);
    panel(ctx, w - 158, h - 74, 144, 60);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 30px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${kmh}`, w - 52, h - 32);
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('km/h', w - 22, h - 32);
    ctx.font = `500 11.5px ${FONT}`;
    ctx.fillText(p.car.spec.name, w - 22, h - 56 + 34);
  }
  if (p.hasGun) {
    ctx.font = `700 15px ${FONT}`;
    ctx.fillStyle = p.ammo > 0 ? '#ffe9a8' : '#ff6a5e';
    ctx.textAlign = 'right';
    ctx.fillText(`PISTOL · ${p.ammo}`, w - 22, h - 88);
  }
  // Controls reminder, quiet at the bottom centre.
  ctx.font = `500 12px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.textAlign = 'center';
  ctx.fillText(p.inCar
    ? 'W A S D drive · Space handbrake · H horn · E exit · P pause · M mute'
    : 'W A S D move · Shift run · E enter car · F fight · click shoot · P pause · M mute', w / 2, h - 12);
  drawMinimap(ctx, G, w, h);
}

function drawBanner(ctx, G, w, h) {
  if (!G.banner) return;
  const b = G.banner;
  ctx.font = `600 15px ${FONT}`;
  const lines = wrapText(ctx, b.lines.join(' '), Math.min(620, w - 160));
  const bh = 64 + lines.length * 21;
  const y = h * 0.16;
  panel(ctx, (w - 680) / 2, y, 680, bh, 0.82);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd76a';
  ctx.font = `800 21px ${FONT}`;
  ctx.fillText(b.title, w / 2, y + 34);
  ctx.fillStyle = 'rgba(255,246,224,0.92)';
  ctx.font = `500 14.5px ${FONT}`;
  lines.forEach((line, i) => ctx.fillText(line, w / 2, y + 60 + i * 21));
}

function drawTitle(ctx, G, w, h) {
  // A slow drift over the city behind the title.
  const cx = 1560 + Math.sin(G.time * 0.05) * 160;
  const cy = 900 + Math.cos(G.time * 0.037) * 120;
  drawWorldScene(ctx, G, w, h, cx, cy);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(8,10,18,0.62)');
  grad.addColorStop(0.55, 'rgba(8,10,18,0.38)');
  grad.addColorStop(1, 'rgba(8,10,18,0.72)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd76a';
  ctx.font = `900 76px ${FONT}`;
  ctx.fillText(GAME_TITLE, w / 2, h * 0.235);
  ctx.fillStyle = '#f5efe0';
  ctx.font = `600 19px ${FONT}`;
  ctx.fillText('Puerto Sombra — a Mara Voss story', w / 2, h * 0.235 + 36);
  ctx.font = `500 15px ${FONT}`;
  ctx.fillStyle = 'rgba(245,239,224,0.88)';
  const lines = wrapText(ctx, STORY_INTRO, Math.min(660, w - 120));
  lines.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.335 + i * 22));
  const hover = G.hoverButton || null;
  for (const btn of menuButtons(G, w, h)) {
    ctx.fillStyle = !btn.enabled ? 'rgba(30,34,44,0.75)' : hover === btn.id ? 'rgba(255,215,106,0.92)' : 'rgba(20,24,34,0.85)';
    ctx.beginPath();
    ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,106,0.55)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = !btn.enabled ? 'rgba(255,255,255,0.35)' : hover === btn.id ? '#1c1a12' : '#ffe9a8';
    ctx.font = `800 18px ${FONT}`;
    ctx.fillText(btn.label, w / 2, btn.y + 31);
  }
  ctx.font = `500 13.5px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.66)';
  ctx.fillText('Move WASD · Run Shift · Enter car E · Fight F · Shoot mouse · Pause P · Mute M', w / 2, h * 0.545 + 148);
  ctx.fillText('An original open-world crime game. Everything in Puerto Sombra is invented.', w / 2, h - 20);
}

function drawPause(ctx, G, w, h) {
  ctx.fillStyle = 'rgba(6,8,13,0.62)';
  ctx.fillRect(0, 0, w, h);
  const pw = 460;
  const ph = 300;
  const x = (w - pw) / 2;
  const y = (h - ph) / 2;
  panel(ctx, x, y, pw, ph, 0.9);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd76a';
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText('PAUSED', w / 2, y + 52);
  ctx.fillStyle = 'rgba(255,246,224,0.9)';
  ctx.font = `500 15.5px ${FONT}`;
  const p = G.player;
  const rows = [
    `Cash $${G.cash} · Respect ${G.respect}`,
    G.storyDone ? 'Story complete — free roam' : `Story: chapter ${G.chapter + 1} of ${CHAPTERS.length}`,
    `Taxi fares driven: ${G.taxiFares}`,
    `Glass buoys found: ${G.buoysFound.size} of ${G.city.buoys.length}`,
    `Shots fired ${G.stats.shots} · on target ${G.stats.hits} · cars stolen ${G.stats.carsStolen}`,
    `Health ${Math.round(p.health)}${p.hasGun ? ` · Pistol, ${p.ammo} rounds` : ''}`,
  ];
  rows.forEach((row, i) => ctx.fillText(row, w / 2, y + 96 + i * 26));
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `500 13px ${FONT}`;
  ctx.fillText('P or Esc to resume · progress saves itself as you play', w / 2, y + ph - 18);
}

function drawDown(ctx, G, w, h) {
  const kind = G.downInfo ? G.downInfo.kind : 'wasted';
  if (kind === 'busted') {
    const flash = Math.sin(G.time * 7) > 0;
    ctx.fillStyle = flash ? 'rgba(190,30,30,0.24)' : 'rgba(30,60,190,0.24)';
  } else {
    ctx.fillStyle = 'rgba(120,10,10,0.34)';
  }
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = kind === 'busted' ? '#ffd76a' : '#ff8a7a';
  ctx.font = `900 84px ${FONT}`;
  ctx.fillText(kind === 'busted' ? 'BUSTED' : 'WASTED', w / 2, h * 0.44);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `600 17px ${FONT}`;
  ctx.fillText(kind === 'busted'
    ? `The Patrulla relieves you of $${G.downFine || 0} and drops you at Hospital Santa Mar.`
    : `Santa Mar patches you up. The bill: $${G.downFine || 0}.`, w / 2, h * 0.44 + 42);
}

/** The world from a camera point, without HUD. Shared by play and title. */
function drawWorldScene(ctx, G, w, h, cx, cy) {
  const view = {
    x0: cx - w / 2 - 80, y0: cy - h / 2 - 80,
    x1: cx + w / 2 + 80, y1: cy + h / 2 + 80,
  };
  ctx.save();
  ctx.translate(w / 2 - cx, h / 2 - cy);
  drawGround(ctx, G, view);
  drawRoads(ctx);
  drawProps(ctx, G, view);
  drawBuildings(ctx, G, view);
  drawPickupsAndCrates(ctx, G);
  for (const car of G.cars) drawCar(ctx, car, G);
  for (const ped of G.peds) drawPed(ctx, ped, G);
  drawPlayer(ctx, G);
  drawParticles(ctx, G);
  drawObjectiveMarker(ctx, G);
  ctx.restore();
  const nf = drawDayTint(ctx, G, w, h);
  // Lamplight and headlights belong on top of the tint.
  ctx.save();
  ctx.translate(w / 2 - cx, h / 2 - cy);
  drawLampGlow(ctx, G, view, nf);
  ctx.restore();
}

export function drawFrame(ctx, G, w, h) {
  ctx.fillStyle = '#20261e';
  ctx.fillRect(0, 0, w, h);
  if (G.screen === 'title') {
    drawTitle(ctx, G, w, h);
    return;
  }
  const cx = G.cam.x + (G.cam.sx || 0);
  const cy = G.cam.y + (G.cam.sy || 0);
  const clx = clamp(cx, w / 2 - 240, WORLD.w - w / 2 + 240);
  const cly = clamp(cy, h / 2 - 240, WORLD.h - h / 2 + 240);
  drawWorldScene(ctx, G, w, h, clx, cly);
  drawHud(ctx, G, w, h);
  drawBanner(ctx, G, w, h);
  if (G.screen === 'pause') drawPause(ctx, G, w, h);
  if (G.screen === 'down') drawDown(ctx, G, w, h);
}

export { placePoint };
