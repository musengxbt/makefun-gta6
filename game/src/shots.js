// shots.js — the screenshot scenes behind ?shot=chase|foot|drive|start.
// Each scene builds the real game state (the same city, cars, police and
// HUD a player would see) and poses it: a four-star chase on the avenue, a
// delivery on foot by the park, a drive across town, and the title screen.
// Nothing is drawn here that the game itself would not draw.

import { AVENUE_YS, STREET_XS } from './config.js';
import { makeCar, makePed } from './entities.js';
import { placePoint } from './world.js';

function putPlayerInCar(G, type, x, y, angle, speed) {
  const car = makeCar(type, x, y, angle, 'player');
  car.speed = speed;
  G.cars.push(car);
  G.player.inCar = true;
  G.player.car = car;
  G.player.x = x;
  G.player.y = y;
  G.player.angle = angle;
  return car;
}

function addTraffic(G, type, x, y, angle, speed) {
  const car = makeCar(type, x, y, angle, 'traffic');
  car.speed = speed;
  G.cars.push(car);
  return car;
}

function addPolice(G, x, y, angle, speed) {
  const car = makeCar('patrulla', x, y, angle, 'police');
  car.speed = speed;
  car.sirenPhase = Math.random() * 6;
  G.cars.push(car);
  return car;
}

function stageChase(G) {
  const y = AVENUE_YS[2];
  G.minutes = 17 * 60 + 38; // golden hour
  G.cash = 2140;
  G.chapter = 3;
  putPlayerInCar(G, 'marlin', 1760, y + 23, 0, 318);
  addPolice(G, 1628, y - 20, 0.06, 306);
  addPolice(G, 1586, y + 30, -0.05, 312);
  addPolice(G, 1470, y - 2, 0.02, 298);
  addTraffic(G, 'callejero', 2050, y - 23, 0, 120);
  addTraffic(G, 'burro', 2260, y + 23, 0, 96);
  addTraffic(G, 'taxi', 1330, y - 23, 0, 140);
  G.heat = 128;
  G.stars = 4;
  G.busted = 32;
  G.seenT = 0;
  const hideout = placePoint('hideout');
  G.objective = { x: hideout.x, y: hideout.y, label: 'Reach the Refugio de Mara' };
  G.feed = [{ text: 'The Patrulla is right behind you — lose them!', t: 60 }];
  G.cam.x = 1760;
  G.cam.y = y;
}

function stageFoot(G) {
  G.minutes = 10 * 60 + 24;
  G.cash = 640;
  G.chapter = 0;
  const p = G.player;
  p.x = 918;
  p.y = 1292;
  p.angle = -0.5;
  p.hasGun = true;
  p.ammo = 18;
  G.peds.push(makePed(872, 1246));
  G.peds.push(makePed(986, 1330));
  G.peds.push(makePed(846, 1352));
  const cafe = placePoint('cafe');
  G.objective = { x: cafe.x, y: cafe.y, label: 'Deliver the package to Café Brisa' };
  G.feed = [{ text: 'Package in hand. Lolo is waiting at Café Brisa.', t: 60 }];
  G.cam.x = p.x;
  G.cam.y = p.y;
}

function stageDrive(G) {
  const y = AVENUE_YS[4];
  G.minutes = 12 * 60 + 20;
  G.cash = 1250;
  G.chapter = 1;
  const ride = putPlayerInCar(G, 'callejero', 1180, y + 23, 0, 262);
  ride.color = '#c94f42'; // Mara's red hatch, unmistakable in the frame
  addTraffic(G, 'taxi', 1420, y - 23, 0, 150);
  addTraffic(G, 'burro', 830, y + 23, 0, 88);
  addTraffic(G, 'moto', 1520, y + 23, 0, 210);
  const garage = placePoint('garage');
  G.objective = { x: garage.x, y: garage.y, label: 'Deliver the Marlin to Taller Ochoa' };
  G.feed = [{ text: '"Not a scratch," Ochoa said. Keep it that way.', t: 60 }];
  G.cam.x = 1180;
  G.cam.y = y;
  void STREET_XS;
}

/** Pose the game for the named scene. Returns nothing; G holds the stage. */
export function stageShot(game, name) {
  const { G } = game;
  game.titleWorld();
  if (name === 'chase') stageChase(G);
  else if (name === 'foot') stageFoot(G);
  else if (name === 'drive') stageDrive(G);
  else {
    G.screen = 'title';
    return;
  }
  G.screen = 'play';
}
