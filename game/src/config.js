// config.js — every shared constant for Sombra Heat lives here: the shape of
// Puerto Sombra, the vehicle catalogue, the colour palette and the tuning
// numbers the rest of the game reads. Nothing in this file changes at run
// time; it is the game's rulebook.

export const GAME_TITLE = 'SOMBRA HEAT';
export const CITY_NAME = 'Puerto Sombra';
export const HERO_NAME = 'Mara Voss';
export const SAVE_KEY = 'sombra-heat-save-v1';

// The world is one big rectangle of pixels. Streets and avenues cross it on a
// regular pitch; east of BEACH_X the asphalt gives up and the sand begins.
export const WORLD = { w: 3200, h: 2400 };
export const STREET_XS = [180, 560, 940, 1320, 1700, 2080, 2460];
export const AVENUE_YS = [180, 560, 940, 1320, 1700, 2080];
export const ROAD_HALF = 46; // half the width of a road, centre line to kerb
export const LANE = 23; // lane offset from the centre line (right-hand traffic)
export const BEACH_X = 2720; // sand starts here
export const WATER_X = 3040; // the sea; nobody drives into it

// The park occupies the block bounded by streets 2..3 and avenues 1..2
// (the rectangle between those roads, kerb to kerb).
export const PARK = { x: 626, y: 626, w: 628, h: 628 };

// Player tuning.
export const PLAYER = {
  radius: 13,
  walkSpeed: 148,
  runSpeed: 252,
  maxHealth: 100,
  meleeRange: 48,
  meleeDamage: 34,
  meleeCooldown: 0.42,
  gunDamage: 26,
  gunCooldown: 0.24,
  gunRange: 470,
};

// Wanted system: heat points buy stars; stars buy police.
export const HEAT = {
  carjack: 22,
  hitPed: 30,
  hitCar: 10,
  shotFired: 13,
  meleeHit: 8,
  missionCrime: 26,
  starThresholds: [1, 30, 65, 110, 165], // heat needed for 1..5 stars
  decayPerSecond: 2.6, // only while no officer has eyes on the player
  bustedFill: 36, // per second while an officer is close and the player is slow
  bustedDrain: 30,
};

// Vehicle catalogue — invented marques of Puerto Sombra's roads.
// accel/topSpeed are pixels-based; grip shapes how fast the nose follows.
export const VEHICLE_TYPES = {
  callejero: { name: 'Callejero Hatch', w: 40, h: 21, accel: 300, topSpeed: 342, reverse: 110, grip: 6.4, health: 90, colors: ['#c94f42', '#4a7fb5', '#d9a441', '#7a9e4f', '#b8bcc2'] },
  marlin: { name: 'Marlin GT', w: 46, h: 22, accel: 432, topSpeed: 470, reverse: 130, grip: 7.4, health: 80, colors: ['#8c2f6e', '#274156', '#e0e3e6', '#b3202c'] },
  burro: { name: 'Burro Van', w: 50, h: 25, accel: 225, topSpeed: 272, reverse: 96, grip: 5.2, health: 150, colors: ['#d8d3c3', '#5d7261', '#74655a'] },
  taxi: { name: 'Sol Taxi', w: 42, h: 21, accel: 315, topSpeed: 356, reverse: 112, grip: 6.6, health: 100, colors: ['#f2b21b'] },
  patrulla: { name: 'Patrulla Cruiser', w: 44, h: 22, accel: 394, topSpeed: 432, reverse: 126, grip: 7.0, health: 135, colors: ['#20304a'] },
  moto: { name: 'Brisa Scooter', w: 30, h: 13, accel: 348, topSpeed: 386, reverse: 90, grip: 8.6, health: 55, colors: ['#3fa7a0', '#d96c33', '#888f98'] },
};

// Named places pinned near intersections (sx = street index, ay = avenue
// index, dx/dy = offset from that crossing) for missions and respawns.
export const PLACES = {
  hospital: { name: 'Hospital Santa Mar', sx: 0, ay: 0, dx: 130, dy: -130 },
  cafe: { name: 'Café Brisa', sx: 3, ay: 1, dx: 140, dy: 130 },
  garage: { name: 'Taller Ochoa', sx: 5, ay: 4, dx: -140, dy: 130 },
  docks: { name: 'Muelle Sur', sx: 1, ay: 5, dx: 140, dy: -120 },
  bank: { name: 'Banco del Litoral', sx: 3, ay: 3, dx: -140, dy: -130 },
  gunStore: { name: 'Armería del Muelle', sx: 1, ay: 3, dx: 140, dy: 130 },
  hideout: { name: 'Refugio de Mara', sx: 6, ay: 0, dx: -130, dy: 130 },
  boathouse: { name: 'Embarcadero', sx: 6, ay: 5, dx: 200, dy: -110 },
};

// Palette for the city at midday; the day cycle tints over the top of it.
export const COLORS = {
  grass: '#5d8a4a',
  parkGrass: '#6da356',
  pond: '#3f7d99',
  sand: '#dec084',
  water: '#2e6f8e',
  waterDeep: '#256480',
  road: '#3c3f45',
  roadLine: '#c8b45a',
  kerb: '#9aa0a3',
  sidewalk: '#b5b0a4',
  plaza: '#c2b299',
  boardwalk: '#a9805a',
  roofA: '#a8574a',
  roofB: '#7d6a58',
  roofC: '#5f7386',
  roofD: '#8a7f5c',
  player: '#e8b23a',
  pedSkin: ['#c98d64', '#8a5a3b', '#e0ac82', '#6e4530'],
  pedShirt: ['#b5493a', '#3a6ea5', '#4f9e57', '#d9d3c3', '#7a4f9e', '#d97b29', '#3fa7a0'],
};

// How long a game day lasts, and when a fresh run begins.
export const DAY_LENGTH_SECONDS = 480; // eight real minutes, dawn to dawn
export const START_MINUTES = 8 * 60 + 12; // 08:12, morning light
