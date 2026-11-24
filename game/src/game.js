// game.js — the engine of Sombra Heat. It owns the whole run state (the
// object every module calls G), walks Mara Voss through Puerto Sombra on
// foot and behind wheels, runs the wanted system and the Patrulla's answer
// to it, walks the story chapters stage by stage, and keeps the city
// populated. Drawing lives in render.js; this file only decides what is
// true.

import {
  AVENUE_YS, DAY_LENGTH_SECONDS, HEAT, PLAYER, START_MINUTES, STREET_XS,
} from './config.js';
import { angleDelta, clamp, dist, rnd } from './random.js';
import { buildCity, collideCircle, lineBlocked, placePoint, surfaceAt } from './world.js';
import { makeCar, makePed, startRoute, stepCar, updatePed, updatePoliceCar, updateTrafficCar } from './entities.js';
import { CHAPTERS, STORY_INTRO, makeTaxiFare } from './missions.js';
import { loadSave, writeSave } from './save.js';

const GIVER_POINTS = ['cafe', 'garage', 'docks', 'hideout', 'garage', 'cafe'];
const TRAFFIC_TARGET = 14;
const PED_TARGET = 42;

function pointInBuilding(city, x, y, pad = 0) {
  for (const b of city.buildings) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return true;
  }
  return false;
}

export function createGame() {
  const city = buildCity();
  const G = {
    city,
    screen: 'title', // title | play | pause | down
    time: 0,
    minutes: START_MINUTES,
    cash: 150,
    respect: 0,
    chapter: 0,
    storyDone: false,
    player: null,
    cars: [],
    peds: [],
    particles: [],
    pickups: [],
    crates: [],
    heat: 0,
    stars: 0,
    busted: 0,
    seenT: 99,
    mission: null,
    taxi: null,
    taxiCooldown: 0,
    buoysFound: new Set(),
    taxiFares: 0,
    feed: [],
    banner: null,
    threat: { x: 0, y: 0, t: 0 },
    downInfo: null,
    downT: 0,
    shake: 0,
    cam: { x: 0, y: 0 },
    objective: null,
    stats: { shots: 0, hits: 0, carsStolen: 0, pedsDown: 0 },
    audio: null, // wired by main.js
    input: null,
  };

  G.onHonk = (car) => {
    if (dist(car.x, car.y, G.player.x, G.player.y) < 420 && G.audio) G.audio.click();
  };
  G.onTrafficCrash = () => {};

  function say(text, secs = 6) {
    G.feed.push({ text, t: secs });
    if (G.feed.length > 5) G.feed.shift();
  }

  function banner(title, lines, secs = 6.5) {
    G.banner = { title, lines: Array.isArray(lines) ? lines : [lines], t: secs };
  }

  function addHeat(amount) {
    G.heat = clamp(G.heat + amount, 0, 240);
  }

  function computeStars() {
    let s = 0;
    for (const th of HEAT.starThresholds) if (G.heat >= th) s += 1;
    return s;
  }

  // ---------------------------------------------------------- population
  function spawnParked() {
    for (const s of city.parkedSpawns) {
      const car = makeCar(s.type, s.x, s.y, s.angle, 'parked');
      G.cars.push(car);
    }
  }

  function spawnTrafficCar(near) {
    const sx = rnd.pick(STREET_XS);
    const ay = rnd.pick(AVENUE_YS);
    let x = sx;
    let y = ay;
    if (near) {
      // Respawn traffic a few blocks from the player, never on top of her.
      for (let tries = 0; tries < 8; tries += 1) {
        x = clamp(G.player.x + rnd.range(-900, 900), 60, 3140);
        y = clamp(G.player.y + rnd.range(-900, 900), 60, 2340);
        const snap = nearestRoadPoint(x, y);
        x = snap.x; y = snap.y;
        if (dist(x, y, G.player.x, G.player.y) > 380) break;
      }
    }
    const type = rnd.pick(['callejero', 'callejero', 'marlin', 'burro', 'taxi', 'moto']);
    const car = makeCar(type, x, y, rnd.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), 'traffic');
    startRoute(car);
    G.cars.push(car);
  }

  function nearestRoadPoint(x, y) {
    let bx = x;
    let by = y;
    let best = Infinity;
    for (const sx of STREET_XS) {
      const d = Math.abs(sx - x);
      if (d < best) { best = d; bx = sx; by = y; }
    }
    for (const ay of AVENUE_YS) {
      const d = Math.abs(ay - y);
      if (d < best) { best = d; bx = x; by = ay; }
    }
    return { x: bx, y: by };
  }

  function spawnPed(x, y, opts) {
    for (let tries = 0; tries < 10; tries += 1) {
      const px = x ?? clamp(G.player.x + rnd.range(-800, 800), 30, 3170);
      const py = y ?? clamp(G.player.y + rnd.range(-800, 800), 30, 2370);
      if (!pointInBuilding(city, px, py, 4) && surfaceAt(px, py) !== 'water') {
        const ped = makePed(px, py, opts);
        G.peds.push(ped);
        return ped;
      }
    }
    return null;
  }

  function populate() {
    spawnParked();
    for (let i = 0; i < TRAFFIC_TARGET; i += 1) spawnTrafficCar(false);
    for (let i = 0; i < PED_TARGET; i += 1) {
      const x = rnd.range(120, 3000);
      const y = rnd.range(120, 2280);
      if (!pointInBuilding(city, x, y, 4)) G.peds.push(makePed(x, y));
    }
    // The gun on the Armería counter, and a health pack by the hospital.
    const gun = placePoint('gunStore');
    G.pickups.push({ kind: 'gun', x: gun.x, y: gun.y + 66, t: 0, ready: true });
    const hosp = placePoint('hospital');
    G.pickups.push({ kind: 'health', x: hosp.x, y: hosp.y + 66, t: 0, ready: true });
  }

  // ---------------------------------------------------------- run setup
  function freshPlayer(x, y) {
    return {
      x, y, angle: -Math.PI / 2, radius: PLAYER.radius,
      health: PLAYER.maxHealth, hasGun: false, ammo: 0,
      inCar: false, car: null, meleeCd: 0, gunCd: 0, walkPhase: 0, moving: false,
    };
  }

  function resetWorld() {
    G.cars = [];
    G.peds = [];
    G.particles = [];
    G.pickups = [];
    G.crates = [];
    G.mission = null;
    G.taxi = null;
    G.heat = 0;
    G.stars = 0;
    G.busted = 0;
    G.feed = [];
    G.banner = null;
    populate();
  }

  function newGame() {
    const home = placePoint('hideout');
    // Mara starts on the asphalt in front of the Refugio, not in its doorway.
    G.player = freshPlayer(home.x + 96, home.y + 24);
    G.cash = 150;
    G.respect = 0;
    G.chapter = 0;
    G.storyDone = false;
    G.buoysFound = new Set();
    G.taxiFares = 0;
    G.minutes = START_MINUTES;
    resetWorld();
    G.screen = 'play';
    banner(GAME_TITLE_BANNER, STORY_INTRO);
    say('Meet your contacts to take jobs. First: Lolo at Café Brisa.');
    snapCamera();
  }

  const GAME_TITLE_BANNER = 'SOMBRA HEAT';

  function continueGame() {
    const data = loadSave();
    if (!data) { newGame(); return; }
    G.player = freshPlayer(data.x, data.y);
    const pos = { x: G.player.x, y: G.player.y };
    collideCircle(city, pos, PLAYER.radius);
    G.player.x = pos.x;
    G.player.y = pos.y;
    G.player.health = clamp(data.health, 20, PLAYER.maxHealth);
    G.player.hasGun = !!data.hasGun;
    G.player.ammo = data.ammo | 0;
    G.cash = data.cash;
    G.respect = data.respect | 0;
    G.chapter = clamp(data.chapter | 0, 0, CHAPTERS.length);
    G.storyDone = G.chapter >= CHAPTERS.length;
    G.buoysFound = new Set(Array.isArray(data.buoys) ? data.buoys : []);
    G.taxiFares = data.taxiFares | 0;
    G.minutes = typeof data.minutes === 'number' ? data.minutes : START_MINUTES;
    resetWorld();
    G.screen = 'play';
    say('Welcome back to Puerto Sombra, Mara.');
    snapCamera();
  }

  function snapCamera() {
    G.cam.x = G.player.x;
    G.cam.y = G.player.y;
  }

  // ---------------------------------------------------------- missions
  function currentGiverPoint() {
    if (G.storyDone || G.chapter >= CHAPTERS.length) return null;
    return placePoint(GIVER_POINTS[G.chapter]);
  }

  function startChapter() {
    const def = CHAPTERS[G.chapter];
    G.mission = { def, stageIdx: 0, stage: null, timer: null, raceIdx: 0, collected: 0, carId: null, failed: false };
    banner(def.title, def.intro);
    if (G.audio) G.audio.levelup();
    setupStage();
  }

  function setupStage() {
    const m = G.mission;
    const stage = m.def.stages[m.stageIdx];
    m.stage = stage;
    m.timer = typeof stage.time === 'number' ? stage.time : null;
    m.raceIdx = 0;
    m.collected = 0;
    G.crates = [];
    if (stage.kind === 'steal') {
      const car = makeCar(stage.carType || 'marlin', stage.x, stage.y, 0, 'parked');
      car.missionCar = true;
      G.cars.push(car);
      m.carId = car.id;
    }
    if (stage.kind === 'collect') {
      for (const pt of stage.points) G.crates.push({ x: pt.x, y: pt.y, taken: false });
      if (stage.guards) {
        for (const pt of stage.points) {
          spawnPed(pt.x + rnd.range(-40, 40), pt.y + rnd.range(-40, 40), { state: 'guard', hostile: true });
        }
      }
    }
    if (stage.setHeat) {
      for (let i = 0; i < 2; i += 1) {
        spawnPed(stage.x + rnd.range(-70, 70), stage.y + rnd.range(-70, 70), { state: 'guard', hostile: true });
      }
    }
  }

  function advanceStage() {
    const m = G.mission;
    if (G.audio) G.audio.pickup();
    m.stageIdx += 1;
    if (m.stageIdx >= m.def.stages.length) completeChapter();
    else setupStage();
  }

  function completeChapter() {
    const def = G.mission.def;
    G.cash += def.reward;
    G.respect += def.respect;
    say(`Job done — +$${def.reward}. ${def.outro}`, 9);
    banner('JOB COMPLETE', [`${def.title} — $${def.reward} earned.`, def.outro], 7);
    if (G.audio) G.audio.success();
    G.mission = null;
    G.chapter += 1;
    if (G.chapter >= CHAPTERS.length) {
      G.storyDone = true;
      banner('SOMBRA HEAT', 'Mara Voss owns the tide now. The city stays open — fares, buoys and trouble remain.', 9);
    }
    writeSave(G);
  }

  function failChapter(reason) {
    say(`Job failed: ${reason}. Go back to the contact to try again.`, 8);
    if (G.audio) G.audio.fail();
    G.mission = null;
    G.crates = [];
  }

  function stageTarget() {
    const m = G.mission;
    if (!m) return null;
    const s = m.stage;
    if (s.kind === 'race') {
      const pt = s.points[m.raceIdx];
      return { x: pt.x, y: pt.y, label: `${s.label} (${m.raceIdx + 1}/${s.points.length})` };
    }
    if (s.kind === 'loseheat') return null;
    if (s.kind === 'collect') {
      let best = null;
      let bestD = Infinity;
      for (const crate of G.crates) {
        if (crate.taken) continue;
        const d = dist(G.player.x, G.player.y, crate.x, crate.y);
        if (d < bestD) { bestD = d; best = crate; }
      }
      if (best) return { x: best.x, y: best.y, label: `${s.label} (${m.collected}/${s.count})` };
      return null;
    }
    return { x: s.x, y: s.y, label: s.label };
  }

  function updateMission(dt) {
    const m = G.mission;
    if (!m) return;
    const s = m.stage;
    const p = G.player;
    if (typeof m.timer === 'number' && s.kind === 'race') {
      m.timer -= dt;
      if (m.timer <= 0) {
        failChapter('the clock ran out');
        return;
      }
    }
    const reach = (x, y, r) => dist(p.x, p.y, x, y) < r || (p.inCar && p.car && dist(p.car.x, p.car.y, x, y) < r + 14);
    switch (s.kind) {
      case 'goto': {
        if (reach(s.x, s.y, 52)) {
          if (s.pickup) {
            say(`Picked up ${s.pickup}.`);
            setThreat(s.x, s.y);
          }
          if (s.setHeat) {
            G.heat = Math.max(G.heat, s.setHeat);
            say('The Patrulla is coming. Move!');
            if (G.audio) G.audio.bustedJingle();
          }
          advanceStage();
        }
        break;
      }
      case 'steal': {
        if (p.inCar && p.car && p.car.id === m.carId) advanceStage();
        break;
      }
      case 'deliverCar': {
        const targetCar = G.cars.find((c) => c.id === m.carId);
        if (!targetCar || targetCar.mode === 'wreck') { failChapter('the car was wrecked'); break; }
        if (p.inCar && p.car && p.car.id === m.carId && reach(s.x, s.y, 58)) {
          exitCar(true);
          targetCar.mode = 'parked';
          advanceStage();
        }
        break;
      }
      case 'race': {
        const pt = s.points[m.raceIdx];
        if (reach(pt.x, pt.y, 62)) {
          m.raceIdx += 1;
          if (G.audio) G.audio.coin();
          if (m.raceIdx >= s.points.length) advanceStage();
          else say(`Checkpoint ${m.raceIdx}/${s.points.length} — ${Math.ceil(m.timer)}s left.`);
        }
        break;
      }
      case 'collect': {
        for (const crate of G.crates) {
          if (!crate.taken && dist(p.x, p.y, crate.x, crate.y) < 40) {
            crate.taken = true;
            m.collected += 1;
            if (G.audio) G.audio.pickup();
            say(`Crate ${m.collected}/${s.count} secured.`);
            addHeat(6);
          }
        }
        if (m.collected >= (s.count || 0) && G.crates.every((c) => c.taken)) advanceStage();
        break;
      }
      case 'escape': {
        if (reach(s.x, s.y, 58)) advanceStage();
        break;
      }
      case 'loseheat': {
        if (G.stars === 0) advanceStage();
        break;
      }
      default: break;
    }
  }

  // ---------------------------------------------------------- taxi
  function updateTaxi(dt) {
    G.taxiCooldown -= dt;
    const p = G.player;
    if (G.taxi) {
      const t = G.taxi;
      const inTaxi = p.inCar && p.car && p.car.type === 'taxi';
      if (!inTaxi) {
        G.taxi = null;
        say('Fare abandoned — no taxi, no fare.');
        return;
      }
      const target = t.phase === 'pickup' ? t.fare.pickup : t.fare.drop;
      if (dist(p.car.x, p.car.y, target.x, target.y) < 56 && Math.abs(p.car.speed) < 30) {
        if (t.phase === 'pickup') {
          t.phase = 'drop';
          say(`Passenger aboard: "To the drop, rápido!" Fare $${t.fare.fare}.`);
          if (G.audio) G.audio.door();
        } else {
          G.cash += t.fare.fare;
          G.taxiFares += 1;
          say(`Fare paid: +$${t.fare.fare}. (${G.taxiFares} fares driven)`);
          if (G.audio) G.audio.coin();
          G.taxi = null;
          G.taxiCooldown = 6;
          writeSave(G);
        }
      }
      return;
    }
    if (p.inCar && p.car && p.car.type === 'taxi' && !G.mission && G.taxiCooldown <= 0) {
      G.taxi = { phase: 'pickup', fare: makeTaxiFare() };
      say(`Taxi fare: pick up at the marker — $${G.taxi.fare.fare} on the meter.`);
    }
  }

  // ---------------------------------------------------------- combat & crime
  function setThreat(x, y) {
    G.threat.x = x;
    G.threat.y = y;
    G.threat.t = 2.6;
  }

  function hurtPlayer(amount) {
    const p = G.player;
    if (G.screen !== 'play') return;
    p.health -= amount;
    if (G.audio) G.audio.hurt();
    G.shake = Math.min(9, G.shake + 2.5);
    if (p.health <= 0) goDown('wasted');
  }

  function goDown(kind) {
    if (G.screen === 'down') return;
    G.screen = 'down';
    G.downInfo = { kind };
    G.downT = 3.4;
    const fine = Math.min(G.cash, Math.round(G.cash * 0.12) + 25);
    G.cash -= fine;
    if (G.audio) {
      if (kind === 'busted') G.audio.bustedJingle();
      else G.audio.wastedJingle();
      G.audio.engineStop();
      G.audio.sirenStop();
    }
    G.downFine = fine;
  }

  function respawn() {
    const hosp = placePoint('hospital');
    const p = G.player;
    if (p.inCar) exitCar(true);
    p.x = hosp.x;
    p.y = hosp.y + 84;
    p.health = PLAYER.maxHealth;
    G.heat = 0;
    G.stars = 0;
    G.busted = 0;
    G.cars = G.cars.filter((c) => c.mode !== 'police');
    G.peds = G.peds.filter((pd) => !pd.police);
    // The job survives an arrest or a hospital visit; only the moment is lost.
    G.screen = 'play';
    snapCamera();
    say(G.downInfo && G.downInfo.kind === 'busted'
      ? `Busted. The Patrulla takes $${G.downFine} and your afternoon.`
      : `Wasted. Santa Mar patches you up for $${G.downFine}.`);
    writeSave(G);
  }

  function damagePed(ped, amount, kx, ky) {
    ped.hp -= amount;
    ped.x += kx || 0;
    ped.y += ky || 0;
    if (ped.hp <= 0 && ped.state !== 'down') {
      ped.state = 'down';
      ped.downT = 0;
      G.stats.pedsDown += 1;
      if (rnd.chance(0.4)) G.pickups.push({ kind: 'cash', x: ped.x, y: ped.y, t: 0, ready: true, amount: rnd.int(8, 42) });
      if (ped.hostile && rnd.chance(0.5)) G.pickups.push({ kind: 'ammo', x: ped.x + 10, y: ped.y, t: 0, ready: true });
    } else if (ped.state !== 'down') {
      ped.state = 'flee';
      ped.fleeT = 2.2;
    }
  }

  function playerShoot(mouseWorld) {
    const p = G.player;
    if (!p.hasGun) return;
    if (p.gunCd > 0) return;
    if (p.ammo <= 0) {
      p.gunCd = 0.3;
      if (G.audio) G.audio.dryFire();
      say('Out of ammo — the Armería sells more than guns. Guards drop it, too.');
      return;
    }
    p.gunCd = PLAYER.gunCooldown;
    p.ammo -= 1;
    G.stats.shots += 1;
    const ang = Math.atan2(mouseWorld.y - p.y, mouseWorld.x - p.x);
    p.angle = ang;
    if (G.audio) G.audio.shot();
    spawnParticles(p.x + Math.cos(ang) * 20, p.y + Math.sin(ang) * 20, 3, '#ffd76a', 130, 0.09, 2);
    setThreat(p.x, p.y);
    addHeat(HEAT.shotFired);
    // Nearest ped along the line of fire.
    let bestPed = null;
    let bestT = PLAYER.gunRange;
    for (const ped of G.peds) {
      if (ped.state === 'down') continue;
      const d = dist(p.x, p.y, ped.x, ped.y);
      if (d > PLAYER.gunRange) continue;
      const da = Math.abs(angleDelta(ang, Math.atan2(ped.y - p.y, ped.x - p.x)));
      if (da < 0.06 + Math.atan2(15, Math.max(d, 1)) && d < bestT) { bestPed = ped; bestT = d; }
    }
    let bestCar = null;
    let bestCarT = PLAYER.gunRange;
    for (const car of G.cars) {
      const d = dist(p.x, p.y, car.x, car.y);
      if (d > PLAYER.gunRange) continue;
      const da = Math.abs(angleDelta(ang, Math.atan2(car.y - p.y, car.x - p.x)));
      if (da < 0.05 + Math.atan2(24, Math.max(d, 1)) && d < bestCarT) { bestCar = car; bestCarT = d; }
    }
    if (bestPed && bestT <= bestCarT) {
      if (!lineBlocked(city, p.x, p.y, bestPed.x, bestPed.y)) {
        G.stats.hits += 1;
        damagePed(bestPed, PLAYER.gunDamage, Math.cos(ang) * 7, Math.sin(ang) * 7);
        spawnParticles(bestPed.x, bestPed.y, 6, '#c94f42', 120, 0.3, 2.4);
        if (bestPed.police) addHeat(20);
      }
    } else if (bestCar) {
      bestCar.health -= PLAYER.gunDamage * 0.7;
      bestCar.hitFlash = 0.12;
      spawnParticles(bestCar.x, bestCar.y, 5, '#f2c14e', 140, 0.22, 2);
      if (bestCar.health <= 0 && bestCar.mode !== 'wreck') {
        bestCar.mode = 'wreck';
        bestCar.speed = 0;
        spawnParticles(bestCar.x, bestCar.y, 22, '#e07b39', 190, 0.6, 3.4);
        if (G.audio) G.audio.crash(true);
      }
    }
  }

  function playerMelee() {
    const p = G.player;
    if (p.meleeCd > 0) return;
    p.meleeCd = PLAYER.meleeCooldown;
    if (G.audio) G.audio.punch();
    let hitAny = false;
    for (const ped of G.peds) {
      if (ped.state === 'down') continue;
      if (dist(p.x, p.y, ped.x, ped.y) < PLAYER.meleeRange) {
        damagePed(ped, PLAYER.meleeDamage, Math.cos(p.angle) * 10, Math.sin(p.angle) * 10);
        spawnParticles(ped.x, ped.y, 5, '#e8e3d3', 110, 0.25, 2);
        hitAny = true;
      }
    }
    if (hitAny) {
      setThreat(p.x, p.y);
      addHeat(HEAT.meleeHit);
    }
  }

  // ---------------------------------------------------------- cars & doors
  function enterCar(car) {
    const p = G.player;
    p.inCar = true;
    p.car = car;
    const wasMode = car.mode;
    car.mode = 'player';
    if (G.audio) G.audio.door();
    if (wasMode === 'traffic') {
      G.stats.carsStolen += 1;
      setThreat(car.x, car.y);
      addHeat(HEAT.carjack);
      say(`Carjacked the ${car.spec.name}! The Patrulla noticed.`);
    } else if (wasMode === 'parked') {
      G.stats.carsStolen += 1;
      if (car.missionCar) say(`In the ${car.spec.name}. Drive it to the marker.`);
    }
    if (car.type === 'patrulla') addHeat(18);
  }

  function exitCar(silent = false) {
    const p = G.player;
    if (!p.inCar || !p.car) return;
    const car = p.car;
    const side = car.angle + Math.PI / 2;
    p.x = car.x + Math.cos(side) * 30;
    p.y = car.y + Math.sin(side) * 30;
    const pos = { x: p.x, y: p.y };
    collideCircle(city, pos, PLAYER.radius);
    p.x = pos.x;
    p.y = pos.y;
    if (car.mode === 'player') car.mode = 'parked';
    car.speed = 0;
    p.inCar = false;
    p.car = null;
    if (G.audio && !silent) G.audio.door();
    if (G.audio) G.audio.engineStop();
  }

  function nearestEnterableCar() {
    const p = G.player;
    let best = null;
    let bestD = 64;
    for (const car of G.cars) {
      if (car.mode === 'wreck') continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < bestD) { best = car; bestD = d; }
    }
    return best;
  }

  // ---------------------------------------------------------- particles
  function spawnParticles(x, y, n, color, speed, life, size) {
    for (let i = 0; i < n; i += 1) {
      const a = rnd.range(0, Math.PI * 2);
      const v = rnd.range(speed * 0.3, speed);
      G.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: rnd.range(life * 0.5, life), maxLife: life,
        color, size: rnd.range(size * 0.6, size * 1.3),
      });
    }
  }
  G.spawnParticles = spawnParticles;

  function updateParticles(dt) {
    for (const pt of G.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
    }
    G.particles = G.particles.filter((pt) => pt.life > 0);
  }

  // ---------------------------------------------------------- police
  function updatePolice(dt) {
    const p = G.player;
    G.stars = computeStars();
    const cruisers = G.cars.filter((c) => c.mode === 'police');
    const officers = G.peds.filter((pd) => pd.police && pd.state !== 'down');
    const px = p.inCar && p.car ? p.car.x : p.x;
    const py = p.inCar && p.car ? p.car.y : p.y;

    // Eyes on the player? Any officer or cruiser close with a clear line.
    let seen = false;
    for (const c of cruisers) if (dist(c.x, c.y, px, py) < 470 && !lineBlocked(city, c.x, c.y, px, py)) seen = true;
    for (const o of officers) if (dist(o.x, o.y, px, py) < 330 && !lineBlocked(city, o.x, o.y, px, py)) seen = true;
    if (seen) G.seenT = 0;
    else G.seenT += dt;

    if (G.stars > 0) {
      const wantCruisers = Math.min(2 + G.stars, 6);
      if (cruisers.length < wantCruisers) {
        const spot = nearestRoadPoint(px + rnd.range(-760, 760), py + rnd.range(-760, 760));
        if (dist(spot.x, spot.y, px, py) > 300) {
          const car = makeCar('patrulla', spot.x, spot.y, rnd.range(0, Math.PI * 2), 'police');
          G.cars.push(car);
        }
      }
      if (G.stars >= 3 && officers.length < G.stars - 1 && rnd.chance(dt * 0.5)) {
        const ped = spawnPed(px + rnd.range(-260, 260), py + rnd.range(-260, 260), { state: 'guard', hostile: true });
        if (ped) ped.police = true;
      }
      // Sirens for the ears, scaled by the nearest cruiser.
      if (G.audio) {
        let nd = Infinity;
        for (const c of cruisers) nd = Math.min(nd, dist(c.x, c.y, px, py));
        G.audio.siren(clamp(1 - nd / 700, 0, 1), dt);
      }
    } else if (G.audio) G.audio.sirenStop();

    // Heat cools only while unseen.
    if (!seen && G.heat > 0) G.heat = Math.max(0, G.heat - HEAT.decayPerSecond * dt);

    // The busted meter: close police + a slow player.
    const pSpeed = p.inCar && p.car ? Math.abs(p.car.speed) : (p.moving ? PLAYER.walkSpeed : 0);
    let closeCop = false;
    for (const c of cruisers) if (dist(c.x, c.y, px, py) < 96) closeCop = true;
    for (const o of officers) if (dist(o.x, o.y, px, py) < 74) closeCop = true;
    if (G.stars > 0 && closeCop && pSpeed < 46) G.busted = clamp(G.busted + HEAT.bustedFill * dt, 0, 100);
    else G.busted = clamp(G.busted - HEAT.bustedDrain * dt, 0, 100);
    if (G.busted >= 100) goDown('busted');

    // Hostile fire (guards and officers share the code).
    for (const ped of G.peds) {
      if (!ped.hostile || ped.state === 'down') continue;
      ped.shootCd -= dt;
      const d = dist(ped.x, ped.y, p.x, p.y);
      if (ped.shootCd <= 0 && d < 330 && !lineBlocked(city, ped.x, ped.y, p.x, p.y)) {
        ped.shootCd = rnd.range(0.9, 1.7);
        if (G.audio && d < 520) G.audio.shot();
        spawnParticles(ped.x, ped.y, 2, '#ffd76a', 120, 0.08, 2);
        const hitChance = clamp(0.62 - d / 700, 0.12, 0.6);
        if (rnd.chance(hitChance)) {
          if (p.inCar && p.car) {
            p.car.health -= 5;
            if (rnd.chance(0.4)) hurtPlayer(3);
          } else hurtPlayer(rnd.range(5, 11));
        }
      }
    }
  }

  // ---------------------------------------------------------- per-frame updates
  function updatePlayer(dt, input, mouseWorld) {
    const p = G.player;
    p.meleeCd = Math.max(0, p.meleeCd - dt);
    p.gunCd = Math.max(0, p.gunCd - dt);
    if (p.inCar && p.car) {
      const car = p.car;
      const up = input.down('KeyW') || input.down('ArrowUp');
      const downKey = input.down('KeyS') || input.down('ArrowDown');
      const left = input.down('KeyA') || input.down('ArrowLeft');
      const right = input.down('KeyD') || input.down('ArrowRight');
      const throttle = (up ? 1 : 0) - (downKey ? 1 : 0);
      const steer = (right ? 1 : 0) - (left ? 1 : 0);
      const hb = input.down('Space');
      const impact = stepCar(G, car, dt, throttle, steer, hb);
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      if (impact > 0) {
        G.shake = Math.min(10, G.shake + impact / 46);
        if (G.audio) G.audio.crash(impact > 260);
        spawnParticles(car.x, car.y, impact > 260 ? 16 : 7, '#f2c14e', 170, 0.4, 2.6);
        if (impact > 300) hurtPlayer(4);
        setThreat(car.x, car.y);
      }
      if (G.audio) G.audio.engine(clamp(Math.abs(car.speed) / car.spec.topSpeed, 0, 1), dt);
      // A handbrake turn at speed leaves rubber on the road.
      if (hb && Math.abs(car.speed) > 150 && rnd.chance(dt * 26)) {
        spawnParticles(
          car.x - Math.cos(car.angle) * 14, car.y - Math.sin(car.angle) * 14,
          2, '#26262a', 30, 0.7, 3.6,
        );
      }
      // The horn: a shout in traffic. Pedestrians turn to look.
      if (input.take('KeyH')) {
        if (G.audio) G.audio.horn();
        for (const ped of G.peds) {
          if (ped.state === 'wander' && dist(ped.x, ped.y, car.x, car.y) < 140) {
            ped.angle = Math.atan2(car.y - ped.y, car.x - ped.x);
          }
        }
      }
      // Running people down is the loudest crime there is.
      if (Math.abs(car.speed) > 60) {
        for (const ped of G.peds) {
          if (ped.state === 'down') continue;
          if (dist(car.x, car.y, ped.x, ped.y) < 21) {
            damagePed(ped, 100, Math.cos(car.angle) * 14, Math.sin(car.angle) * 14);
            addHeat(HEAT.hitPed);
            setThreat(car.x, car.y);
            car.speed *= 0.82;
            if (G.audio) G.audio.punch();
            spawnParticles(ped.x, ped.y, 8, '#c94f42', 130, 0.35, 2.6);
          }
        }
      }
      // Car-to-car contact: a shove, some damage, a noise.
      for (const other of G.cars) {
        if (other === car) continue;
        const d = dist(car.x, car.y, other.x, other.y);
        if (d < 36 && d > 0.01) {
          const push = (36 - d) / 2;
          const nx = (other.x - car.x) / d;
          const ny = (other.y - car.y) / d;
          other.x += nx * push;
          other.y += ny * push;
          car.x -= nx * push;
          car.y -= ny * push;
          if (Math.abs(car.speed) > 120) {
            other.health -= 6;
            other.hitFlash = 0.12;
            if (other.mode !== 'wreck' && other.health <= 0) { other.mode = 'wreck'; other.speed = 0; }
            car.speed *= 0.86;
            addHeat(HEAT.hitCar * 0.4);
            if (G.audio) G.audio.crash(false);
            spawnParticles((car.x + other.x) / 2, (car.y + other.y) / 2, 6, '#f2c14e', 130, 0.3, 2.2);
          }
        }
      }
      // Smoking wrecks complain.
      if (car.health < car.maxHealth * 0.45 && rnd.chance(dt * 9)) {
        spawnParticles(car.x, car.y - 6, 1, '#555a60', 26, 0.9, 4);
      }
      if (input.take('KeyE')) exitCar();
      return;
    }
    // On foot.
    if (G.audio) G.audio.engineStop();
    const axes = input.axes();
    const running = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    p.moving = axes.x !== 0 || axes.y !== 0;
    if (p.moving) {
      const len = Math.hypot(axes.x, axes.y);
      const vx = (axes.x / len) * speed;
      const vy = (axes.y / len) * speed;
      p.x += vx * dt;
      p.y += vy * dt;
      p.angle = Math.atan2(vy, vx);
      p.walkPhase += dt * (running ? 11 : 8);
      const pos = { x: p.x, y: p.y };
      collideCircle(city, pos, PLAYER.radius);
      p.x = pos.x;
      p.y = pos.y;
      if (surfaceAt(p.x, p.y) === 'water') {
        p.x -= vx * dt * 1.4;
        p.y -= vy * dt * 1.4;
      }
    } else if (mouseWorld) {
      p.angle = Math.atan2(mouseWorld.y - p.y, mouseWorld.x - p.x);
    }
    if (input.take('KeyE')) {
      const car = nearestEnterableCar();
      if (car) enterCar(car);
    }
    if (input.take('KeyF')) playerMelee();
    if (input.mouse.down && mouseWorld) playerShoot(mouseWorld);
    // Pickups are walked over.
    for (const pk of G.pickups) {
      if (!pk.ready) continue;
      if (dist(p.x, p.y, pk.x, pk.y) < 30) {
        pk.ready = false;
        pk.t = pk.kind === 'gun' ? 25 : pk.kind === 'health' ? 30 : -1;
        if (pk.kind === 'gun') {
          p.hasGun = true;
          p.ammo += 24;
          say('Picked up a pistol (+24 rounds). Mouse aims, click fires, F is fists.');
        } else if (pk.kind === 'ammo') {
          p.ammo += 18;
          say('+18 rounds.');
        } else if (pk.kind === 'health') {
          p.health = PLAYER.maxHealth;
          say('Patched up. Full health.');
        } else if (pk.kind === 'cash') {
          G.cash += pk.amount || 10;
          say(`+$${pk.amount || 10} in loose notes.`);
        }
        if (G.audio) G.audio.pickup();
      }
    }
    // Buoys are walked over too.
    for (const buoy of city.buoys) {
      if (G.buoysFound.has(buoy.id)) continue;
      if (dist(p.x, p.y, buoy.x, buoy.y) < 30) {
        G.buoysFound.add(buoy.id);
        G.cash += 25;
        say(`Glass buoy ${G.buoysFound.size}/${city.buoys.length} — +$25.`);
        if (G.audio) G.audio.coin();
        spawnParticles(buoy.x, buoy.y, 10, '#7fe3d0', 120, 0.5, 2.4);
        writeSave(G);
      }
    }
  }

  function updateWorld(dt, input, mouseWorld) {
    G.time += dt;
    G.minutes = (G.minutes + dt * (1440 / DAY_LENGTH_SECONDS)) % 1440;
    if (G.threat.t > 0) G.threat.t -= dt;
    if (G.banner && G.banner.t > 0) {
      G.banner.t -= dt;
      if (G.banner.t <= 0) G.banner = null;
    }
    for (const f of G.feed) f.t -= dt;
    G.feed = G.feed.filter((f) => f.t > 0);
    G.shake = Math.max(0, G.shake - dt * 22);

    updatePlayer(dt, input, mouseWorld);
    updateMission(dt);
    updateTaxi(dt);
    updatePolice(dt);

    for (const car of G.cars) {
      if (car.mode === 'traffic') updateTrafficCar(G, car, dt);
      else if (car.mode === 'police') updatePoliceCar(G, car, dt);
    }
    for (const ped of G.peds) updatePed(G, ped, dt);
    G.peds = G.peds.filter((pd) => !pd.remove);
    // Cull traffic that drifted far away; the city refills itself.
    const px = G.player.x;
    const py = G.player.y;
    G.cars = G.cars.filter((c) => c.mode !== 'traffic' || dist(c.x, c.y, px, py) < 1700 || c.missionCar);
    const trafficCount = G.cars.filter((c) => c.mode === 'traffic').length;
    if (trafficCount < TRAFFIC_TARGET && rnd.chance(dt * 1.4)) spawnTrafficCar(true);
    const nearPeds = G.peds.filter((pd) => dist(pd.x, pd.y, px, py) < 1000).length;
    if (nearPeds < PED_TARGET && rnd.chance(dt * 2)) spawnPed();
    // Distant guards and officers give up and melt away.
    G.peds = G.peds.filter((pd) => !(pd.hostile && dist(pd.x, pd.y, px, py) > 1300));

    for (const pk of G.pickups) {
      if (!pk.ready && pk.t > 0) {
        pk.t -= dt;
        if (pk.t <= 0) pk.ready = true;
      }
    }
    updateParticles(dt);

    // Objective: mission first, then taxi, then the next contact.
    if (G.mission) G.objective = stageTarget();
    else if (G.taxi) {
      const t = G.taxi.phase === 'pickup' ? G.taxi.fare.pickup : G.taxi.fare.drop;
      G.objective = { x: t.x, y: t.y, label: G.taxi.phase === 'pickup' ? 'Taxi: pick up your fare' : 'Taxi: drop your fare' };
    } else {
      const giver = currentGiverPoint();
      G.objective = giver ? { x: giver.x, y: giver.y, label: `Meet your contact at ${giver.name}` } : null;
      if (giver && !G.player.inCar && dist(G.player.x, G.player.y, giver.x, giver.y) < 54) startChapter();
    }

    // Camera: follow with a lean into the velocity, plus impact shake.
    const focusX = G.player.inCar && G.player.car ? G.player.car.x : G.player.x;
    const focusY = G.player.inCar && G.player.car ? G.player.car.y : G.player.y;
    const lead = G.player.inCar && G.player.car ? 0.34 : 0.12;
    const tx = focusX + (G.player.inCar && G.player.car ? Math.cos(G.player.car.angle) * G.player.car.speed * lead : 0);
    const ty = focusY + (G.player.inCar && G.player.car ? Math.sin(G.player.car.angle) * G.player.car.speed * lead : 0);
    G.cam.x += (tx - G.cam.x) * Math.min(1, dt * 5);
    G.cam.y += (ty - G.cam.y) * Math.min(1, dt * 5);
    if (G.shake > 0) {
      G.cam.sx = rnd.range(-G.shake, G.shake);
      G.cam.sy = rnd.range(-G.shake, G.shake);
    } else {
      G.cam.sx = 0;
      G.cam.sy = 0;
    }
  }

  function update(dt, input, mouseWorld) {
    if (G.screen === 'down') {
      G.downT -= dt;
      updateParticles(dt);
      if (G.downT <= 0) respawn();
      return;
    }
    if (G.screen !== 'play') return;
    updateWorld(dt, input, mouseWorld);
  }

  /** Populate the city for the title screen's backdrop (no run starts). */
  function titleWorld() {
    const spot = placePoint('cafe');
    G.player = freshPlayer(spot.x, spot.y);
    resetWorld();
    G.screen = 'title';
    snapCamera();
  }

  return {
    G,
    newGame,
    continueGame,
    titleWorld,
    update,
    say,
    // Exposed for the screenshot scenes.
    internals: {
      spawnParticles, addHeat, setThreat, banner, startChapter, placePoint,
    },
  };
}
