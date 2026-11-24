// entities.js — the people and machines of Puerto Sombra: cars (parked,
// traffic, police, player-driven) and pedestrians (wandering, fleeing,
// guarding). Cars share one physics step; what differs is who holds the
// wheel. Traffic follows the street graph lane by lane, police drive
// straight at their quarry, and pedestrians keep to their own small lives
// until something frightens them.

import { AVENUE_YS, LANE, STREET_XS, VEHICLE_TYPES } from './config.js';
import { angleDelta, clamp, dist, rnd } from './random.js';
import { collideCircle, intersection, nearestIntersection, surfaceAt } from './world.js';

let nextId = 1;

export function makeCar(typeKey, x, y, angle, mode) {
  const spec = VEHICLE_TYPES[typeKey];
  return {
    id: nextId++,
    kind: 'car',
    type: typeKey,
    spec,
    x, y, angle,
    speed: 0,
    steer: 0,
    color: typeKey === 'patrulla' ? '#20304a' : rnd.pick(spec.colors),
    health: spec.health,
    maxHealth: spec.health,
    mode, // 'parked' | 'traffic' | 'police' | 'player' | 'wreck'
    route: null,
    brake: false,
    honkCd: rnd.range(0, 4),
    stuckTimer: 0,
    sirenPhase: Math.random() * Math.PI * 2,
    hitFlash: 0,
  };
}

/** Give a traffic car a route starting from the nearest intersection. */
export function startRoute(car) {
  const { i, j } = nearestIntersection(car.x, car.y);
  car.route = { i, j, ni: i, nj: j };
  pickNextLeg(car, true);
}

function pickNextLeg(car, first = false) {
  const r = car.route;
  r.i = r.ni;
  r.j = r.nj;
  const options = [];
  if (r.i > 0) options.push([r.i - 1, r.j]);
  if (r.i < STREET_XS.length - 1) options.push([r.i + 1, r.j]);
  if (r.j > 0) options.push([r.i, r.j - 1]);
  if (r.j < AVENUE_YS.length - 1) options.push([r.i, r.j + 1]);
  // Prefer going straight on; turns are the exception, U-turns rare.
  const straight = options.filter(([a, b]) => (a - r.i) === Math.round(Math.cos(car.angle)) && (b - r.j) === Math.round(Math.sin(car.angle)));
  let choice;
  if (!first && straight.length && rnd.chance(0.62)) choice = straight[0];
  else choice = rnd.pick(options);
  r.ni = choice[0];
  r.nj = choice[1];
}

/** The point on the road a traffic car is steering for, lane offset included. */
function legTarget(car) {
  const r = car.route;
  const node = intersection(r.ni, r.nj);
  const dx = Math.sign(r.ni - r.i);
  const dy = Math.sign(r.nj - r.j);
  if (dx > 0) return { x: node.x, y: AVENUE_YS[r.j] + LANE };
  if (dx < 0) return { x: node.x, y: AVENUE_YS[r.j] - LANE };
  if (dy > 0) return { x: STREET_XS[r.i] - LANE, y: node.y };
  return { x: STREET_XS[r.i] + LANE, y: node.y };
}

/**
 * One physics step for any car. throttle -1..1, steer -1..1, handbrake
 * trades grip for rotation. Buildings push the car out and cost it speed
 * and health; the caller hears about hard hits through the return value.
 */
export function stepCar(G, car, dt, throttle, steer, handbrake) {
  const spec = car.spec;
  const surface = surfaceAt(car.x, car.y);
  const topSpeed = spec.topSpeed * (surface === 'sand' ? 0.55 : 1);
  if (throttle > 0) car.speed += spec.accel * throttle * dt * (surface === 'sand' ? 0.6 : 1);
  else if (throttle < 0) {
    if (car.speed > 4) car.speed -= spec.accel * 1.35 * dt; // braking
    else car.speed = Math.max(-spec.reverse, car.speed + spec.accel * 0.6 * throttle * dt);
  }
  const drag = handbrake ? 2.6 : 0.55;
  car.speed -= car.speed * drag * dt * (throttle !== 0 && !handbrake ? 0.35 : 1);
  if (!handbrake) car.speed = clamp(car.speed, -spec.reverse, topSpeed);
  else car.speed = clamp(car.speed, -spec.reverse, spec.topSpeed);
  const grip = spec.grip * (surface === 'sand' ? 0.6 : 1) * (handbrake ? 1.7 : 1);
  if (Math.abs(car.speed) > 2) {
    car.angle += steer * grip * dt * clamp(car.speed / 190, -1, 1) * (car.speed < 0 ? -1 : 1);
  }
  car.steer = steer;
  const before = Math.abs(car.speed);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (surfaceAt(car.x, car.y) === 'water') {
    car.x -= Math.cos(car.angle) * car.speed * dt;
    car.y -= Math.sin(car.angle) * car.speed * dt;
    car.speed = 0;
  }
  const pos = { x: car.x, y: car.y };
  const hit = collideCircle(G.city, pos, 16);
  car.x = pos.x;
  car.y = pos.y;
  let impact = 0;
  if (hit && before > 130) {
    impact = before;
    car.speed *= 0.32;
    car.health -= (before - 120) * 0.09;
    if (car.health <= 0 && car.mode !== 'wreck') {
      car.health = 0;
      car.mode = 'wreck';
      car.speed = 0;
    }
  } else if (hit) {
    car.speed *= 0.7;
  }
  if (car.hitFlash > 0) car.hitFlash -= dt;
  return impact;
}

/** Is something solid just ahead of this car? Used for traffic braking. */
function blockedAhead(G, car, gap) {
  const fx = car.x + Math.cos(car.angle) * gap;
  const fy = car.y + Math.sin(car.angle) * gap;
  for (const other of G.cars) {
    if (other === car || other.mode === 'wreck') continue;
    if (dist(fx, fy, other.x, other.y) < 30) return true;
  }
  const p = G.player;
  if (!p.inCar && dist(fx, fy, p.x, p.y) < 26) return true;
  if (p.car && p.car !== car && dist(fx, fy, p.car.x, p.car.y) < 32) return true;
  return false;
}

export function updateTrafficCar(G, car, dt) {
  if (!car.route) startRoute(car);
  const target = legTarget(car);
  const d = dist(car.x, car.y, target.x, target.y);
  if (d < 46) pickNextLeg(car);
  const want = Math.atan2(target.y - car.y, target.x - car.x);
  const delta = angleDelta(car.angle, want);
  const steer = clamp(delta * 2.4, -1, 1);
  let throttle = Math.abs(delta) > 1.25 ? 0.25 : 0.78;
  car.brake = false;
  if (blockedAhead(G, car, 58) || blockedAhead(G, car, 34)) {
    throttle = -0.9;
    car.brake = true;
    car.honkCd -= dt;
    if (car.honkCd <= 0 && G.onHonk) {
      G.onHonk(car);
      car.honkCd = rnd.range(2.5, 6);
    }
  }
  const impact = stepCar(G, car, dt, throttle, steer, false);
  if (impact > 200 && G.onTrafficCrash) G.onTrafficCrash(car, impact);
  // A traffic car that wedges itself against a building gives up and
  // re-routes from wherever it ended up.
  if (Math.abs(car.speed) < 6 && throttle > 0.4) {
    car.stuckTimer += dt;
    if (car.stuckTimer > 2.4) {
      car.stuckTimer = 0;
      startRoute(car);
    }
  } else car.stuckTimer = 0;
}

export function updatePoliceCar(G, car, dt) {
  const p = G.player;
  const tx = p.inCar && p.car ? p.car.x : p.x;
  const ty = p.inCar && p.car ? p.car.y : p.y;
  const want = Math.atan2(ty - car.y, tx - car.x);
  const delta = angleDelta(car.angle, want);
  const steer = clamp(delta * 2.8, -1, 1);
  const d = dist(car.x, car.y, tx, ty);
  let throttle = 1;
  if (d < 54) throttle = 0.15; // sit on the quarry, feed the busted meter
  if (Math.abs(delta) > 2.5 && d > 120) throttle = -0.7; // turn around
  car.brake = throttle < 0;
  stepCar(G, car, dt, throttle, steer, false);
  car.sirenPhase += dt * 9;
}

export function makePed(x, y, opts = {}) {
  return {
    id: nextId++,
    kind: 'ped',
    x, y,
    angle: rnd.range(0, Math.PI * 2),
    speed: 0,
    hp: 60,
    state: opts.state || 'wander', // wander | flee | guard | stand | down
    tx: x, ty: y,
    repath: rnd.range(0, 2),
    fleeT: 0,
    skin: rnd.pick(['#c98d64', '#8a5a3b', '#e0ac82', '#6e4530']),
    shirt: rnd.pick(['#b5493a', '#3a6ea5', '#4f9e57', '#d9d3c3', '#7a4f9e', '#d97b29', '#3fa7a0']),
    hostile: !!opts.hostile,
    shootCd: rnd.range(0.4, 1.2),
    downT: 0,
    remove: false,
    name: opts.name || null,
  };
}

export function updatePed(G, ped, dt) {
  if (ped.state === 'down') {
    ped.downT += dt;
    if (ped.downT > 7) ped.remove = true;
    return;
  }
  let wantSpeed = 0;
  if (ped.state === 'wander' || ped.state === 'stand') {
    ped.repath -= dt;
    const d = dist(ped.x, ped.y, ped.tx, ped.ty);
    if (ped.repath <= 0 || d < 12) {
      ped.repath = rnd.range(2, 5.5);
      if (ped.state === 'wander') {
        ped.tx = clamp(ped.x + rnd.range(-280, 280), 30, 3170);
        ped.ty = clamp(ped.y + rnd.range(-280, 280), 30, 2370);
      }
    }
    if (d >= 12) {
      ped.angle = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
      wantSpeed = 58;
    }
    // Something frightening nearby sends everyone running.
    if (G.threat && G.threat.t > 0 && dist(ped.x, ped.y, G.threat.x, G.threat.y) < 190) {
      ped.state = 'flee';
      ped.fleeT = rnd.range(1.6, 3);
    }
  } else if (ped.state === 'flee') {
    ped.fleeT -= dt;
    const sx = G.threat ? G.threat.x : ped.x;
    const sy = G.threat ? G.threat.y : ped.y;
    ped.angle = Math.atan2(ped.y - sy, ped.x - sx) + rnd.range(-0.2, 0.2);
    wantSpeed = 196;
    if (ped.fleeT <= 0) ped.state = 'wander';
  } else if (ped.state === 'guard') {
    const p = G.player;
    const d = dist(ped.x, ped.y, p.x, p.y);
    ped.angle = Math.atan2(p.y - ped.y, p.x - ped.x);
    if (d > 210) {
      ped.angle = Math.atan2(p.y - ped.y, p.x - ped.x);
      wantSpeed = 118;
    } else if (d < 130) {
      ped.angle = Math.atan2(ped.y - ped.y, p.x - ped.x) + Math.PI / 2;
      wantSpeed = 66; // circle-strafe at range
    }
  }
  ped.speed = wantSpeed;
  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  const pos = { x: ped.x, y: ped.y };
  collideCircle(G.city, pos, 11);
  ped.x = pos.x;
  ped.y = pos.y;
}
