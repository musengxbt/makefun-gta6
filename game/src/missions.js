// missions.js — the story of Sombra Heat as data: six chapters for Mara
// Voss, fixer and wheelman of Puerto Sombra, each a short list of stages the
// game engine walks through. A stage names where to go and what happens
// there; the engine (game.js) owns timers, markers, guards and pay-outs.
// The taxi side-job generator lives here too.

import { AVENUE_YS, STREET_XS } from './config.js';
import { placePoint } from './world.js';

function at(key, dx = 0, dy = 0) {
  const p = placePoint(key);
  return { x: p.x + dx, y: p.y + dy, name: p.name };
}

// Stage kinds the engine understands:
//   goto        reach the marker
//   steal       get into the marked car (spawned for the stage)
//   deliverCar  drive the current car to the marker
//   race        hit every point before the clock runs out
//   collect     gather `count` crates at the listed points
//   escape      reach the marker while wanted
//   loseheat    stay clean until the stars are gone
export const CHAPTERS = [
  {
    title: 'Chapter 1 — First Run',
    giver: 'Lolo, of Café Brisa',
    intro: 'A package is waiting at Muelle Sur and Lolo wants it before the ice in his rum melts. Simple work. It is never simple work.',
    reward: 350, respect: 10,
    stages: [
      { kind: 'goto', label: 'Pick up the package at Muelle Sur', ...at('docks'), pickup: 'a waterproof package' },
      { kind: 'goto', label: 'Deliver the package to Café Brisa', ...at('cafe'), crime: 0 },
    ],
    outro: 'Lolo counts nothing, asks nothing. "You drive like the tide," he says. "It always comes back."',
  },
  {
    title: 'Chapter 2 — Borrowed Marlin',
    giver: 'Ochoa, of Taller Ochoa',
    intro: 'A Marlin GT sits outside Hotel Gaviota, keys in, owner asleep. Ochoa has a buyer and no scruples. Bring him the car, whole.',
    reward: 600, respect: 14,
    stages: [
      { kind: 'steal', label: 'Steal the Marlin GT by Hotel Gaviota', x: 1840, y: 990, carType: 'marlin' },
      { kind: 'deliverCar', label: 'Deliver the Marlin to Taller Ochoa', ...at('garage') },
    ],
    outro: 'Ochoa walks around the car twice, whistling. "Not a scratch worth mentioning." The money is real.',
  },
  {
    title: 'Chapter 3 — Against the Clock',
    giver: 'The Ferrer cousins',
    intro: 'Five drops, one tank of fuel, and the Ferrers timing every second with a stopwatch older than Mara. Beat the clock across Puerto Sombra.',
    reward: 800, respect: 16,
    stages: [
      {
        kind: 'race', label: 'Hit every checkpoint before the clock runs out', time: 110,
        points: [
          { x: STREET_XS[0], y: AVENUE_YS[2] }, { x: STREET_XS[3], y: AVENUE_YS[0] },
          { x: STREET_XS[6], y: AVENUE_YS[2] }, { x: STREET_XS[4], y: AVENUE_YS[5] },
          { x: STREET_XS[1], y: AVENUE_YS[4] },
        ],
      },
    ],
    outro: 'The stopwatch clicks. A cousin shrugs like the result offends him personally, then pays in full.',
  },
  {
    title: 'Chapter 4 — Heat Wave',
    giver: 'A voice on a borrowed phone',
    intro: 'The Banco del Litoral keeps a certain ledger in a back room. Take it, and the whole Patrulla will come to watch you leave. Lose them, then reach the Refugio.',
    reward: 1000, respect: 20,
    stages: [
      { kind: 'goto', label: 'Take the ledger from Banco del Litoral', ...at('bank'), pickup: 'the Litoral ledger', setHeat: 115 },
      { kind: 'escape', label: 'Reach the Refugio de Mara', ...at('hideout') },
      { kind: 'loseheat', label: 'Lose the Patrulla — stay out of sight' },
    ],
    outro: 'The phone rings once. "The tide takes everything," the voice says, "except what it is paid to keep."',
  },
  {
    title: 'Chapter 5 — Heavy Lifting',
    giver: 'Ochoa, of Taller Ochoa',
    intro: 'Three crates fell off three different manifests: one at the docks, one in the park, one behind the Mercado. Some are watched. Bring all three to the Taller.',
    reward: 1400, respect: 22,
    stages: [
      {
        kind: 'collect', label: 'Collect the three lost crates', count: 3, guards: true,
        points: [
          { ...at('docks', -70, 60) }, { x: 940, y: 940 }, { x: 1480, y: 620 },
        ],
      },
      { kind: 'goto', label: 'Bring the crates to Taller Ochoa', ...at('garage') },
    ],
    outro: 'Ochoa pries a lid, looks in, closes it gently — the way you close the eyes of the dead. "We never met," he says, paying.',
  },
  {
    title: 'Chapter 6 — The Big Tide',
    giver: 'Lolo, the voice, and Ochoa — together',
    intro: 'One last score: the Banco del Litoral moves its vault cash tonight, and every friend Mara has made is holding a door. Take the cash, cross the city, and reach the boat at the Embarcadero. Then lose the heat, and Puerto Sombra is hers.',
    reward: 3000, respect: 40,
    stages: [
      { kind: 'goto', label: 'Take the vault cash at Banco del Litoral', ...at('bank'), pickup: 'the vault cash', setHeat: 170 },
      { kind: 'escape', label: 'Reach the boat at the Embarcadero', ...at('boathouse') },
      { kind: 'loseheat', label: 'Lose the Patrulla — stay out of sight' },
    ],
    outro: 'The boat noses into the dark water and Puerto Sombra shrinks to a string of lights. Mara Voss smiles. THE END — the city stays open: taxi fares, buoys and trouble remain.',
  },
];

export const STORY_INTRO = 'Mara Voss came home to Puerto Sombra with a fast pair of hands, an empty wallet and a phone full of people who owe her favours. Six jobs stand between her and the tide money. Drive well.';

/** A taxi fare: a pickup somewhere on the grid and a drop somewhere else. */
export function makeTaxiFare() {
  const sx = () => STREET_XS[Math.floor(Math.random() * STREET_XS.length)];
  const ay = () => AVENUE_YS[Math.floor(Math.random() * AVENUE_YS.length)];
  const pickup = { x: sx(), y: ay() };
  let drop = { x: sx(), y: ay() };
  if (Math.hypot(drop.x - pickup.x, drop.y - pickup.y) < 700) drop = { x: STREET_XS[6], y: AVENUE_YS[5] };
  const fare = Math.round(Math.hypot(drop.x - pickup.x, drop.y - pickup.y) / 14);
  return { pickup, drop, fare };
}
