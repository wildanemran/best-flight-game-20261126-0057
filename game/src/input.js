// Keyboard and mouse input. Held keys give steering; one-shot presses (start, pause,
// camera, flaps, gear, restart) are queued as bit flags and taken once by the loop, so a
// press between two frames is never lost and never counted twice.
//
// Signs: pitch() +1 pulls the nose up (S or mouse down), roll() +1 banks right (D or
// mouse right), yaw() +1 turns right (E). The mouse fallback only steers while the cursor
// actually moves over the canvas, so a headless screenshot run leaves pitch and roll at 0.

export function createInput(canvas) {
  const pressedKeys = new Set();
  let pendingActions = 0;
  let throttleValue = 0.7;
  let smoothPitch = 0;
  let smoothRoll = 0;
  let smoothYaw = 0;
  let lockAxisX = 0;
  let lockAxisY = 0;
  let hoverAxisX = 0;
  let hoverAxisY = 0;
  let hoverActive = false;

  const THROTTLE_STEP = 0.45 / 60;
  const AXIS_SMOOTH = 0.22;
  const LOCK_SENSITIVITY = 0.0045;
  const LOCK_DECAY = 0.82;
  const HOVER_DEADZONE = 0.08;

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function applyDeadzone(value, deadzone) {
    const abs = Math.abs(value);
    if (abs <= deadzone) return 0;
    const sign = value < 0 ? -1 : 1;
    return sign * clamp((abs - deadzone) / (1 - deadzone), 0, 1);
  }

  function releaseAllInputs() {
    pressedKeys.clear();
    lockAxisX = 0;
    lockAxisY = 0;
    hoverAxisX = 0;
    hoverAxisY = 0;
    hoverActive = false;
  }

  function isPointerLocked() {
    return Boolean(canvas && document.pointerLockElement === canvas);
  }

  function requestCanvasPointerLock() {
    if (!canvas || isPointerLocked() || typeof canvas.requestPointerLock !== 'function') return;
    try {
      const lockPromise = canvas.requestPointerLock();
      if (lockPromise && typeof lockPromise.catch === 'function') {
        lockPromise.catch(function ignoreLockRejection() {});
      }
    } catch (_) {
      // The plain mouse fallback still works when pointer lock is refused.
    }
  }

  function handleKeyDown(event) {
    const code = event.code || '';
    if (code === 'Space' || code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight') {
      event.preventDefault();
    }
    if (!event.repeat) {
      if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') pendingActions |= ACTION_CONFIRM;
      else if (code === 'KeyP' || code === 'Escape') pendingActions |= ACTION_PAUSE;
      else if (code === 'KeyC') pendingActions |= ACTION_CAMERA;
      else if (code === 'KeyF') pendingActions |= ACTION_FLAPS;
      else if (code === 'KeyG') pendingActions |= ACTION_GEAR;
      else if (code === 'KeyR') pendingActions |= ACTION_RESTART;
    }
    pressedKeys.add(code);
  }

  function handleKeyUp(event) {
    pressedKeys.delete(event.code || '');
  }

  function handlePointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    pendingActions |= ACTION_CONFIRM;
    requestCanvasPointerLock();
  }

  function handlePointerMove(event) {
    if (isPointerLocked()) {
      const dx = Number(event.movementX) || 0;
      const dy = Number(event.movementY) || 0;
      lockAxisX = clamp(lockAxisX + dx * LOCK_SENSITIVITY, -1, 1);
      lockAxisY = clamp(lockAxisY + dy * LOCK_SENSITIVITY, -1, 1);
      return;
    }
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const normX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const normY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    hoverAxisX = applyDeadzone(clamp(normX, -1, 1), HOVER_DEADZONE);
    hoverAxisY = applyDeadzone(clamp(normY, -1, 1), HOVER_DEADZONE);
    hoverActive = true;
  }

  function handlePointerLeave() {
    if (!isPointerLocked()) {
      hoverAxisX = 0;
      hoverAxisY = 0;
      hoverActive = false;
    }
  }

  function handlePointerLockChange() {
    lockAxisX = 0;
    lockAxisY = 0;
    if (isPointerLocked()) {
      hoverAxisX = 0;
      hoverAxisY = 0;
      hoverActive = false;
    }
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', releaseAllInputs);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAllInputs();
  });
  document.addEventListener('pointerlockchange', handlePointerLockChange);
  if (canvas) {
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', handlePointerLeave);
  }

  function readKeyPitch() {
    let value = 0;
    if (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown')) value += 1;
    if (pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp')) value -= 1;
    return value;
  }

  function readKeyRoll() {
    let value = 0;
    if (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight')) value += 1;
    if (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft')) value -= 1;
    return value;
  }

  function readKeyYaw() {
    let value = 0;
    if (pressedKeys.has('KeyE')) value += 1;
    if (pressedKeys.has('KeyQ')) value -= 1;
    return value;
  }

  function pitch() {
    const keyTarget = readKeyPitch();
    const mouseTarget = isPointerLocked() ? lockAxisY : hoverActive ? hoverAxisY * 0.75 : 0;
    const target = clamp(keyTarget + mouseTarget, -1, 1);
    smoothPitch += (target - smoothPitch) * AXIS_SMOOTH;
    lockAxisY *= LOCK_DECAY;
    if (Math.abs(smoothPitch) < 0.001) smoothPitch = 0;
    return clamp(smoothPitch, -1, 1);
  }

  function roll() {
    const keyTarget = readKeyRoll();
    const mouseTarget = isPointerLocked() ? lockAxisX : hoverActive ? hoverAxisX * 0.85 : 0;
    const target = clamp(keyTarget + mouseTarget, -1, 1);
    smoothRoll += (target - smoothRoll) * AXIS_SMOOTH;
    lockAxisX *= LOCK_DECAY;
    if (Math.abs(smoothRoll) < 0.001) smoothRoll = 0;
    return clamp(smoothRoll, -1, 1);
  }

  function yaw() {
    const target = readKeyYaw();
    smoothYaw += (target - smoothYaw) * AXIS_SMOOTH;
    if (Math.abs(smoothYaw) < 0.001) smoothYaw = 0;
    return clamp(smoothYaw, -1, 1);
  }

  function throttle() {
    const up = pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight');
    const down = pressedKeys.has('ControlLeft') || pressedKeys.has('ControlRight');
    if (up && !down) throttleValue = clamp(throttleValue + THROTTLE_STEP, 0, 1);
    else if (down && !up) throttleValue = clamp(throttleValue - THROTTLE_STEP, 0, 1);
    return throttleValue;
  }

  function takeActions() {
    const actions = pendingActions;
    pendingActions = 0;
    return actions;
  }

  return { pitch, roll, yaw, throttle, takeActions };
}

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CAMERA = 4;
export const ACTION_FLAPS = 8;
export const ACTION_GEAR = 16;
export const ACTION_RESTART = 32;
