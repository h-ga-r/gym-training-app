const TIMER_STORAGE_KEY = "gymTrainingApp.intervalTimer";
const TIMER_RETURN_STORAGE_KEY = "gymTrainingApp.workoutTimerReturn";
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

function readWorkoutTimerReturnContext() {
  try {
    const context = JSON.parse(localStorage.getItem(TIMER_RETURN_STORAGE_KEY));
    const hasValidTimerStart =
      context?.timerStartedAt === null || Number.isFinite(context?.timerStartedAt);

    if (
      typeof context?.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(context.date) &&
      typeof context.exerciseId === "string" &&
      context.exerciseId.length > 0 &&
      Number.isFinite(context.createdAt) &&
      hasValidTimerStart
    ) {
      return context;
    }
  } catch {
    // 壊れた復帰情報は使用しない。
  }

  localStorage.removeItem(TIMER_RETURN_STORAGE_KEY);
  return null;
}

function prepareWorkoutRestTimer({ date, exerciseId }) {
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    typeof exerciseId !== "string" ||
    exerciseId.length === 0
  ) {
    localStorage.removeItem(TIMER_RETURN_STORAGE_KEY);
    return false;
  }

  localStorage.setItem(
    TIMER_RETURN_STORAGE_KEY,
    JSON.stringify({
      date,
      exerciseId,
      createdAt: Date.now(),
      timerStartedAt: null,
    }),
  );
  return true;
}

function attachWorkoutReturnContextToTimer(startedAt) {
  const context = readWorkoutTimerReturnContext();

  if (!context) {
    return;
  }

  context.timerStartedAt = startedAt;
  localStorage.setItem(TIMER_RETURN_STORAGE_KEY, JSON.stringify(context));
}

function clearWorkoutTimerReturnContext() {
  localStorage.removeItem(TIMER_RETURN_STORAGE_KEY);
}

function prepareStandaloneTimer() {
  const timerState = readTimerState();
  const context = readWorkoutTimerReturnContext();

  if (!timerState || context?.timerStartedAt !== timerState.startedAt) {
    clearWorkoutTimerReturnContext();
  }
}

function getCompletedWorkoutReturnContext() {
  const timerState = readTimerState();
  const context = readWorkoutTimerReturnContext();

  if (!timerState || context?.timerStartedAt !== timerState.startedAt) {
    return null;
  }

  return context;
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
  const state = saveTimerState(durationSeconds);
  attachWorkoutReturnContextToTimer(state.startedAt);
  updateCountdown();
  void requestWakeLock();
}

function cancelTimer() {
  localStorage.removeItem(TIMER_STORAGE_KEY);
  clearWorkoutTimerReturnContext();
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
  const returnContext = getCompletedWorkoutReturnContext();
  cancelTimer();

  queueMicrotask(() => {
    document.dispatchEvent(
      new CustomEvent("app:navigate", {
        detail: {
          screenName: "workout-log",
          source: "timer-complete",
          returnContext,
        },
      }),
    );
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
  // 見た目は style.css に集約。タイマー動作はこのまま維持する。
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

window.prepareWorkoutRestTimer = prepareWorkoutRestTimer;
window.prepareStandaloneTimer = prepareStandaloneTimer;

