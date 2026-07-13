const screens = document.querySelectorAll("[data-screen]");
const screenButtons = document.querySelectorAll("[data-screen-target]");

function showScreen(screenName) {
  screens.forEach((screen) => {
    screen.hidden = screen.id !== `${screenName}-screen`;
  });
}

screenButtons.forEach((button) => {
  button.addEventListener("click", () => {
    showScreen(button.dataset.screenTarget);
  });
});
