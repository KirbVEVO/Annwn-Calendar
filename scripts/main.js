// scripts/main.js
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class AnnwnCalendarApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "annwn-calendar-app",
    window: { title: "Annwn Calendar" },
    position: { width: 900, height: 700 }
  };

  static PARTS = {
    calendar: { template: "modules/Annwn-alendar/templates/calendar.html" }
  };
}

Hooks.once("ready", () => {
  game.annwnCalendar = new AnnwnCalendarApp();
});