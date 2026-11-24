// input.js — keyboard and mouse state for the whole game. Held keys are read
// as a set; one-shot presses are latched into a set the game drains each
// frame, so a tap between frames is never lost and never fires twice. The
// mouse position is tracked in canvas pixels and converted by the game,
// which owns the camera.

const HELD_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Space',
]);

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  window.addEventListener('keydown', (event) => {
    if (HELD_CODES.has(event.code) || event.code === 'Space') event.preventDefault();
    if (!event.repeat) pressed.add(event.code);
    held.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends its keyup.
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    mouse.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  });
  canvas.addEventListener('pointerdown', (event) => {
    mouse.down = true;
    mouse.clicked = true;
    canvas.setPointerCapture?.(event.pointerId);
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });
  // The context menu would eat the right mouse button and a frame with it.
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    mouse,
    down: (code) => held.has(code),
    /** True once per physical press; drains the latch. */
    take: (code) => {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    /** Movement axes from WASD or the arrow keys: x right, y down, each -1..1. */
    axes() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
    /** Drain the click latch (menus read this once per frame). */
    takeClick() {
      const was = mouse.clicked;
      mouse.clicked = false;
      return was;
    },
  };
}
