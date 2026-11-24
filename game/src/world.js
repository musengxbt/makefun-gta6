// world.js — Puerto Sombra itself: generated once from a fixed seed, so the
// city is identical on every visit. Streets and avenues cross on a grid;
// between them sit named buildings, a park with a pond, the docks, and the
// long beach that runs down the east side to the sea. This module also owns
// collision (circles against building rectangles) and the road graph the
// traffic drives on.

import {
  AVENUE_YS, BEACH_X, COLORS, PARK, PLACES, ROAD_HALF, STREET_XS, WATER_X, WORLD,
} from './config.js';
import { clamp, makeRng } from './random.js';

const BUILDING_NAMES = [
  'Hotel Brisa', 'Edificio Coral', 'Torre Miramar', 'Apartamentos Luna', 'Oficinas Ferrer',
  'Mercado Central', 'Teatro Ondina', 'Biblioteca Mar', 'Hotel Dos Palmas', 'Edificio Farola',
  'Clínica del Sol', 'Escuela Náutica', 'Apartamentos Bruma', 'Torre Alisios', 'Hotel Gaviota',
  'Oficinas Quintana', 'Mercado del Puerto', 'Edificio Sirena', 'Residencial Altamar', 'Hotel Caracola',
  'Depósito Herrera', 'Edificio Vela', 'Apartamentos Rocío', 'Torre Espuma', 'Oficinas Marengo',
  'Hotel Tramontana', 'Edificio Perla', 'Residencial Brisa Alta', 'Almacén Ferrer', 'Torre Calima',
];

const ROOF_COLORS = [COLORS.roofA, COLORS.roofB, COLORS.roofC, COLORS.roofD];

/** The point on the map a PLACES entry names. */
export function placePoint(key) {
  const p = PLACES[key];
  return { x: STREET_XS[p.sx] + p.dx, y: AVENUE_YS[p.ay] + p.dy, name: p.name };
}

function rectsOverlap(a, b, pad) {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
}

export function buildCity() {
  const rng = makeRng(20261124);
  const buildings = [];
  const reserved = [];

  // Special places first: each gets a named building and an entrance point
  // on the pavement in front of it. Generated buildings must keep clear.
  const places = {};
  for (const key of Object.keys(PLACES)) {
    const pt = placePoint(key);
    const bw = 128;
    const bh = 92;
    const b = {
      x: pt.x - bw / 2, y: pt.y - bh / 2, w: bw, h: bh,
      name: PLACES[key].name, color: rng.pick(ROOF_COLORS), place: key, floors: rng.int(2, 6),
    };
    buildings.push(b);
    reserved.push(b);
    places[key] = { ...pt, building: b };
  }

  // Ordinary buildings fill the blocks between roads. The park's blocks are
  // left green, and the beach strip stays empty.
  let nameIdx = 0;
  for (let i = 0; i < STREET_XS.length - 1; i += 1) {
    for (let j = 0; j < AVENUE_YS.length - 1; j += 1) {
      const inPark = i >= 1 && i <= 2 && j >= 1 && j <= 2;
      if (inPark) continue;
      const x0 = STREET_XS[i] + ROAD_HALF + 16;
      const x1 = STREET_XS[i + 1] - ROAD_HALF - 16;
      const y0 = AVENUE_YS[j] + ROAD_HALF + 16;
      const y1 = AVENUE_YS[j + 1] - ROAD_HALF - 16;
      const bw = x1 - x0;
      const bh = y1 - y0;
      const layout = rng.int(1, 3);
      const cells = layout === 1
        ? [{ x: x0 + bw * 0.14, y: y0 + bh * 0.14, w: bw * 0.72, h: bh * 0.72 }]
        : layout === 2
          ? [
            { x: x0, y: y0, w: bw * 0.44, h: bh },
            { x: x0 + bw * 0.56, y: y0, w: bw * 0.44, h: bh },
          ]
          : [
            { x: x0, y: y0, w: bw, h: bh * 0.44 },
            { x: x0, y: y0 + bh * 0.56, w: bw * 0.46, h: bh * 0.44 },
            { x: x0 + bw * 0.54, y: y0 + bh * 0.56, w: bw * 0.46, h: bh * 0.44 },
          ];
      for (const cell of cells) {
        const b = {
          x: cell.x + rng.range(0, 8), y: cell.y + rng.range(0, 8),
          w: cell.w - rng.range(0, 10), h: cell.h - rng.range(0, 10),
          name: BUILDING_NAMES[nameIdx % BUILDING_NAMES.length],
          color: rng.pick(ROOF_COLORS), place: null, floors: rng.int(1, 9),
        };
        nameIdx += 1;
        if (reserved.some((r) => rectsOverlap(b, r, 10))) continue;
        if (b.x + b.w > BEACH_X - 30) continue;
        buildings.push(b);
      }
    }
  }

  // Trees: thick in the park, a loose line along the beach boardwalk, and a
  // few shading the pavements elsewhere.
  const trees = [];
  for (let k = 0; k < 46; k += 1) {
    trees.push({ x: PARK.x + rng.range(24, PARK.w - 24), y: PARK.y + rng.range(24, PARK.h - 24), r: rng.range(11, 19) });
  }
  for (let k = 0; k < 14; k += 1) {
    trees.push({ x: BEACH_X - rng.range(6, 26), y: rng.range(60, WORLD.h - 60), r: rng.range(10, 15) });
  }
  for (let k = 0; k < 22; k += 1) {
    const sx = rng.pick(STREET_XS);
    const ay = rng.pick(AVENUE_YS);
    trees.push({ x: sx + rng.sign() * (ROAD_HALF + 14), y: ay + rng.range(-160, 160), r: rng.range(9, 14) });
  }

  // Street lamps at every intersection corner — they read as light pools at
  // night and as street furniture by day.
  const lamps = [];
  for (const sx of STREET_XS) {
    for (const ay of AVENUE_YS) {
      lamps.push({ x: sx - ROAD_HALF - 6, y: ay - ROAD_HALF - 6 });
      lamps.push({ x: sx + ROAD_HALF + 6, y: ay + ROAD_HALF + 6 });
    }
  }

  // Glass buoys: the collectibles. Scattered where a walk is pleasant —
  // the park, the sand, the docks, the plaza by the bank.
  const buoys = [];
  const buoySpots = [
    [PARK.x + 90, PARK.y + 110], [PARK.x + PARK.w - 110, PARK.y + 150], [PARK.x + 300, PARK.y + PARK.h - 120],
    [BEACH_X + 90, 420], [BEACH_X + 150, 1180], [BEACH_X + 80, 1900],
    [places.docks.x + 60, places.docks.y + 90], [places.docks.x - 90, places.docks.y - 40],
    [places.bank.x + 120, places.bank.y + 110], [places.cafe.x - 110, places.cafe.y - 60],
    [places.hideout.x - 40, places.hideout.y + 120], [places.boathouse.x - 130, places.boathouse.y + 30],
  ];
  buoySpots.forEach(([x, y], idx) => buoys.push({ id: idx, x, y }));

  // Parked cars line the kerbs: (street, offset along it, side of the road).
  const parkedSpawns = [];
  const parkedTypes = ['callejero', 'callejero', 'marlin', 'burro', 'taxi', 'moto', 'callejero', 'burro'];
  for (let k = 0; k < 30; k += 1) {
    const vertical = rng.chance(0.55);
    if (vertical) {
      const sx = rng.pick(STREET_XS);
      parkedSpawns.push({
        x: sx + rng.sign() * (ROAD_HALF - 13),
        y: rng.range(80, WORLD.h - 80),
        angle: Math.PI / 2,
        type: rng.pick(parkedTypes),
      });
    } else {
      const ay = rng.pick(AVENUE_YS);
      parkedSpawns.push({
        x: rng.range(80, BEACH_X - 120),
        y: ay + rng.sign() * (ROAD_HALF - 13),
        angle: 0,
        type: rng.pick(parkedTypes),
      });
    }
  }

  return { buildings, trees, lamps, places, buoys, parkedSpawns };
}

/** Is this point on asphalt? (Streets run the full height; avenues stop at the sand.) */
export function onRoad(x, y) {
  if (STREET_XS.some((sx) => Math.abs(x - sx) <= ROAD_HALF)) return y >= 0 && y <= WORLD.h;
  if (x < BEACH_X && AVENUE_YS.some((ay) => Math.abs(y - ay) <= ROAD_HALF)) return true;
  return false;
}

/** What is under this point: 'road', 'sand', 'water' or 'land'. */
export function surfaceAt(x, y) {
  if (x >= WATER_X) return 'water';
  if (x >= BEACH_X) return 'sand';
  return onRoad(x, y) ? 'road' : 'land';
}

/** Push a circle out of every building it overlaps. Returns true on any hit. */
export function collideCircle(city, pos, radius) {
  let hit = false;
  pos.x = clamp(pos.x, radius, WORLD.w - radius);
  pos.y = clamp(pos.y, radius, WORLD.h - radius);
  for (const b of city.buildings) {
    const nx = clamp(pos.x, b.x, b.x + b.w);
    const ny = clamp(pos.y, b.y, b.y + b.h);
    const dx = pos.x - nx;
    const dy = pos.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * radius;
      pos.y = ny + (dy / d) * radius;
    } else {
      // Centre inside the rect: leave by the shortest side.
      const left = pos.x - b.x;
      const right = b.x + b.w - pos.x;
      const top = pos.y - b.y;
      const bottom = b.y + b.h - pos.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) pos.x = b.x - radius;
      else if (m === right) pos.x = b.x + b.w + radius;
      else if (m === top) pos.y = b.y - radius;
      else pos.y = b.y + b.h + radius;
    }
  }
  return hit;
}

/** Does the segment a→b cross any building? A cheap line-of-sight test. */
export function lineBlocked(city, ax, ay, bx, by) {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 26);
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    for (const b of city.buildings) {
      if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
    }
  }
  return false;
}

/** Intersection grid helpers for traffic routing. */
export function intersection(i, j) {
  return { x: STREET_XS[i], y: AVENUE_YS[j] };
}

export function nearestIntersection(x, y) {
  let bi = 0;
  let bj = 0;
  let best = Infinity;
  for (let i = 0; i < STREET_XS.length; i += 1) {
    for (let j = 0; j < AVENUE_YS.length; j += 1) {
      const d = (STREET_XS[i] - x) ** 2 + (AVENUE_YS[j] - y) ** 2;
      if (d < best) { best = d; bi = i; bj = j; }
    }
  }
  return { i: bi, j: bj };
}
