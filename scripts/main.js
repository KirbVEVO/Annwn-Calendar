const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const MODULE_ID = "Annwn-Calendar";

class AnnwnCalendarApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "annwn-calendar-app",
    window: { title: "Annwn Calendar" },
    position: { width: 900, height: 700 }
  };

  static PARTS = {
    calendar: { template: `modules/${MODULE_ID}/templates/calendar.html` }
  };

  async _prepareContext(options) {
    return {
      config: game.settings.get(MODULE_ID, "calendarData"),
      isGM: game.user.isGM
    };
  }

  _onRender(context, options) {

    this.element.dataset.theme = "dark";


  }
}

Hooks.once("init", () => {

  game.settings.register(MODULE_ID, "calendarData", {
    name: "Annwn Calendar Data",
    scope: "world",
    config: false,
    type: Object,
    default: {
      months: [],
      weekdays: [],
      seasons: [],
      regions: [],
      moons: [],
      events: [],
      currentDate: { year: 1, month: 1, day: 1 }
    }
  });
});

Hooks.once("ready", () => {
  game.annwnCalendar = new AnnwnCalendarApp();
});

Hooks.on("updateSetting", (setting) => {
  if (setting.key === `${MODULE_ID}.calendarData`) {
    game.annwnCalendar?.rendered && game.annwnCalendar.render();
  }
});

Hooks.on("renderJournalDirectory", (app, html) => {
  const root = html instanceof jQuery ? html[0] : html;

  if (root.querySelector(".annwn-open-calendar")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("annwn-open-calendar");
  button.innerHTML = `<i class="fa-solid fa-calendar-days"></i> Open Calendar`;
  button.style.width = "100%";
  button.addEventListener("click", () => game.annwnCalendar.render(true));

  const footer = root.querySelector(".directory-footer");
  if (footer) footer.append(button);
  else root.append(button);
});