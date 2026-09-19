const screens = document.querySelectorAll("[data-screen]");
const screenButtons = document.querySelectorAll("[data-screen-target]");

function showScreen(screenName, { source = "navigation", returnContext = null } = {}) {
  if (screenName === "timer" && source === "navigation") {
    window.prepareStandaloneTimer?.();
  }

  screens.forEach((screen) => {
    screen.hidden = screen.id !== `${screenName}-screen`;
  });

  if (
    screenName === "timer" &&
    !document.querySelector("#timer-screen")?.classList.contains("interval-timer")
  ) {
    window.initializeTimer?.();
  }

  if (screenName === "workout-log") {
    if (source === "timer-complete") {
      window.resumeWorkoutAfterRest?.(returnContext);
    } else {
      window.initializeWorkoutLog?.();
    }
  }
}

screenButtons.forEach((button) => {
  button.addEventListener("click", () => {
    showScreen(button.dataset.screenTarget, { source: "navigation" });
  });
});

document.addEventListener("app:navigate", (event) => {
  const { screenName, source, returnContext } = event.detail ?? {};

  if (typeof screenName === "string") {
    showScreen(screenName, { source, returnContext });
  }
});
