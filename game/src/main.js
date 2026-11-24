// main.js — boot and the frame loop for Sombra Heat. It wires the canvas,
// input and audio into the game, runs the title/pause menu logic, converts
// the mouse into world coordinates for aiming, and paints every frame.
// With ?shot=chase|foot|drive|start it stages that scene instead, paints it
// twice and sets window.__shotReady for the screenshot harness.

import { WORLD } from './config.js';
import { clamp } from './random.js';
import { createGame } from './game.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { drawFrame, menuButtons } from './render.js';
import { hasSave } from './save.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const ctx = canvas.getContext('2d');

let viewW = window.innerWidth;
let viewH = window.innerHeight;
let dpr = 1;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  canvas.style.width = `${viewW}px`;
  canvas.style.height = `${viewH}px`;
}
window.addEventListener('resize', resize);
resize();

const game = createGame();
const { G } = game;
// A handle for the screenshot harness and headless play tests.
window.__game = game;
const input = createInput(canvas);
const audio = createAudio();
G.input = input;
G.audio = audio;
G.hasSave = hasSave();
G.muted = false;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

/** The camera centre the renderer will use, clamp included — for aiming. */
function cameraCentre() {
  const cx = clamp(G.cam.x + (G.cam.sx || 0), viewW / 2 - 240, WORLD.w - viewW / 2 + 240);
  const cy = clamp(G.cam.y + (G.cam.sy || 0), viewH / 2 - 240, WORLD.h - viewH / 2 + 240);
  return { x: cx, y: cy };
}

function mouseWorld() {
  const c = cameraCentre();
  return {
    x: input.mouse.x / dpr - viewW / 2 + c.x,
    y: input.mouse.y / dpr - viewH / 2 + c.y,
  };
}

function paint() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawFrame(ctx, G, viewW, viewH);
}

if (shot) {
  stageShot(game, shot);
  let painted = 0;
  const paintShot = () => {
    paint();
    painted += 1;
    if (painted < 3) requestAnimationFrame(paintShot);
    else window.__shotReady = true;
  };
  requestAnimationFrame(paintShot);
} else {
  game.titleWorld();
  let menuIndex = G.hasSave ? 1 : 0;
  let last = performance.now();

  function announce(text) {
    if (status) status.textContent = text;
  }

  function startRun(continued) {
    audio.unlock();
    audio.click();
    if (continued) game.continueGame();
    else game.newGame();
    G.hasSave = true;
    announce(continued ? 'Continuing in Puerto Sombra.' : 'A new run in Puerto Sombra.');
  }

  function handleTitle() {
    const buttons = menuButtons(G, viewW, viewH);
    // Mouse hover and clicks.
    const mx = input.mouse.x / dpr;
    const my = input.mouse.y / dpr;
    G.hoverButton = null;
    for (const btn of buttons) {
      if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
        G.hoverButton = btn.id;
        if (input.takeClick() && btn.enabled) {
          startRun(btn.id === 'continue');
          return;
        }
      }
    }
    if (input.take('ArrowDown') || input.take('KeyS')) menuIndex = Math.min(buttons.length - 1, menuIndex + 1);
    if (input.take('ArrowUp') || input.take('KeyW')) menuIndex = Math.max(0, menuIndex - 1);
    G.hoverButton = buttons[menuIndex] ? buttons[menuIndex].id : null;
    if (input.take('Enter') || input.take('Space')) {
      const btn = buttons[menuIndex];
      if (btn && btn.enabled) startRun(btn.id === 'continue');
      else if (btn && btn.id === 'continue') startRun(false);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (input.take('KeyM')) {
      G.muted = audio.toggleMute();
      if (G.screen === 'play') game.say(G.muted ? 'Sound off.' : 'Sound on.');
    }
    if (G.screen === 'title') {
      G.time += dt;
      handleTitle();
    } else if (G.screen === 'pause') {
      if (input.take('KeyP') || input.take('Escape') || input.take('Enter')) {
        G.screen = 'play';
        announce('Playing.');
      }
    } else {
      if (input.take('KeyP') || input.take('Escape')) {
        if (G.screen === 'play') {
          G.screen = 'pause';
          announce('Paused.');
        }
      } else if (input.take('KeyX') && G.taxi) {
        G.taxi = null;
        game.say('Fare cancelled.');
      }
      game.update(dt, input, mouseWorld());
    }
    paint();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.screen === 'play') G.screen = 'pause';
  });

  announce('Sombra Heat. Choose New Game or Continue.');
  requestAnimationFrame(frame);
}
