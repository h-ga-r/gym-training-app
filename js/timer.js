const TIMER_STORAGE_KEY = "gymTrainingApp.intervalTimer";
const DEFAULT_PRESETS = [60, 90, 120, 180];

let timerScreen;
let timeDisplay;
let statusDisplay;
let countdownTimeoutId = null;
let wakeLock = null;
let isAlarmActive = false;

function readTimerState() {
  try {
    const state = JSON.parse(localStorage.getItem(TIMER_STORAGE_KEY));

    if (
      Number.isFinite(state?.startedAt) &&
      Number.isFinite(state?.durationSeconds) &&
      state.durationSeconds > 0
    ) {
      return state;
    }
  } catch {
    // 壊れた保存データはタイマーとして扱わない。
  }

  localStorage.removeItem(TIMER_STORAGE_KEY);
  return null;
}

function saveTimerState(durationSeconds) {
  const state = {
    startedAt: Date.now(),
    durationSeconds,
  };

  localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(state));
  return state;
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getRemainingMilliseconds(state) {
  return state.durationSeconds * 1000 - (Date.now() - state.startedAt);
}

function stopCountdownLoop() {
  if (countdownTimeoutId !== null) {
    clearTimeout(countdownTimeoutId);
    countdownTimeoutId = null;
  }
}

function renderIdle() {
  timeDisplay.textContent = "00:00";
  statusDisplay.textContent = "休憩時間を選んでください";
}

function startAlarm() {
  stopCountdownLoop();
  isAlarmActive = true;
  timeDisplay.textContent = "00:00";
  statusDisplay.textContent = "休憩終了 — 画面をタップ";
  document.body.classList.add("interval-timer-alarm");
}

function updateCountdown() {
  const state = readTimerState();

  if (!state) {
    stopCountdownLoop();
    renderIdle();
    return;
  }

  const remainingMilliseconds = getRemainingMilliseconds(state);

  if (remainingMilliseconds <= 0) {
    startAlarm();
    return;
  }

  isAlarmActive = false;
  document.body.classList.remove("interval-timer-alarm");
  timeDisplay.textContent = formatTime(Math.ceil(remainingMilliseconds / 1000));
  statusDisplay.textContent = "休憩中";

  stopCountdownLoop();
  countdownTimeoutId = window.setTimeout(
    updateCountdown,
    Math.min(250, remainingMilliseconds),
  );
}

function unlockAudioPlayback() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;

  if (!AudioContext) {
    return;
  }

  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    gain.gain.value = 0;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.01);
    oscillator.addEventListener("ended", () => context.close());
    void context.resume();
  } catch {
    // 音声機能の非対応・拒否はタイマー動作を妨げない。
  }
}

async function requestWakeLock() {
  if (
    wakeLock ||
    document.visibilityState !== "visible" ||
    timerScreen.hidden ||
    !("wakeLock" in navigator)
  ) {
    return;
  }

  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch {
    // 非対応端末や省電力設定による拒否時も通常のタイマーとして動かす。
  }
}

async function releaseWakeLock() {
  if (!wakeLock) {
    return;
  }

  const currentWakeLock = wakeLock;
  wakeLock = null;

  try {
    await currentWakeLock.release();
  } catch {
    // すでにブラウザ側で解放されている場合は何もしない。
  }
}

function syncWakeLock() {
  if (document.visibilityState === "visible" && !timerScreen.hidden) {
    void requestWakeLock();
  } else {
    void releaseWakeLock();
  }
}

function startTimer(durationSeconds) {
  unlockAudioPlayback();
  saveTimerState(durationSeconds);
  updateCountdown();
  void requestWakeLock();
}

function cancelTimer() {
  localStorage.removeItem(TIMER_STORAGE_KEY);
  stopCountdownLoop();
  isAlarmActive = false;
  document.body.classList.remove("interval-timer-alarm");
  renderIdle();
}

function acknowledgeAlarm(event) {
  if (!isAlarmActive) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  cancelTimer();

  queueMicrotask(() => {
    document.querySelector('[data-screen-target="workout-log"]')?.click();
  });
}

function createTimerInterface() {
  timerScreen.replaceChildren();
  timerScreen.classList.add("interval-timer");

  const heading = document.createElement("h1");
  heading.textContent = "インターバルタイマー";

  timeDisplay = document.createElement("output");
  timeDisplay.className = "interval-timer__time";
  timeDisplay.setAttribute("aria-live", "off");

  statusDisplay = document.createElement("p");
  statusDisplay.className = "interval-timer__status";
  statusDisplay.setAttribute("role", "status");

  const presets = document.createElement("div");
  presets.className = "interval-timer__presets";
  presets.setAttribute("aria-label", "休憩時間プリセット");

  DEFAULT_PRESETS.forEach((defaultSeconds) => {
    let seconds = defaultSeconds;
    const row = document.createElement("div");
    row.className = "interval-timer__preset";

    const decreaseButton = document.createElement("button");
    decreaseButton.type = "button";
    decreaseButton.textContent = "-10秒";
    decreaseButton.setAttribute("aria-label", `${defaultSeconds}秒プリセットを10秒減らす`);

    const startButton = document.createElement("button");
    startButton.type = "button";
    startButton.className = "interval-timer__start";

    const updatePresetLabel = () => {
      startButton.textContent = `${seconds}秒で開始`;
    };

    decreaseButton.addEventListener("click", () => {
      seconds = Math.max(10, seconds - 10);
      updatePresetLabel();
    });

    const increaseButton = document.createElement("button");
    increaseButton.type = "button";
    increaseButton.textContent = "+10秒";
    increaseButton.setAttribute("aria-label", `${defaultSeconds}秒プリセットを10秒増やす`);
    increaseButton.addEventListener("click", () => {
      seconds += 10;
      updatePresetLabel();
    });

    startButton.addEventListener("click", () => startTimer(seconds));
    updatePresetLabel();
    row.append(decreaseButton, startButton, increaseButton);
    presets.append(row);
  });

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "interval-timer__cancel";
  cancelButton.textContent = "タイマーをキャンセル";
  cancelButton.addEventListener("click", cancelTimer);

  timerScreen.append(heading, timeDisplay, statusDisplay, presets, cancelButton);
}

function installTimerStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .interval-timer {
      box-sizing: border-box;
      max-width: 36rem;
      margin: 0 auto;
      padding: 1.25rem;
      text-align: center;
    }
    .interval-timer__time {
      display: block;
      margin: 1rem 0 .25rem;
      font: 700 clamp(4rem, 22vw, 8rem)/1 ui-monospace, monospace;
      font-variant-numeric: tabular-nums;
    }
    .interval-timer__status {
      min-height: 1.5em;
      margin-bottom: 1.5rem;
    }
    .interval-timer__presets {
      display: grid;
      gap: .75rem;
    }
    .interval-timer__preset {
      display: grid;
      grid-template-columns: 1fr 1.5fr 1fr;
      gap: .5rem;
    }
    .interval-timer button {
      min-height: 3rem;
      padding: .6rem;
      font: inherit;
      touch-action: manipulation;
    }
    .interval-timer__start {
      font-weight: 700;
    }
    .interval-timer__cancel {
      width: 100%;
      margin-top: 1.25rem;
    }
    @keyframes interval-timer-flash {
      0%, 49% { background: #111; color: #fff; }
      50%, 100% { background: #fff; color: #111; }
    }
    body.interval-timer-alarm {
      animation: interval-timer-flash .8s steps(1, end) infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      body.interval-timer-alarm {
        animation-duration: 1.6s;
      }
    }
  `;
  document.head.append(style);
}

function initializeTimer() {
  timerScreen = document.querySelector("#timer-screen");

  if (!timerScreen) {
    return;
  }

  installTimerStyles();
  createTimerInterface();

  document.addEventListener("click", acknowledgeAlarm, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      updateCountdown();
    }
    syncWakeLock();
  });

  new MutationObserver(syncWakeLock).observe(timerScreen, {
    attributes: true,
    attributeFilter: ["hidden"],
  });

  updateCountdown();
  syncWakeLock();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeTimer, { once: true });
} else {
  initializeTimer();
}

