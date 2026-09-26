const screens = document.querySelectorAll("[data-screen]");
const screenButtons = document.querySelectorAll("[data-screen-target]");

function setActiveNav(screenName) {
  const navName = screenName === "calendar" ? "calendar" : screenName;

  screenButtons.forEach((button) => {
    const isCurrent = button.dataset.screenTarget === navName;
    button.toggleAttribute("aria-current", isCurrent);
    if (isCurrent) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

function showScreen(screenName, { source = "navigation", returnContext = null } = {}) {
  if (screenName === "timer" && source === "navigation") {
    window.prepareStandaloneTimer?.();
  }

  const visibleScreen =
    screenName === "calendar" ? "workout-log" : screenName;

  screens.forEach((screen) => {
    screen.hidden = screen.id !== `${visibleScreen}-screen`;
  });
  setActiveNav(screenName);

  if (
    screenName === "timer" &&
    !document.querySelector("#timer-screen")?.classList.contains("interval-timer")
  ) {
    window.initializeTimer?.();
  }

  if (screenName === "home") {
    window.initializeHome?.();
  }

  if (screenName === "calendar") {
    window.openWorkoutCalendar?.();
  }

  if (screenName === "workout-log") {
    if (source === "timer-complete") {
      window.resumeWorkoutAfterRest?.(returnContext);
    } else if (source === "view-date") {
      window.openDailyRecords?.(returnContext?.date, { from: "home" });
    } else {
      window.startTodayWorkout?.();
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => showScreen("home"), { once: true });
} else {
  showScreen("home");
}
