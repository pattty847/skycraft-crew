// Click-to-play mouse controls. In play, the first click captures the pointer; while
// captured, the mouse looks around, left (held) mines and right places (held repeats).
// Escape frees the pointer. Buttons are tracked with mouse events because Pointer
// Events miss chorded presses. If the browser refuses capture, holding right and
// dragging looks instead.
export const PLACE_REPEAT_MS = 220;

// onHint(show) reports whether to show a "click to look" hint: in play, the mouse is
// neither captured nor in the drag fallback.
export function bindDesktopInput(canvas, rig, notify = () => {}, onHint = () => {}) {
  let mining = false, placeHeld = false, placeQueued = false, nextPlaceAt = 0;
  let overviewDrag = false, dragLook = false, captureFailed = false, warned = false;
  let lastX = 0, lastY = 0, expectedUnlock = false, quietRequest = false, attempt = 0, failedAttempt = -1, refusals = 0;
  const locked = () => document.pointerLockElement === canvas;
  const release = () => { mining = false; placeHeld = false; placeQueued = false; overviewDrag = false; dragLook = false; };
  const unlock = () => {
    if (!locked()) return;
    expectedUnlock = true;
    document.exitPointerLock();
  };
  const stop = () => { release(); unlock(); };
  // A browser that has no capture, or throws, falls back to drag-look at once. A refusal
  // (the promise and the error event both report it, once per click) is often timing, such
  // as a click right after Esc released the mouse, so the fallback waits for three in a row.
  const fallBack = () => {
    captureFailed = true; onHint(false);
    if (!warned) { warned = true; notify('Mouse capture unavailable. Hold right mouse and drag to look.'); }
  };
  const failCapture = () => {
    // A capture tried without a click (closing chat with Enter) may be refused; that is not a failure.
    if (quietRequest) { quietRequest = false; return; }
    if (failedAttempt === attempt) return;
    failedAttempt = attempt;
    if (++refusals < 3) { notify('Click again to look around.'); return; }
    fallBack();
  };
  const capture = () => {
    attempt++;
    try {
      if (!canvas.requestPointerLock) fallBack();
      else canvas.requestPointerLock()?.catch?.(failCapture);
    } catch { fallBack(); }
  };

  canvas.addEventListener('mousedown', event => {
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    canvas.focus();
    lastX = event.clientX; lastY = event.clientY;
    if (rig.overview) { if (event.button === 0) overviewDrag = true; return; }
    // The click that captures the pointer only captures; it does not mine or place.
    if (!locked() && !captureFailed) { capture(); return; }
    if (event.button === 0) mining = true;
    else {
      placeHeld = true; placeQueued = true; nextPlaceAt = performance.now() + PLACE_REPEAT_MS;
      if (!locked()) dragLook = true;
    }
  });
  document.addEventListener('mousemove', event => {
    if (locked()) { rig.orbit(event.movementX, event.movementY); return; }
    if (!overviewDrag && !dragLook) return;
    rig.orbit(event.clientX - lastX, event.clientY - lastY);
    lastX = event.clientX; lastY = event.clientY;
  });
  document.addEventListener('mouseup', event => {
    if (event.button === 0) { mining = false; overviewDrag = false; }
    if (event.button === 2) { placeHeld = false; dragLook = false; }
  });
  document.addEventListener('pointerlockchange', () => {
    if (!locked()) {
      if (!expectedUnlock) release(); // Escape or external loss cancels all held input.
      expectedUnlock = false;
    } else if (rig.overview) unlock(); // A late grant after leaving play is handed back.
    onHint(!locked() && !captureFailed);
  });
  document.addEventListener('pointerlockerror', failCapture);
  document.addEventListener('pointerlockchange', () => { quietRequest = false; if (locked()) refusals = 0; });
  document.addEventListener('keydown', event => { if (event.code === 'Escape') stop(); });
  return {
    stop,
    locked,
    // Try to take the mouse back without a click; if the browser says no, the next click does it.
    recapture() {
      if (locked() || captureFailed || rig.overview || !canvas.requestPointerLock || matchMedia('(pointer:coarse)').matches) return;
      quietRequest = true;
      try { canvas.requestPointerLock()?.catch?.(() => {}); } catch { quietRequest = false; }
    },
    isMining: () => mining,
    // True once per right click, then every PLACE_REPEAT_MS while right stays held.
    takePlace(now = performance.now()) {
      if (placeQueued) { placeQueued = false; return true; }
      if (placeHeld && now >= nextPlaceAt) { nextPlaceAt = now + PLACE_REPEAT_MS; return true; }
      return false;
    },
  };
}
