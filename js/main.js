const screens = document.querySelectorAll("[data-screen]");
const screenButtons = document.querySelectorAll("[data-screen-target]");

function showScreen(screenName) {
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
    window.initializeWorkoutLog?.();
  }
}

screenButtons.forEach((button) => {
  button.addEventListener("click", () => {
    showScreen(button.dataset.screenTarget);
  });
});
