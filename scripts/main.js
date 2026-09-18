// scripts/main.js
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const MODULE_ID = "Annwn-Calendar";
const SETTING_KEY = "calendarData";

class AnnwnCalendarApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "annwn-calendar-app",
    window: { title: "Annwn Calendar", resizable: true },
    position: { width: 900, height: 700 }
  };

  static PARTS = {
    calendar: { template: `modules/${MODULE_ID}/templates/calendar.html` }
  };

  /** Data handed to the template on every render. */
  async _prepareContext(options) {
    return { isGM: game.user.isGM };
  }

  /** Runs after the template HTML is in the DOM. */
  _onRender(context, options) {
    // Important: the CSS's @scope targets .annwn-calendar-root, a CHILD
    // of this.element (the part template's own root), not this.element
    // itself. Setting data-theme on this.element doesn't match
    // :scope[data-theme="dark"] in the CSS — this was the actual bug
    // behind "light/dark mode doesn't work."
    this.element.querySelector('.annwn-calendar-root').dataset.theme = "dark";

    // These two listeners were module-top-level in the original standalone
    // page (the DOM already existed when that <script> ran). Here they have
    // to be wired after every render instead, scoped to this app's own
    // element, since Foundry creates/destroys this DOM on each render.
    const fileInput = this.element.querySelector('#fileInput');
    const uploadZone = this.element.querySelector('#uploadZone');
    fileInput?.addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      fileHandle = null;
      const r = new FileReader();
      r.onload = ev => { importFromJSON(JSON.parse(ev.target.result)); };
      r.readAsText(f);
    });
    uploadZone?.addEventListener('click', e => {
      if (e.target === fileInput) return;
      e.preventDefault();
      openFilePicker();
    });

    loadCalendarData();
    launchApp();
  }
}


// --- module state -----------------------------------------------------
// `cal` (calendar structure: months/weekdays/eras/moons/format) and
// `appData` (events/weather/regions/seasons/currentDate) together replace
// what the original standalone app called `masterData`. Both are loaded
// from — and written back to — a single world-scoped game.settings entry
// instead of a JSON file + localStorage.

let cal = null;
let appData = null;

let currentMonthIdx = 7;
let currentYear = 534;
let selectedDay = null;
let weatherDay = null;
let selectedColor = "#c9a84c";
let selectedRecur = "none";
let selectedWeatherCond = "sunny";
let selectedWeatherRegionId = null;

let currentGameDate = { year: 534, month: 7, day: 1 };

let fileHandle = null;

const PRESET_COLORS = ["#c9a84c","#9a70cc","#4a8c6a","#9c3d3d","#3d6a9c","#c08040","#7a8c9c","#cc7a70","#70cc9a","#ccb070"];

const WEATHER_CONDITIONS = [
  { id:"sunny", icon:"Sunny", label:"Sunny" },
  { id:"partly", icon:"Partly Cloudy", label:"Partly Cloudy" },
  { id:"cloudy", icon:"Cloudy", label:"Cloudy" },
  { id:"overcast", icon:"Overcast", label:"Overcast" },
  { id:"rain", icon:"Rainy", label:"Rainy" },
  { id:"storm", icon:"Storm", label:"Storm" },
  { id:"snow", icon:"Snow", label:"Snow" },
  { id:"hail", icon:"Hail", label:"Hail" },
  { id:"fog", icon:"Fog", label:"Fog" },
  { id:"wind", icon:"Windy", label:"Windy" },
];

// Default calendar structure and starting data — your real Annwn
// calendar (from Timeline.json), so a fresh world works immediately
// without requiring a manual import first.
const DEFAULT_CAL = {
  hasZeroYear: true, epochWeekday: 0, weekResetsEachMonth: false,
  months: [
    { name: "Hammer", length: 30 }, { name: "Alturiak", length: 30 },
    { name: "Ches", length: 30 }, { name: "Tarsakh", length: 30 },
    { name: "Mirtul", length: 31 }, { name: "Kythorn", length: 30 },
    { name: "Flamerule", length: 30 }, { name: "Eleasis", length: 30 },
    { name: "Eleint", length: 30 }, { name: "Marpenoth", length: 30 },
    { name: "Uktar", length: 30 }, { name: "Nightal", length: 30 }
  ],
  weekdays: [
    { name: "Elday" }, { name: "Magday" }, { name: "Aeronday" },
    { name: "Helmday" }, { name: "Lorday" }, { name: "Vecday" },
    { name: "Mamonday" }, { name: "Arianday" }, { name: "Mephday" },
    { name: "Araday" }
  ],
  hoursInDay: 24, minutesInHour: 60,
  positiveEras: [{ abbr: "PC" }],
  negativeEra: { abbr: "DC" },
  moons: [{ name: "Moon", phase: 42524.0463, shift: 15238, color: "#FFFFFF" }]
};
const DEFAULT_APP = {
  events: [
    { id: "pxpxcz8h1", name: "Moonlight Bedivere Meeting", description: "", category: "time", location: "Core Spire, Archon", startH: "10", startM: "", endH: "14", endM: "", color: "#9c3d3d", recur: "none", important: true, duration: 1, year: 534, month: 7, day: 14 },
    { id: "ahoes59og", name: "Archon Peace Festival", description: "", category: "world", location: "Archon, Blackrose Wilds", startH: "9", startM: "", endH: "20", endM: "", color: "#3d6a9c", recur: "1y", important: false, duration: 2, year: 534, month: 6, day: 29 },
    { id: "4dnz2w9qe", name: "Mar Owes Goblin People", description: "", category: "personal", location: "Blackrose Wilds", startH: "", startM: "", endH: "", endM: "", color: "#c9a84c", recur: "none", important: true, duration: 1, year: 534, month: 7, day: 5 },
    { id: "gkdbbd7o3", name: "Beginning of Post Calamity", description: "After the Great Calamity, the world is plunged into chaos, and so starts a new Era.", category: "world", location: "Cartref", startH: "", startM: "", endH: "", endM: "", color: "#9c3d3d", recur: "none", important: false, duration: 1, year: 0, month: 0, day: 1 },
    { id: "79invx080", name: "The Great Calamity Ending", description: "The final days of the Great Calamity.", category: "world", location: "Cartref", startH: "", startM: "", endH: "", endM: "", color: "#3d6a9c", recur: "none", important: false, duration: 46, year: -1, month: 10, day: 15 },
    { id: "2mkscigv3", name: "Oneshot Muc Mhara", description: "", category: "world", location: "Beryl Sea", startH: "", startM: "", endH: "", endM: "", color: "#c9a84c", recur: "none", important: false, duration: 1, year: 365, month: 3, day: 13 },
    { id: "5kyiq6al4", name: "Players Jailed by Karstaag", description: "The date that 'Pasnet Nightbrook', 'Ishmael Cupric', and 'Russel Dalkhin' were abducted and taken to a prison belonging to the 'Prophecy of the New Dawn' cult.", category: "personal", location: "Cult Prison, Archon", startH: "", startM: "", endH: "", endM: "", color: "#c9a84c", recur: "none", important: false, duration: 1, year: 534, month: 6, day: 16 },
    { id: "7nqvu8iki", name: "Zhar Gameyun Joins the Party", description: "The 3 Lost Prisoners rescue Zhar Gameyun and offers him to join them.", category: "personal", location: "Goradire", startH: "", startM: "", endH: "", endM: "", color: "#ffaa00", recur: "none", important: false, duration: 1, year: 534, month: 6, day: 23 },
    { id: "hgu6h5uv9", name: "Luminex Machyra Joins the Party", description: "The party finds Luminex Machyra in his cave after Yuldarra attempted to trick them into stealing his heart as a power source. The party offered him to join them.", category: "world", location: "Underground Archon", startH: "", startM: "", endH: "", endM: "", color: "#9a70cc", recur: "none", important: false, duration: 1, year: 534, month: 6, day: 29 },
    { id: "fsn3ufj9h", name: "Eshteross Birthday", description: "Lord Ariks Eshteross was born on the 20th of Marpenoth, 481 PC.", category: "birthday", location: "Galehaven", startH: "", startM: "", endH: "", endM: "", color: "#9c3d3d", recur: "1y", important: false, duration: 1, year: 481, month: 9, day: 20 },
    { id: "hw1tve5ay", name: "The Five Year War Begins", description: "The small town of Jizamran in Galehaven gets invaded by the Alabaster Throne of the Churning Mists, Beginning the Five Year War.", category: "world", location: "Jizamran, Galehaven", startH: "14", startM: "00", endH: "", endM: "", color: "#3d6a9c", recur: "none", important: false, duration: 1, year: 509, month: 3, day: 1 },
    { id: "kpccceb8y", name: "Five Year War Ends", description: "After a 5 year conflict, leaving both sides exhausted and without victory, the Alabaster Throne of the Churning Mists and the Court of the Lambent Path of Galehaven come to a truce.", category: "world", location: "Churning Mists, Galehaven", startH: "12", startM: "00", endH: "13", endM: "00", color: "#3d6a9c", recur: "none", important: false, duration: 1, year: 514, month: 7, day: 16 },
    { id: "msvkp9isx", name: "Karstaag & Arcano Are defeated", description: "The Lost Prisoners fell into Karstaag's trap, however, he vastly underestimated their potential in combat.", category: "personal", location: "The Death Talon Crypt", startH: "", startM: "", endH: "", endM: "", color: "#70cc9a", recur: "none", important: true, duration: 1, year: 534, month: 7, day: 4 }
  ],
  weather: { "534_7_14": { condition: "storm", temp: 22, desc: "Thunderstorm", precip: 90, clouds: 90 } },
  regions: [
    { id: "xx1xxq41m", name: "The Blackrose Wilds", baseTemp: 28, rain: 80, clouds: 70, storm: 35, tempVar: 5 },
    { id: "p5vzupbpl", name: "The Churning Mists", baseTemp: 18, rain: 50, clouds: 90, storm: 10, tempVar: 8 },
    { id: "2gj8ht9yr", name: "Galehaven", baseTemp: 31, rain: 80, clouds: 70, storm: 40, tempVar: 2 },
    { id: "s5stzhlqb", name: "Cragfall Valley", baseTemp: 34, rain: 4, clouds: 2, storm: 3, tempVar: 15 },
    { id: "m3vglrn90", name: "Alik'r Desert", baseTemp: 42, rain: 2, clouds: 5, storm: 10, tempVar: 15 },
    { id: "4p6f6lwd1", name: "Anequina Sands", baseTemp: 30, rain: 30, clouds: 40, storm: 10, tempVar: 8 },
    { id: "jlck9s124", name: "Aggrad Mountains", baseTemp: 4, rain: 45, clouds: 50, storm: 30, tempVar: 11 },
    { id: "9sjmpnmtc", name: "Islands Of Dusk", baseTemp: 27, rain: 50, clouds: 45, storm: 35, tempVar: 3 }
  ],
  seasons: [
    { id: "c2g9dn08o", name: "Spring", color: "#2ecc71", startMonth: 1, startDay: 1, endMonth: 3, endDay: 30, baseTemp: "-2", tempVar: "4", tempMode: "offset", rain: "20", storm: "10" },
    { id: "oqrzkrwcx", name: "Summer", color: "#ffff00", startMonth: 4, startDay: 1, endMonth: 6, endDay: 30, baseTemp: "10", tempVar: "6", tempMode: "offset", rain: "-15", storm: "10" },
    { id: "drgucl2am", name: "Autumn", color: "#ffaa00", startMonth: 7, startDay: 1, endMonth: 9, endDay: 30, baseTemp: "0", tempVar: "4", tempMode: "offset", rain: "30", storm: "30" },
    { id: "0wlasoi5y", name: "Winter", color: "#0000ff", startMonth: 10, startDay: 1, endMonth: 0, endDay: 30, baseTemp: "-15", tempVar: "5", tempMode: "offset", rain: "-20", storm: "10" }
  ],
  currentDate: { year: 534, month: 7, day: 4 }
};

/** Pull cal/appData out of the world-scoped setting into module state. */
function loadCalendarData() {
  const stored = game.settings.get(MODULE_ID, SETTING_KEY);
  cal = (stored && stored.cal) ? stored.cal : foundry.utils.deepClone(DEFAULT_CAL);
  appData = (stored && stored.appData) ? stored.appData : foundry.utils.deepClone(DEFAULT_APP);
  if (!appData.seasons) appData.seasons = [];
  if (!appData.regions) appData.regions = [];
  if (!appData.weather) appData.weather = {};

  currentGameDate = appData.currentDate || { year: 1, month: 0, day: 1 };
  currentMonthIdx = currentGameDate.month;
  currentYear = currentGameDate.year;
}

/**
 * Import a previously-exported Annwn JSON file (same shape your original
 * standalone app produced/consumed: { calendars: [...], _appData: {...} }).
 * GM-only, since it overwrites the shared world calendar.
 */
function importFromJSON(data) {
  if (!game.user.isGM) {
    ui.notifications.warn("Only the GM can import a new calendar.");
    return;
  }
  cal = data.calendars[0];
  appData = data._appData || foundry.utils.deepClone(DEFAULT_APP);
  if (!appData.seasons) appData.seasons = [];

  currentGameDate = appData.currentDate || { year: 1, month: 0, day: 1 };
  currentMonthIdx = currentGameDate.month;
  currentYear = currentGameDate.year;

  game.annwnCalendar.element.querySelector('#landing')?.classList.remove('open');
  saveAppData();
  launchApp();
}

async function openFilePicker() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        multiple: false
      });
      fileHandle = handle;
      const file = await handle.getFile();
      const text = await file.text();
      importFromJSON(JSON.parse(text));
    } catch(e) {
      if (e.name !== 'AbortError') console.error(e);
    }
  } else {
    game.annwnCalendar.element.querySelector('#fileInput')?.click();
  }
}

/** Called once from _onRender to (re)build all the calendar's own UI. */
function launchApp() {
  buildMonthSelect();
  buildEraSelect();
  buildWeatherCondGrid();
  renderColorPresets();
  syncNavUI();
  syncRegionDropdown();
  switchView('home');
}

function switchView(v) {
  ['home','cal','weather','seasons'].forEach(id => {
    const el = document.getElementById(id+'View');
    el.classList.toggle('active', id===v);
  });
  document.querySelectorAll('.nav-tab').forEach((t,i) => {
    t.classList.toggle('active', ['home','cal','weather','seasons'][i]===v);
  });
  if(v==='home') renderHome();
  if(v==='cal') renderMonth();
  if(v==='weather') renderRegions();
  if(v==='seasons') renderSeasons();
}

function renderHome() {
  const appData = appData;

  const todayStr = formatDate(currentGameDate.year, currentGameDate.month, currentGameDate.day);
  document.getElementById('homeTodayDate').textContent = todayStr;
  document.getElementById('homeTodayWeekday').textContent = getWeekdayName(currentGameDate.year, currentGameDate.month, currentGameDate.day) + ' — In-Game Date';

  const allEvents = getEffectiveEvents();
  const nowAbs = toAbsDay(currentGameDate.year, currentGameDate.month, currentGameDate.day);

  const upcoming = allEvents.filter(e => {
    const d = toAbsDay(e.year, e.month, e.day);
    return d > nowAbs && d <= nowAbs + 30;
  }).sort((a,b) => toAbsDay(a.year,a.month,a.day) - toAbsDay(b.year,b.month,b.day)).slice(0,8);
  renderHomeList('homeUpcoming', upcoming, nowAbs);

  const important = allEvents.filter(e => e.important).sort((a,b) => toAbsDay(a.year,a.month,a.day) - toAbsDay(b.year,b.month,b.day)).slice(0,6);
  renderHomeList('homeImportant', important, nowAbs);

  const bdays = allEvents.filter(e => e.category === 'birthday' && e.month === currentGameDate.month);
  renderHomeList('homeBirthdays', bdays, nowAbs);

  const recur = appData.events.filter(e => e.recur && e.recur !== 'none' && e.month === currentGameDate.month);
  renderHomeList('homeRecurring', recur, nowAbs);
}

function renderHomeList(containerId, events, nowAbs) {
  const el = document.getElementById(containerId);
  if (!events.length) { el.innerHTML = '<div class="no-events">None found.</div>'; return; }
  el.innerHTML = events.map(e => {
    const d = toAbsDay(e.year, e.month, e.day);
    const diff = d - nowAbs;
    const tracker = diff > 0 ? `In ${formatRelative(diff)}` : diff < 0 ? `${formatRelative(-diff)} ago` : 'Today';
    const catTag = `<span class="tag ${e.category||'world'}">${categoryIcon(e.category)} ${e.category||'World'}</span>`;
    return `<div class="event-row" onclick="jumpToDate(${e.year},${e.month},${e.day})">
      <div class="event-color-bar" style="background:${e.color||'var(--gold)'}"></div>
      <div class="event-row-info">
        <h4>${e.name}</h4>
        <div class="meta">${formatDate(e.year,e.month,e.day)}${e.location?' · 📍 '+e.location:''} ${catTag}</div>
        <div class="tracker">${tracker}</div>
      </div>
      <div class="countdown-badge">${tracker}</div>
    </div>`;
  }).join('');
}

function moonCycleDays(moon) {

  const minutesPerDay = (cal.minutesInHour || 60) * (cal.hoursInDay || 24);
  const raw = moon.phase || 29.53;

  return raw > 1000 ? raw / minutesPerDay : raw;
}

function moonShiftDays(moon) {
  const minutesPerDay = (cal.minutesInHour || 60) * (cal.hoursInDay || 24);
  const raw = moon.shift || 0;
  return raw > 1000 ? raw / minutesPerDay : raw;
}

function getMoonPhaseIcon(moon, absDay) {

  const cycle = moonCycleDays(moon);
  const shift = moonShiftDays(moon);
  const phase = ((absDay - shift) % cycle + cycle) % cycle;
  const pct = phase / cycle;
  if(pct < 0.0625 || pct >= 0.9375) return '🌑';
  if(pct < 0.1875) return '🌒';
  if(pct < 0.3125) return '🌓';
  if(pct < 0.4375) return '🌔';
  if(pct < 0.5625) return '🌕';
  if(pct < 0.6875) return '🌖';
  if(pct < 0.8125) return '🌗';
  return '🌘';
}

function getMoonPhaseName(moon, absDay) {
  const cycle = moonCycleDays(moon);
  const shift = moonShiftDays(moon);
  const phase = ((absDay - shift) % cycle + cycle) % cycle;
  const pct = phase / cycle;
  if(pct < 0.0625 || pct >= 0.9375) return 'New Moon';
  if(pct < 0.1875) return 'Waxing Crescent';
  if(pct < 0.3125) return 'First Quarter';
  if(pct < 0.4375) return 'Waxing Gibbous';
  if(pct < 0.5625) return 'Full Moon';
  if(pct < 0.6875) return 'Waning Gibbous';
  if(pct < 0.8125) return 'Last Quarter';
  return 'Waning Crescent';
}

function getSeasonForDay(year, monthIdx, day) {
  const seasons = (appData.seasons || []);
  if(!seasons.length) return null;
  const diy = cal.months.reduce((s,m)=>s+m.length,0);

  let doy = day;
  for(let i=0; i<monthIdx; i++) doy += cal.months[i].length;

  for(const s of seasons) {
    let startDoy = s.startDay;
    for(let i=0; i<s.startMonth; i++) startDoy += cal.months[i].length;
    let endDoy = s.endDay;
    for(let i=0; i<s.endMonth; i++) endDoy += cal.months[i].length;

    if(startDoy <= endDoy) {
      if(doy >= startDoy && doy <= endDoy) return s;
    } else {

      if(doy >= startDoy || doy <= endDoy) return s;
    }
  }
  return null;
}

function seededRand(seed) {
  let x = Math.sin(seed + 1) * 43758.5453123;
  return x - Math.floor(x);
}

function autoWeatherForDay(year, monthIdx, day, region) {

  const absDay = toAbsDay(year, monthIdx, day);
  const seed = absDay * 7 + (region ? region.id.charCodeAt(0) : 0);
  const r1 = seededRand(seed);
  const r2 = seededRand(seed + 100);
  const r3 = seededRand(seed + 200);
  const r4 = seededRand(seed + 300);

  const season = getSeasonForDay(year, monthIdx, day);

  let baseTemp, tempVar;
  if(season && season.tempMode === 'offset') {
    const regionBase = parseFloat(region?.baseTemp||15);
    const offset = (season.baseTemp !== '') ? parseFloat(season.baseTemp||0) : 0;
    baseTemp = regionBase + offset;
    tempVar = (season.tempVar !== '') ? parseFloat(season.tempVar||5) : parseFloat(region?.tempVar||5);
  } else {
    baseTemp = (season && season.baseTemp !== '') ? parseFloat(season.baseTemp||15) : parseFloat(region?.baseTemp||15);
    tempVar = (season && season.tempVar !== '') ? parseFloat(season.tempVar||5) : parseFloat(region?.tempVar||5);
  }
  const temp = Math.round(baseTemp + (r2 - 0.5) * 2 * tempVar);

  let rainChance, stormChance;
  if(season && season.tempMode === 'offset') {

    const regionRain  = region ? region.rain  / 100 : 0.3;
    const regionStorm = region ? region.storm / 100 : 0.1;
    const rainOffset  = (season.rain  !== '') ? parseFloat(season.rain  || 0) / 100 : 0;
    const stormOffset = (season.storm !== '') ? parseFloat(season.storm || 0) / 100 : 0;
    rainChance  = Math.max(0, Math.min(1, regionRain  + rainOffset));
    stormChance = Math.max(0, Math.min(1, regionStorm + stormOffset));
  } else {

    rainChance  = (season && season.rain  !== '') ? parseFloat(season.rain  || 30) / 100 : (region ? region.rain  / 100 : 0.3);
    stormChance = (season && season.storm !== '') ? parseFloat(season.storm || 10) / 100 : (region ? region.storm / 100 : 0.1);
  }

  let cond;
  if(r1 < stormChance) cond = 'storm';
  else if(r1 < stormChance + rainChance) cond = r3 < 0.4 ? 'rain' : 'overcast';
  else if(r1 < stormChance + rainChance + 0.2) cond = 'cloudy';
  else if(r1 < stormChance + rainChance + 0.3) cond = 'partly';
  else cond = 'sunny';

  if(temp < -5 && (cond === 'rain' || cond === 'storm')) cond = 'snow';
  if(temp < 2 && cond === 'rain' && r4 > 0.5) cond = 'snow';

  const precip = cond==='storm'||cond==='snow' ? Math.round(50+r3*50) :
                 cond==='rain' ? Math.round(20+r3*60) :
                 cond==='overcast' ? Math.round(10+r3*20) :
                 cond==='cloudy' ? Math.round(r3*15) : Math.round(r3*5);
  const clouds = cond==='sunny' ? Math.round(r4*15) :
                 cond==='partly' ? Math.round(20+r4*30) :
                 cond==='cloudy' ? Math.round(50+r4*30) : Math.round(70+r4*30);

  const seasonName = season ? season.name : '';
  const cinematic = cinematicTemp(temp);
  const desc = seasonName ? `${cinematic} ${seasonName}` : cinematic;

  return { condition: cond, temp, precip, clouds, desc, region: region?.id, auto: true };
}

function cinematicTemp(t) {
  if(t < -30) return 'Bone-chilling';
  if(t < -15) return 'Bitter cold';
  if(t < -5)  return 'Frigid';
  if(t < 0)   return 'Freezing';
  if(t < 5)   return 'Cold';
  if(t < 10)  return 'Chilly';
  if(t < 15)  return 'Cool';
  if(t < 20)  return 'Mild';
  if(t < 25)  return 'Warm';
  if(t < 32)  return 'Hot';
  if(t < 40)  return 'Sweltering';
  return 'Blazing';
}

function renderMonth() {
  syncNavUI();
  renderSidebar();

  const month = cal.months[currentMonthIdx];
  const cols = cal.weekdays.length;
  const effectiveEvents = getEffectiveEvents();
  const moons = cal.moons || [];

  const wdays = cal.weekdays.map(w => `<span>${w.name.slice(0,3)}</span>`).join('');
  let html = `<div class="weekday-header" style="grid-template-columns:repeat(${cols},1fr)">${wdays}</div>`;
  html += `<div class="days-grid" style="grid-template-columns:repeat(${cols},1fr)">`;

  const nowAbs = toAbsDay(currentGameDate.year, currentGameDate.month, currentGameDate.day);

  for(let d = 1; d <= month.length; d++) {
    const absDay = toAbsDay(currentYear, currentMonthIdx, d);

    const evs = effectiveEvents.filter(e => {
      const eStart = toAbsDay(e.year, e.month, e.day);
      const eEnd = eStart + (e.duration||1) - 1;
      return absDay >= eStart && absDay <= eEnd;
    });

    const isCurrent = (currentYear===currentGameDate.year && currentMonthIdx===currentGameDate.month && d===currentGameDate.day);
    const isSelected = (selectedDay===d);

    const regions = appData.regions || [];
    const activeRegion = selectedWeatherRegionId
      ? regions.find(r => r.id === selectedWeatherRegionId) || regions[0]
      : regions[0];
    let weather = (appData.weather||{})[weatherKey(currentYear,currentMonthIdx,d)];

    if(selectedWeatherRegionId && weather && weather.region && weather.region !== selectedWeatherRegionId) weather = null;
    if(!weather && activeRegion) weather = autoWeatherForDay(currentYear, currentMonthIdx, d, activeRegion);
    const wCond = weather ? WEATHER_CONDITIONS.find(w=>w.id===weather.condition) : null;
    const wIcon = wCond ? wCond.icon.split(' ')[0] : '';

    const season = getSeasonForDay(currentYear, currentMonthIdx, d);
    const seasonTint = season ? `box-shadow:inset 0 0 0 2px ${season.color}22;` : '';

    const chipsHtml = evs.slice(0,3).map(e => {
      const eStart = toAbsDay(e.year, e.month, e.day);
      const eEnd = eStart + (e.duration||1) - 1;
      const dur = e.duration || 1;
      let spanClass = 'span-solo';
      if(dur > 1) {
        if(absDay === eStart) spanClass = 'span-start';
        else if(absDay === eEnd) spanClass = 'span-end';
        else spanClass = 'span-mid';
      }
      const showName = absDay === eStart || d === 1;
      return `<div class="day-event-chip ${spanClass}" style="background:${e.color||'#7a6430'}">${showName ? e.name : '&nbsp;'}</div>`;
    }).join('');

    const moonPips = moons.map(moon => {
      const icon = getMoonPhaseIcon(moon, absDay);
      return `<span class="day-moon-pip" title="${moon.name}: ${getMoonPhaseName(moon, absDay)}">${icon}</span>`;
    }).join('');

    const wTooltip = weather ? `<div class="weather-tooltip" id="wtt_${currentYear}_${currentMonthIdx}_${d}">
      <strong>${weather.desc||weather.condition}</strong>${weather.auto?' <span style="opacity:0.6;font-size:0.65rem">(auto)</span>':''}<br>
      🌡 ${weather.temp!==undefined?formatTemp(weather.temp):'—'}<br>
      💧 ${weather.precip!==undefined?weather.precip+'%':'—'} precip<br>
      ☁️ ${weather.clouds!==undefined?weather.clouds+'%':'—'} cloud cover
    </div>` : '';

    html += `<div class="day-cell ${isCurrent?'current-day':''} ${isSelected?'selected':''}" onclick="clickDay(${d})" style="${seasonTint}">
      <span class="day-num">${d}</span>
      <div class="day-events">${chipsHtml}</div>
      ${moonPips ? `<div class="day-moon-strip">${moonPips}</div>` : ''}
      ${wIcon ? `<div class="weather-corner" onmouseenter="showWeatherTip(event,'wtt_${currentYear}_${currentMonthIdx}_${d}')" onmouseleave="hideWeatherTip('wtt_${currentYear}_${currentMonthIdx}_${d}')">${wIcon}${wTooltip}</div>` : ''}
    </div>`;
  }
  html += '</div>';

  document.getElementById('calGridWrap').innerHTML = html;
  if(selectedDay) renderDayDetail();
}

function clickDay(d) {
  selectedDay = d;
  renderMonth();
  renderDayDetail();
}

function renderDayDetail() {
  const panel = document.getElementById('dayDetail');
  panel.classList.add('open');
  const month = cal.months[currentMonthIdx];
  const era = getEraAbbr(currentYear);
  const weekday = getWeekdayName(currentYear, currentMonthIdx, selectedDay);
  const effectiveEvents = getEffectiveEvents().filter(e => e.year===currentYear && e.month===currentMonthIdx && e.day===selectedDay);
  const weather = (appData.weather||{})[weatherKey(currentYear,currentMonthIdx,selectedDay)];
  const nowAbs = toAbsDay(currentGameDate.year, currentGameDate.month, currentGameDate.day);

  let evHtml = effectiveEvents.length ? effectiveEvents.map(e => {
    const d = toAbsDay(e.year, e.month, e.day);
    const diff = d - nowAbs;
    const tracker = diff > 0 ? `⏳ In ${formatRelative(diff)}` : diff < 0 ? `⌛ ${formatRelative(-diff)} ago` : '⚡ Today';
    const timeStr = (e.startH!==undefined && e.startH!=='') ? `${pad(e.startH)}:${pad(e.startM||0)}${(e.endH!==undefined && e.endH!=='') ? ' – '+pad(e.endH)+':'+pad(e.endM||0) : ''}` : '';
    const recurStr = e.recur && e.recur!=='none' ? ` · 🔁 ${recurLabel(e.recur)}` : '';
    return `<div class="event-detail-item" style="border-left-color:${e.color||'var(--gold)'}">
      <div class="event-detail-header">
        <span class="tag ${e.category||'world'}">${categoryIcon(e.category)} ${e.category||'World'}</span>
        <span class="event-detail-name">${e.name}</span>
        <button class="star-btn ${e.important?'lit':''}" onclick="toggleImportant('${e.id}')">★</button>
        <button class="edit-btn" onclick="openEditEvent('${e.id}')">✎</button>
        <button class="del-btn" onclick="deleteEvent('${e.id}')">✕</button>
      </div>
      <div class="event-detail-meta">
        ${timeStr ? `<span>🕐 ${timeStr}</span>` : ''}
        ${e.location ? `<span>📍 ${e.location}</span>` : ''}
        ${recurStr}
      </div>
      ${e.description ? `<div class="event-detail-desc">${e.description}</div>` : ''}
      <div class="event-detail-tracker">${tracker}</div>
    </div>`;
  }).join('') : '<div class="no-events">No events this day.</div>';

  const weatherBtn = `<button class="btn-sm" onclick="openWeatherModal(${selectedDay})">🌤 Set Weather</button>`;
  const setTodayBtn = `<button class="btn-sm" onclick="setSelectedDayAsToday()" title="Set this day as the current in-game date">📍 Set to Today</button>`;
  let weatherDisplay = '';
  if(weather) {
    const wc = WEATHER_CONDITIONS.find(w=>w.id===weather.condition);
    weatherDisplay = `<span style="font-size:0.85rem; margin-left:8px; color:var(--cream-dim);">${wc?.icon||''} ${weather.desc||weather.condition} · ${weather.temp!==undefined?formatTemp(weather.temp):''}</span>`;
  }
  const addBtn = `<button class="btn-add-event" onclick="openNewEvent()">+ Add Event</button>`;

  const absDay = toAbsDay(currentYear, currentMonthIdx, selectedDay);
  const moons = cal.moons || [];
  const moonHtml = moons.length ? `<div class="moon-row">${moons.map(moon =>
    `<span class="moon-badge"><span class="moon-icon">${getMoonPhaseIcon(moon, absDay)}</span>${moon.name}: ${getMoonPhaseName(moon, absDay)}</span>`
  ).join('')}</div>` : '';

  const season = getSeasonForDay(currentYear, currentMonthIdx, selectedDay);
  const seasonBadge = season ? `<span style="display:inline-block; margin-left:8px; padding:1px 8px; border-radius:10px; font-size:0.72rem; background:${season.color}33; color:${season.color}; border:1px solid ${season.color}55;">${season.name}</span>` : '';

  panel.innerHTML = `
    <div class="day-detail-header">
      <div>
        <div class="day-detail-title">${month.name} ${selectedDay}, ${Math.abs(currentYear)} ${era}${seasonBadge}</div>
        <div class="day-detail-weekday">${weekday}${weatherDisplay}</div>
        ${moonHtml}
      </div>
      <div class="detail-actions">${weatherBtn}${setTodayBtn}${addBtn}</div>
    </div>
    ${evHtml}`;
}

function renderSidebar() {
  const q = (document.getElementById('sideSearch').value||'').toLowerCase();
  const el = document.getElementById('sideEventList');
  const evs = getEffectiveEvents().filter(e => e.important || q);
  const filtered = q ? getEffectiveEvents().filter(e => e.name.toLowerCase().includes(q) || (e.description||'').toLowerCase().includes(q)) :
    getEffectiveEvents().filter(e => e.important);

  if(!filtered.length) { el.innerHTML = '<div style="color:var(--text-dim);font-size:0.8rem;padding:8px;">No events found.</div>'; return; }
  el.innerHTML = filtered.sort((a,b)=>toAbsDay(a.year,a.month,a.day)-toAbsDay(b.year,b.month,b.day)).map(e => {
    const cc = e.color || 'var(--gold)';
    return `<div class="side-event-item" style="border-left-color:${cc}" onclick="jumpToDate(${e.year},${e.month},${e.day})">
      <h5>${e.name}</h5>
      <p>${formatDate(e.year,e.month,e.day)}${e.location?' · 📍'+e.location:''}</p>
    </div>`;
  }).join('');
}

function openNewEvent() {
  if(!selectedDay) return;
  resetEventModal();
  document.getElementById('eventModalTitle').textContent = `New Event — ${cal.months[currentMonthIdx].name} ${selectedDay}`;
  document.getElementById('eventModal').classList.add('open');
}

function openEditEvent(id) {
  const ev = appData.events.find(e => e.id===id);
  if(!ev) return;
  resetEventModal();
  document.getElementById('eventModalTitle').textContent = 'Edit Event';
  document.getElementById('editingEvId').value = id;
  document.getElementById('evName').value = ev.name;
  document.getElementById('evDesc').value = ev.description||'';
  document.getElementById('evCategory').value = ev.category||'world';
  document.getElementById('evLocation').value = ev.location||'';
  document.getElementById('evStartH').value = ev.startH!==undefined ? ev.startH : '';
  document.getElementById('evStartM').value = ev.startM!==undefined ? ev.startM : '';
  document.getElementById('evEndH').value = ev.endH!==undefined ? ev.endH : '';
  document.getElementById('evEndM').value = ev.endM!==undefined ? ev.endM : '';
  selectedColor = ev.color || '#c9a84c';
  document.getElementById('colorSwatch').style.background = selectedColor;
  document.getElementById('colorPicker').value = selectedColor;
  selectedRecur = ev.recur || 'none';
  document.querySelectorAll('.recur-chip').forEach(c => c.classList.toggle('active', c.dataset.recur===selectedRecur));
  document.getElementById('evImportant').checked = !!ev.important;
  document.getElementById('evDuration').value = (ev.duration && ev.duration > 1) ? ev.duration : '';
  document.getElementById('eventModal').classList.add('open');
}

function resetEventModal() {
  document.getElementById('editingEvId').value = '';
  document.getElementById('evName').value = '';
  document.getElementById('evDesc').value = '';
  document.getElementById('evCategory').value = 'world';
  document.getElementById('evLocation').value = '';
  document.getElementById('evStartH').value = '';
  document.getElementById('evStartM').value = '';
  document.getElementById('evEndH').value = '';
  document.getElementById('evEndM').value = '';
  selectedColor = '#c9a84c';
  selectedRecur = 'none';
  document.getElementById('colorSwatch').style.background = selectedColor;
  document.getElementById('colorPicker').value = selectedColor;
  document.querySelectorAll('.recur-chip').forEach(c => c.classList.toggle('active', c.dataset.recur==='none'));
  document.getElementById('evImportant').checked = false;
  document.getElementById('evDuration').value = '';
}

function closeEventModal() { document.getElementById('eventModal').classList.remove('open'); }

function saveEvent() {
  const name = document.getElementById('evName').value.trim();
  if(!name) { alert("Please enter an event name."); return; }
  const editId = document.getElementById('editingEvId').value;
  const cat = document.getElementById('evCategory').value;

  const evData = {
    name,
    description: document.getElementById('evDesc').value,
    category: cat,
    location: document.getElementById('evLocation').value,
    startH: document.getElementById('evStartH').value,
    startM: document.getElementById('evStartM').value,
    endH: document.getElementById('evEndH').value,
    endM: document.getElementById('evEndM').value,
    color: selectedColor,
    recur: selectedRecur,
    important: document.getElementById('evImportant').checked,
    duration: Math.max(1, parseInt(document.getElementById('evDuration').value)||1),
    year: currentYear, month: currentMonthIdx, day: selectedDay,
  };

  const evs = appData.events;
  if(editId) {
    const idx = evs.findIndex(e=>e.id===editId);
    if(idx>=0) Object.assign(evs[idx], evData);
  } else {
    evs.push({ id: uid(), ...evData });
  }
  closeEventModal();
  saveAppData();
  renderMonth();
  renderSidebar();
}

function toggleImportant(id) {
  const ev = appData.events.find(e=>e.id===id);
  if(ev) { ev.important = !ev.important; saveAppData(); renderDayDetail(); renderSidebar(); }
}

function deleteEvent(id) {
  if(!confirm("Delete this event permanently?")) return;
  appData.events = appData.events.filter(e=>e.id!==id);
  saveAppData(); renderMonth(); renderDayDetail(); renderSidebar();
}

function getEffectiveEvents() {
  const evs = appData.events || [];
  const result = [];
  const daysInYear = cal.months.reduce((s,m)=>s+m.length,0);
  const monthStarts = [];
  let acc = 0;
  cal.months.forEach((m,i)=>{ monthStarts.push(acc); acc+=m.length; });

  evs.forEach(ev => {
    result.push({...ev});
    if(!ev.recur || ev.recur==='none') return;

    const baseAbs = toAbsDay(ev.year, ev.month, ev.day);

    const viewAbs = toAbsDay(currentYear, 0, 1);
    const rangeStart = viewAbs - daysInYear*2;
    const rangeEnd = viewAbs + daysInYear*2;
    let step = 0;
    switch(ev.recur) {
      case '1d': step = 1; break;
      case '7d': step = 7; break;
      case '1m': step = null; break;
      case '1y': step = daysInYear; break;
      case '10y': step = daysInYear*10; break;
    }
    if(step !== null) {
      let cur = baseAbs + step;
      while(cur <= rangeEnd) {
        if(cur >= rangeStart) {
          const dateObj = fromAbsDay(cur);
          if(dateObj) result.push({...ev, year:dateObj.year, month:dateObj.month, day:dateObj.day, id: ev.id+'_r'+cur, _recurring:true});
        }
        cur += step;
        if(cur - baseAbs > 36500*10) break;
      }
    } else if(ev.recur==='1m') {

      for(let yr = ev.year - 2; yr <= ev.year + 52; yr++) {
        for(let mo = 0; mo < cal.months.length; mo++) {
          if(yr===ev.year && mo===ev.month) continue;
          if(ev.day <= cal.months[mo].length) {
            const a = toAbsDay(yr,mo,ev.day);
            if(a >= rangeStart && a <= rangeEnd) {
              result.push({...ev, year:yr, month:mo, day:ev.day, id: ev.id+'_m'+yr+'_'+mo, _recurring:true});
            }
          }
        }
      }
    }
  });
  return result;
}

function openWeatherModal(day) {
  weatherDay = day;
  const m = cal.months[currentMonthIdx];
  const era = getEraAbbr(currentYear);
  document.getElementById('weatherDateLabel').textContent = `${m.name} ${day}, ${Math.abs(currentYear)} ${era}`;

  const existing = (appData.weather||{})[weatherKey(currentYear,currentMonthIdx,day)];
  if(existing) {
    selectedWeatherCond = existing.condition;
    document.getElementById('wTemp').value = existing.temp!==undefined ? existing.temp : '';
    document.getElementById('wDesc').value = existing.desc||'';
    document.getElementById('wPrecip').value = existing.precip!==undefined ? existing.precip : '';
    document.getElementById('wClouds').value = existing.clouds!==undefined ? existing.clouds : '';
  } else {
    selectedWeatherCond = 'sunny';
    document.getElementById('wTemp').value = '';
    document.getElementById('wDesc').value = '';
    document.getElementById('wPrecip').value = '';
    document.getElementById('wClouds').value = '';
  }

  buildWeatherCondGrid();
  buildRegionSelect('wRegion', existing?.region||'');
  document.getElementById('weatherModal').classList.add('open');
}

function closeWeatherModal() { document.getElementById('weatherModal').classList.remove('open'); }

function buildWeatherCondGrid() {
  const el = document.getElementById('weatherCondGrid');
  if(!el) return;
  el.innerHTML = WEATHER_CONDITIONS.map(w =>
    `<div class="weather-option ${selectedWeatherCond===w.id?'selected':''}" onclick="selectWeather('${w.id}')">
      ${w.icon}<span>${w.label}</span>
    </div>`
  ).join('');
}

function selectWeather(id) { selectedWeatherCond = id; buildWeatherCondGrid(); }

function saveWeather() {
  if(!weatherDay) return;
  const key = weatherKey(currentYear,currentMonthIdx,weatherDay);
  if(!appData.weather) appData.weather = {};
  appData.weather[key] = {
    condition: selectedWeatherCond,
    temp: document.getElementById('wTemp').value !== '' ? parseFloat(document.getElementById('wTemp').value) : undefined,
    desc: document.getElementById('wDesc').value,
    precip: document.getElementById('wPrecip').value !== '' ? parseFloat(document.getElementById('wPrecip').value) : undefined,
    clouds: document.getElementById('wClouds').value !== '' ? parseFloat(document.getElementById('wClouds').value) : undefined,
    region: document.getElementById('wRegion').value||undefined,
  };
  closeWeatherModal();
  saveAppData();
  renderMonth();
  if(selectedDay===weatherDay) renderDayDetail();
}

function randomiseWeather() {
  const regionId = document.getElementById('wRegion').value;
  const region = (appData.regions||[]).find(r=>r.id===regionId);

  const season = weatherDay ? getSeasonForDay(currentYear, currentMonthIdx, weatherDay) : null;
  const rain = (season && season.rain!=='') ? parseFloat(season.rain||30)/100 : (region ? region.rain/100 : 0.3);
  const storm = (season && season.storm!=='') ? parseFloat(season.storm||10)/100 : (region ? region.storm/100 : 0.1);
  const baseTemp = (season && season.baseTemp!=='') ? parseFloat(season.baseTemp||15) : (region ? region.baseTemp : 15);
  const tempVar = (season && season.tempVar!=='') ? parseFloat(season.tempVar||5) : (region ? region.tempVar : 5);

  const rand = Math.random();
  let cond = 'sunny';
  if(rand < storm) cond = 'storm';
  else if(rand < storm + rain) cond = 'rain';
  else if(rand < storm + rain + 0.2) cond = 'cloudy';
  else cond = 'sunny';
  selectedWeatherCond = cond;
  const temp = Math.round(baseTemp + (Math.random()-0.5)*2*tempVar);
  if(temp < 0 && cond==='rain') cond = selectedWeatherCond = 'snow';
  document.getElementById('wTemp').value = temp;
  document.getElementById('wPrecip').value = cond==='rain'||cond==='storm'||cond==='snow' ? Math.round(40+Math.random()*60) : cond==='cloudy' ? Math.round(10+Math.random()*20) : Math.round(Math.random()*10);
  document.getElementById('wClouds').value = cond==='sunny' ? Math.round(Math.random()*20) : cond==='cloudy' ? Math.round(50+Math.random()*40) : Math.round(70+Math.random()*30);
  document.getElementById('wDesc').value = cinematicTemp(temp) + (season ? ' ' + season.name : '');
  buildWeatherCondGrid();
}

function openAddRegionModal() {
  document.getElementById('rName').value = '';
  document.getElementById('rBaseTemp').value = '';
  document.getElementById('rRain').value = 30; document.getElementById('rRainV').textContent = '30%';
  document.getElementById('rClouds').value = 40; document.getElementById('rCloudsV').textContent = '40%';
  document.getElementById('rStorm').value = 10; document.getElementById('rStormV').textContent = '10%';
  document.getElementById('rTempVar').value = 5; document.getElementById('rTempVarV').textContent = '±5°';
  document.getElementById('editingRegionId').value = '';
  document.getElementById('regionModal').classList.add('open');
}

function saveRegion() {
  const name = document.getElementById('rName').value.trim();
  if(!name) return;
  if(!appData.regions) appData.regions = [];
  const editId = document.getElementById('editingRegionId').value;
  const regionData = {
    name,
    baseTemp: parseFloat(document.getElementById('rBaseTemp').value)||15,
    rain: parseInt(document.getElementById('rRain').value),
    clouds: parseInt(document.getElementById('rClouds').value),
    storm: parseInt(document.getElementById('rStorm').value),
    tempVar: parseInt(document.getElementById('rTempVar').value),
  };
  if(editId) {
    const idx = appData.regions.findIndex(r=>r.id===editId);
    if(idx>=0) Object.assign(appData.regions[idx], regionData);
  } else {
    appData.regions.push({ id: uid(), ...regionData });
  }
  document.getElementById('regionModal').classList.remove('open');
  saveAppData();
  renderRegions();
}

function deleteRegion(id) {
  if(!confirm("Delete this region?")) return;
  appData.regions = appData.regions.filter(r=>r.id!==id);
  saveAppData(); renderRegions();
}

function renderRegions() {
  syncRegionDropdown();
  const el = document.getElementById('regionList');
  const regions = appData.regions||[];
  if(!regions.length) { el.innerHTML = '<div class="no-events" style="padding:24px;">No weather regions defined. Add one to configure regional weather randomisation.</div>'; return; }
  el.innerHTML = regions.map(r => `
    <div class="region-card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3>${r.name}</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn-sm" onclick="autoGenerateForRegion('${r.id}')">⚡ Auto-Generate Year</button>
          <button class="btn-sm" onclick="editRegion('${r.id}')">Edit</button>
          <button class="btn-sm danger" onclick="deleteRegion('${r.id}')">Delete</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:12px;">
        <div style="text-align:center;"><div style="font-size:1.4rem;">🌡</div><div style="font-size:0.75rem;color:var(--cream-dim)">Base Temp</div><div style="color:var(--cream);font-size:0.9rem;">${formatTemp(r.baseTemp)} ±${r.tempVar}${formatTempUnit()}</div></div>
        <div style="text-align:center;"><div style="font-size:1.4rem;">🌧</div><div style="font-size:0.75rem;color:var(--cream-dim)">Rain Chance</div><div style="color:var(--cream);font-size:0.9rem;">${r.rain}%</div></div>
        <div style="text-align:center;"><div style="font-size:1.4rem;">☁️</div><div style="font-size:0.75rem;color:var(--cream-dim)">Cloud Cover</div><div style="color:var(--cream);font-size:0.9rem;">${r.clouds}%</div></div>
        <div style="text-align:center;"><div style="font-size:1.4rem;">⛈</div><div style="font-size:0.75rem;color:var(--cream-dim)">Storm Freq</div><div style="color:var(--cream);font-size:0.9rem;">${r.storm}%</div></div>
      </div>
    </div>`).join('');
}

function editRegion(id) {
  const r = (appData.regions||[]).find(r=>r.id===id);
  if(!r) return;
  document.getElementById('rName').value = r.name;
  document.getElementById('rBaseTemp').value = r.baseTemp;
  document.getElementById('rRain').value = r.rain; document.getElementById('rRainV').textContent = r.rain+'%';
  document.getElementById('rClouds').value = r.clouds; document.getElementById('rCloudsV').textContent = r.clouds+'%';
  document.getElementById('rStorm').value = r.storm; document.getElementById('rStormV').textContent = r.storm+'%';
  document.getElementById('rTempVar').value = r.tempVar; document.getElementById('rTempVarV').textContent = '±'+r.tempVar+'°';
  document.getElementById('editingRegionId').value = id;
  document.getElementById('regionModal').classList.add('open');
}

function buildRegionSelect(selectId, selectedVal) {
  const el = document.getElementById(selectId);
  el.innerHTML = '<option value="">— No Region —</option>';
  (appData.regions||[]).forEach(r => {
    el.innerHTML += `<option value="${r.id}" ${r.id===selectedVal?'selected':''}>${r.name}</option>`;
  });
}

function syncRegionDropdown() {
  const el = document.getElementById('weatherRegionSelect');
  if(!el) return;
  const regions = appData.regions || [];
  if(!regions.length) {
    el.innerHTML = '<option value="">No regions</option>';
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  const prev = selectedWeatherRegionId;
  el.innerHTML = regions.map(r =>
    `<option value="${r.id}" ${r.id===prev?'selected':''}>${r.name}</option>`
  ).join('');

  if(!regions.find(r => r.id === prev)) {
    selectedWeatherRegionId = regions[0].id;
    el.value = selectedWeatherRegionId;
  }
}

function selectWeatherRegion(id) {
  selectedWeatherRegionId = id || null;
  if(document.getElementById('calView').classList.contains('active')) renderMonth();
}

function openSetDateModal() {
  const sdMonth = document.getElementById('sdMonth');
  sdMonth.innerHTML = cal.months.map((m,i)=>`<option value="${i}">${m.name}</option>`).join('');
  sdMonth.value = currentGameDate.month;
  document.getElementById('sdDay').value = currentGameDate.day;
  document.getElementById('sdYear').value = Math.abs(currentGameDate.year);

  const opts = [];
  if(cal.positiveEras) cal.positiveEras.forEach(e => opts.push(`<option value="pos">${e.abbr}</option>`));
  if(cal.negativeEra) opts.push(`<option value="neg">${cal.negativeEra.abbr}</option>`);
  document.getElementById('sdEra').innerHTML = opts.join('');
  document.getElementById('sdEra').value = currentGameDate.year >= 0 ? 'pos' : 'neg';
  previewCurrentDate();
  document.getElementById('setDateModal').classList.add('open');
}

function previewCurrentDate() {
  const m = parseInt(document.getElementById('sdMonth').value);
  const d = parseInt(document.getElementById('sdDay').value)||1;
  const y = parseInt(document.getElementById('sdYear').value)||534;
  const era = document.getElementById('sdEra').value;
  const absYear = era==='neg' ? -y : y;
  document.getElementById('currentDatePreview').textContent = `${cal.months[m]?.name||''} ${d}, ${Math.abs(absYear)} ${getEraAbbr(absYear)}`;
}

function saveCurrentDate() {
  const m = parseInt(document.getElementById('sdMonth').value);
  const d = parseInt(document.getElementById('sdDay').value)||1;
  const y = parseInt(document.getElementById('sdYear').value)||534;
  const era = document.getElementById('sdEra').value;
  currentGameDate = { year: era==='neg'?-y:y, month:m, day:d };
  appData.currentDate = currentGameDate;
  currentMonthIdx = m;
  currentYear = currentGameDate.year;
  document.getElementById('setDateModal').classList.remove('open');
  saveAppData();
  syncNavUI();
  renderMonth();
  renderHome();
}

function advanceDay() {

  let { year, month, day } = currentGameDate;
  day++;
  if(day > cal.months[month].length) {
    day = 1;
    month++;
    if(month >= cal.months.length) {
      month = 0;
      year++;
    }
  }
  currentGameDate = { year, month, day };
  appData.currentDate = currentGameDate;
  currentMonthIdx = month;
  currentYear = year;
  saveAppData();
  syncNavUI();
  renderMonth();
  renderHome();
}

function goToCurrentDate() {
  currentYear = currentGameDate.year;
  selectedDay = currentGameDate.day;
  switchView('cal');
  syncNavUI();
  renderMonth();
  renderDayDetail();
}

function buildMonthSelect() {
  const el = document.getElementById('monthSelect');
  el.innerHTML = cal.months.map((m,i)=>`<option value="${i}">${m.name}</option>`).join('');
  const sdEl = document.getElementById('sdMonth');
  if(sdEl) sdEl.innerHTML = cal.months.map((m,i)=>`<option value="${i}">${m.name}</option>`).join('');
}

function buildEraSelect() {
  const opts = [];
  if(cal.positiveEras) cal.positiveEras.forEach(e => opts.push(`<option value="pos">${e.abbr}</option>`));
  if(cal.negativeEra) opts.push(`<option value="neg">${cal.negativeEra.abbr}</option>`);
  const html = opts.join('');
  document.getElementById('eraSelect').innerHTML = html;

  const sdEra = document.getElementById('sdEra');
  if(sdEra) sdEra.innerHTML = html;
}

function syncNavUI() {
  document.getElementById('monthSelect').value = currentMonthIdx;
  document.getElementById('yearInput').value = Math.abs(currentYear);
  document.getElementById('eraSelect').value = currentYear>=0 ? 'pos' : 'neg';
  document.getElementById('calMonthTitle').textContent = `${cal.months[currentMonthIdx].name} ${Math.abs(currentYear)} ${getEraAbbr(currentYear)}`;
}

function changeMonth(step) {
  currentMonthIdx += step;
  if(currentMonthIdx >= cal.months.length) { currentMonthIdx=0; currentYear++; }
  if(currentMonthIdx < 0) { currentMonthIdx=cal.months.length-1; currentYear--; }
  syncNavUI(); renderMonth();
}

function jumpMonth(idx) { currentMonthIdx=parseInt(idx); syncNavUI(); renderMonth(); }
function jumpYear(v) {
  const era = document.getElementById('eraSelect').value;
  currentYear = era==='neg' ? -Math.abs(parseInt(v)||0) : Math.abs(parseInt(v)||0);
  syncNavUI(); renderMonth();
}

function jumpToDate(y, m, d) {
  currentYear = y; currentMonthIdx = m; selectedDay = d;
  switchView('cal');
  syncNavUI(); renderMonth(); renderDayDetail();
}

function renderColorPresets() {
  const el = document.getElementById('colorPresets');
  el.innerHTML = PRESET_COLORS.map(c =>
    `<div class="color-preset" style="background:${c}" onclick="pickColor('${c}')"></div>`
  ).join('');
}

function pickColor(c) {
  selectedColor = c;
  document.getElementById('colorSwatch').style.background = c;
  document.getElementById('colorPicker').value = c;
}

function updateSwatch(c) {
  selectedColor = c;
  document.getElementById('colorSwatch').style.background = c;
}

function selectRecur(el) {
  selectedRecur = el.dataset.recur;
  document.querySelectorAll('.recur-chip').forEach(c => c.classList.toggle('active', c===el));
}

function recurLabel(r) {
  const map = { '1d':'Daily','7d':'Weekly','1m':'Monthly','1y':'Yearly','10y':'Every 10 yrs' };
  return map[r]||r;
}

function toAbsDay(year, month, day) {
  const daysInYear = cal.months.reduce((s,m)=>s+m.length,0);
  let d = year * daysInYear;
  for(let i=0; i<month; i++) d += cal.months[i].length;
  return d + day;
}

function fromAbsDay(absDay) {
  const daysInYear = cal.months.reduce((s,m)=>s+m.length,0);
  let year = Math.floor(absDay / daysInYear);
  let rem = absDay - year * daysInYear;
  for(let m=0; m<cal.months.length; m++) {
    if(rem <= cal.months[m].length) return { year, month:m, day:rem };
    rem -= cal.months[m].length;
  }
  return null;
}

function weatherKey(y, m, d) { return `${y}_${m}_${d}`; }

function getWeekdayName(year, month, day) {

  const offset = (day - 1) % cal.weekdays.length;
  return cal.weekdays[offset].name;
}

function getEraAbbr(year) {
  if(year >= 0 && cal.positiveEras?.length) return cal.positiveEras[0].abbr;
  return cal.negativeEra?.abbr || 'DC';
}

function formatDate(year, month, day) {
  return `${cal.months[month]?.name||'?'} ${day}, ${Math.abs(year)} ${getEraAbbr(year)}`;
}

function formatRelative(days) {
  if(days===0) return 'today';
  const diy = cal.months.reduce((s,m)=>s+m.length,0);
  if(days >= diy*2) return `${Math.floor(days/diy)} years`;
  if(days >= cal.months[0].length) {
    const months = Math.floor(days / 30);
    return `${months} month${months!==1?'s':''}`;
  }
  if(days >= 7) return `${Math.floor(days/7)} week${Math.floor(days/7)!==1?'s':''}`;
  return `${days} day${days!==1?'s':''}`;
}

function categoryIcon(cat) {
  const map = { world:'🌍', personal:'👤', birthday:'🎂', combat:'⚔', time:'⏳' };
  return map[cat]||'🌍';
}

function pad(n) { return String(n||0).padStart(2,'0'); }
function uid() { return Math.random().toString(36).substr(2,9); }

function buildSavePayload() {
  return {
    calendars: [cal],
    _appData: appData
  };
}

async function saveAppData() {
  if (!game.user.isGM) {
    // World-scoped settings can only be written by a GM — Foundry enforces
    // this server-side regardless of what the UI lets someone click.
    // Player-writable event add/delete (via a separate, open-ownership
    // document) is a follow-up piece, not yet wired in this pass.
    ui.notifications.warn("Only the GM can save changes to the shared calendar right now.");
    return;
  }

  await game.settings.set(MODULE_ID, SETTING_KEY, { cal, appData });
  showSaveIndicator();

  if (!fileHandle) return;
  try {
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(buildSavePayload(), null, 2));
    await writable.close();
  } catch(e) {
    console.warn('Auto-save to linked file failed:', e);
  }
}

function showSaveIndicator() {
  let ind = game.annwnCalendar.element.querySelector('#saveIndicator');
  if (!ind) {
    ind = document.createElement('div');
    ind.id = 'saveIndicator';
    ind.style.cssText = 'position:absolute;bottom:18px;right:18px;background:var(--primary);color:#fff;padding:6px 14px;border-radius:20px;font-size:0.78rem;font-family:\'Cinzel\',serif;letter-spacing:0.05em;opacity:0;transition:opacity 0.3s;pointer-events:none;z-index:9999;';
    ind.textContent = '✓ Saved';
    game.annwnCalendar.element.appendChild(ind);
  }
  ind.style.opacity = '1';
  clearTimeout(ind._t);
  ind._t = setTimeout(() => { ind.style.opacity = '0'; }, 1800);
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(buildSavePayload(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'annwn_export.json';
  a.click();
}


function openAddSeasonModal() {
  document.getElementById('seasonModalTitle').textContent = 'Add Season';
  document.getElementById('editingSeasonId').value = '';
  document.getElementById('sName').value = '';
  document.getElementById('sColor').value = '#2ecc71';
  document.getElementById('sBaseTemp').value = '';
  document.getElementById('sTempVar').value = '';
  document.getElementById('sRain').value = '';
  document.getElementById('sStorm').value = '';
  setSeasonTempMode('override');
  buildSeasonMonthSelects();
  document.getElementById('sStartMonth').value = 0;
  document.getElementById('sStartDay').value = 1;
  document.getElementById('sEndMonth').value = 2;
  document.getElementById('sEndDay').value = cal.months[2].length;
  document.getElementById('seasonModal').classList.add('open');
}

function buildSeasonMonthSelects() {
  const opts = cal.months.map((m,i)=>`<option value="${i}">${m.name}</option>`).join('');
  document.getElementById('sStartMonth').innerHTML = opts;
  document.getElementById('sEndMonth').innerHTML = opts;
}

function setSeasonTempMode(mode) {
  document.getElementById('sModeOverride').classList.toggle('active', mode === 'override');
  document.getElementById('sModeOffset').classList.toggle('active', mode === 'offset');
  document.getElementById('sBaseTempLabel').textContent =
    mode === 'offset' ? 'Temp Offset (°C, +/-)' : 'Season Base Temp (°C)';
  document.getElementById('sBaseTemp').placeholder =
    mode === 'offset' ? 'e.g. -15 for winter' : 'e.g. 5 for winter';
  document.getElementById('sTemperatureHint').textContent =
    mode === 'offset'
      ? 'Added on top of the region\'s base values. Temperature, rain %, and storm % fields are all treated as offsets (e.g. +20% rain). Leave blank for no offset.'
      : 'Sets absolute values for this season, ignoring the region. Leave blank to use the region default.';

  if(document.getElementById('sRainLabel')) {
    document.getElementById('sRainLabel').textContent  = mode === 'offset' ? 'Rain Chance Offset (%, +/-)' : 'Rain Chance Override (%)';
    document.getElementById('sStormLabel').textContent = mode === 'offset' ? 'Storm Chance Offset (%, +/-)' : 'Storm Chance Override (%)';
    document.getElementById('sRain').placeholder  = mode === 'offset' ? 'e.g. +20 wetter, -10 drier' : 'leave blank = region default';
    document.getElementById('sStorm').placeholder = mode === 'offset' ? 'e.g. +15 stormier' : 'leave blank = region default';
  }
}

function saveSeason() {
  const name = document.getElementById('sName').value.trim();
  if(!name) return;
  if(!appData.seasons) appData.seasons = [];
  const editId = document.getElementById('editingSeasonId').value;
  const tempMode = document.getElementById('sModeOffset').classList.contains('active') ? 'offset' : 'override';
  const data = {
    name,
    color: document.getElementById('sColor').value,
    startMonth: parseInt(document.getElementById('sStartMonth').value),
    startDay: parseInt(document.getElementById('sStartDay').value)||1,
    endMonth: parseInt(document.getElementById('sEndMonth').value),
    endDay: parseInt(document.getElementById('sEndDay').value)||30,
    baseTemp: document.getElementById('sBaseTemp').value,
    tempVar: document.getElementById('sTempVar').value,
    tempMode,
    rain: document.getElementById('sRain').value,
    storm: document.getElementById('sStorm').value,
  };
  if(editId) {
    const idx = appData.seasons.findIndex(s=>s.id===editId);
    if(idx>=0) Object.assign(appData.seasons[idx], data);
  } else {
    appData.seasons.push({ id: uid(), ...data });
  }
  document.getElementById('seasonModal').classList.remove('open');
  saveAppData();
  renderSeasons();
  if(document.getElementById('calView').classList.contains('active')) renderMonth();
}

function editSeason(id) {
  const s = (appData.seasons||[]).find(s=>s.id===id);
  if(!s) return;
  document.getElementById('seasonModalTitle').textContent = 'Edit Season';
  document.getElementById('editingSeasonId').value = id;
  document.getElementById('sName').value = s.name;
  document.getElementById('sColor').value = s.color||'#2ecc71';
  document.getElementById('sBaseTemp').value = s.baseTemp||'';
  document.getElementById('sTempVar').value = s.tempVar||'';
  document.getElementById('sRain').value = s.rain||'';
  document.getElementById('sStorm').value = s.storm||'';
  setSeasonTempMode(s.tempMode||'override');
  buildSeasonMonthSelects();
  document.getElementById('sStartMonth').value = s.startMonth;
  document.getElementById('sStartDay').value = s.startDay;
  document.getElementById('sEndMonth').value = s.endMonth;
  document.getElementById('sEndDay').value = s.endDay;
  document.getElementById('seasonModal').classList.add('open');
}

function deleteSeason(id) {
  if(!confirm('Delete this season?')) return;
  appData.seasons = (appData.seasons||[]).filter(s=>s.id!==id);
  saveAppData(); renderSeasons();
  if(document.getElementById('calView').classList.contains('active')) renderMonth();
}

function renderSeasons() {
  const el = document.getElementById('seasonList');
  const seasons = appData.seasons||[];
  if(!seasons.length) {
    el.innerHTML = '<div class="no-events" style="padding:24px;">No seasons defined yet. Add one to enable seasonal weather variation and calendar tinting.</div>';
    return;
  }
  el.innerHTML = seasons.map(s => {
    const startName = cal.months[s.startMonth]?.name||'?';
    const endName = cal.months[s.endMonth]?.name||'?';
    const isOffset = s.tempMode === 'offset';
    const varDisplay = s.tempVar || 5;
    const tempStr = s.baseTemp !== ''
      ? (isOffset
          ? `${parseFloat(s.baseTemp) >= 0 ? '+' : ''}${s.baseTemp}°C offset ±${varDisplay}${formatTempUnit()}`
          : `${formatTemp(s.baseTemp)} ±${varDisplay}${formatTempUnit()}`)
      : 'Region default';
    const rainStr = s.rain !== ''
      ? (isOffset ? `${parseFloat(s.rain) >= 0 ? '+' : ''}${s.rain}% offset` : `${s.rain}%`)
      : 'Region default';
    const stormStr = s.storm !== ''
      ? (isOffset ? `${parseFloat(s.storm) >= 0 ? '+' : ''}${s.storm}% offset` : `${s.storm}%`)
      : 'Region default';
    return `<div class="season-card" style="border-left-color:${s.color};">
      <div class="season-header">
        <div>
          <div class="season-name" style="color:${s.color};">● ${s.name} <span style="font-size:0.65rem;padding:1px 6px;border-radius:8px;margin-left:4px;background:${isOffset?'rgba(61,122,176,0.15)':'rgba(36,102,69,0.15)'};color:${isOffset?'var(--blue-bright)':'var(--primary-bright)'};border:1px solid ${isOffset?'rgba(61,122,176,0.3)':'rgba(36,102,69,0.3)'};">${isOffset?'offset':'override'}</span></div>
          <div class="season-meta">${startName} ${s.startDay} → ${endName} ${s.endDay}</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn-sm" onclick="editSeason('${s.id}')">Edit</button>
          <button class="btn-sm danger" onclick="deleteSeason('${s.id}')">Delete</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;font-size:0.82rem;">
        <div><span style="color:var(--cream-dim);">🌡 Temperature</span><br><strong>${tempStr}</strong></div>
        <div><span style="color:var(--cream-dim);">🌧 Rain chance</span><br><strong>${rainStr}</strong></div>
        <div><span style="color:var(--cream-dim);">⛈ Storm chance</span><br><strong>${stormStr}</strong></div>
      </div>
      <div class="season-bar" style="--season-from:${s.color}44; --season-to:${s.color}cc;"></div>
    </div>`;
  }).join('');
}

function autoGenerateAllWeather() {
  const regions = appData.regions||[];
  const region = regions[0] || null;

  if(!region) {
    alert('Add at least one Weather Region first — the auto-generator uses region settings for temperature and precipitation.');
    return;
  }

  const confirmed = confirm(
    `Auto-generate weather for all ${cal.months.reduce((s,m)=>s+m.length,0)} days of year ${Math.abs(currentYear)} ${getEraAbbr(currentYear)} using "${region.name}"?\n\nThis will NOT overwrite days you have manually set. Days with existing manual weather are skipped.`
  );
  if(!confirmed) return;

  if(!appData.weather) appData.weather = {};
  let generated = 0;

  for(let m=0; m<cal.months.length; m++) {
    for(let d=1; d<=cal.months[m].length; d++) {
      const key = weatherKey(currentYear, m, d);
      const existing = appData.weather[key];

      if(existing && !existing.auto) continue;
      appData.weather[key] = autoWeatherForDay(currentYear, m, d, region);
      generated++;
    }
  }

  saveAppData();
  renderMonth();
  alert(`Generated weather for ${generated} days. Manual overrides were preserved.`);
}

function autoGenerateForRegion(regionId) {
  const region = (appData.regions||[]).find(r=>r.id===regionId);
  if(!region) return;
  const confirmed = confirm(
    `Auto-generate weather for all days of year ${Math.abs(currentYear)} using "${region.name}"?\n\nManually set days will be preserved.`
  );
  if(!confirmed) return;
  if(!appData.weather) appData.weather = {};
  let generated = 0;
  for(let m=0; m<cal.months.length; m++) {
    for(let d=1; d<=cal.months[m].length; d++) {
      const key = weatherKey(currentYear, m, d);
      const existing = appData.weather[key];
      if(existing && !existing.auto) continue;
      appData.weather[key] = autoWeatherForDay(currentYear, m, d, region);
      generated++;
    }
  }
  saveAppData();
  renderMonth();
  alert(`Generated weather for ${generated} days using ${region.name}.`);
}

function autoGenerateWeatherForDay(year, monthIdx, day) {

  const regions = appData.regions||[];
  const region = regions[0]||null;
  const w = autoWeatherForDay(year, monthIdx, day, region);
  selectedWeatherCond = w.condition;
  document.getElementById('wTemp').value = w.temp;
  document.getElementById('wPrecip').value = w.precip;
  document.getElementById('wClouds').value = w.clouds;
  document.getElementById('wDesc').value = w.desc;
  buildWeatherCondGrid();
}

function toggleTheme() {
  const body = game.annwnCalendar.element.querySelector('.annwn-calendar-root');
  const currentTheme = body.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  body.setAttribute('data-theme', newTheme);
  const btn = game.annwnCalendar.element.querySelector('.btn-icon[onclick="toggleTheme()"]');
  if (btn) btn.textContent = newTheme === 'dark' ? 'Light' : 'Dark';
}

function getTempUnit() {
  return (window.calTempUnit === 'fahrenheit') ? 'F' : 'C';
}
function toFahrenheit(c) {
  return Math.round(parseFloat(c) * 9 / 5 + 32);
}
function formatTemp(t) {
  if(t === '' || t === undefined || t === null) return '—';
  if(getTempUnit() === 'F') return `${toFahrenheit(t)}°F`;
  return `${t}°C`;
}
function formatTempUnit() {
  return getTempUnit() === 'F' ? '°F' : '°C';
}

function showWeatherTip(event, id) {
  const tip = document.getElementById(id);
  if(!tip) return;
  const rect = event.currentTarget.getBoundingClientRect();
  tip.style.display = 'block';

  let left = rect.right - 160;
  let top  = rect.bottom + 4;
  if(left < 4) left = 4;
  if(top + 100 > window.innerHeight) top = rect.top - 110;
  tip.style.left = left + 'px';
  tip.style.top  = top  + 'px';
}
function hideWeatherTip(id) {
  const tip = document.getElementById(id);
  if(tip) tip.style.display = 'none';
}
function setSelectedDayAsToday() {
  if(selectedDay === null || selectedDay === undefined) return;
  currentGameDate = { year: currentYear, month: currentMonthIdx, day: selectedDay };
  appData.currentDate = currentGameDate;
  saveAppData();
  syncNavUI();
  renderMonth();
  renderHome();
}


Hooks.once("init", () => {
  // One JSON blob holding calendar structure (months, weekdays, seasons,
  // weather regions, moons, current date) and events. World-scoped, so
  // it's shared by everyone connected; only a GM can write to it directly
  // via game.settings.set() (saveAppData() checks this and warns players).
  game.settings.register(MODULE_ID, SETTING_KEY, {
    name: "Annwn Calendar Data",
    scope: "world",
    config: false,
    type: Object,
    default: null // populated lazily by loadCalendarData()'s DEFAULT_CAL/DEFAULT_APP
  });
});

Hooks.once("ready", () => {
  game.annwnCalendar = new AnnwnCalendarApp();

  // Every inline onclick="..." attribute inside calendar.html (and inside
  // the HTML strings these functions themselves generate, e.g. day cells,
  // event rows) looks up its handler on the real global `window` object.
  // ES modules do NOT expose their top-level functions there automatically,
  // so every function referenced that way has to be attached explicitly.
window.advanceDay = advanceDay;
window.autoGenerateAllWeather = autoGenerateAllWeather;
window.autoGenerateForRegion = autoGenerateForRegion;
window.autoGenerateWeatherForDay = autoGenerateWeatherForDay;
window.changeMonth = changeMonth;
window.clickDay = clickDay;
window.closeEventModal = closeEventModal;
window.closeWeatherModal = closeWeatherModal;
window.deleteEvent = deleteEvent;
window.deleteRegion = deleteRegion;
window.deleteSeason = deleteSeason;
window.editRegion = editRegion;
window.editSeason = editSeason;
window.exportJSON = exportJSON;
window.goToCurrentDate = goToCurrentDate;
window.hideWeatherTip = hideWeatherTip;
window.jumpMonth = jumpMonth;
window.jumpToDate = jumpToDate;
window.jumpYear = jumpYear;
window.openAddRegionModal = openAddRegionModal;
window.openAddSeasonModal = openAddSeasonModal;
window.openEditEvent = openEditEvent;
window.openNewEvent = openNewEvent;
window.openSetDateModal = openSetDateModal;
window.openWeatherModal = openWeatherModal;
window.pickColor = pickColor;
window.previewCurrentDate = previewCurrentDate;
window.randomiseWeather = randomiseWeather;
window.renderSidebar = renderSidebar;
window.saveCurrentDate = saveCurrentDate;
window.saveEvent = saveEvent;
window.saveRegion = saveRegion;
window.saveSeason = saveSeason;
window.saveWeather = saveWeather;
window.selectRecur = selectRecur;
window.selectWeather = selectWeather;
window.selectWeatherRegion = selectWeatherRegion;
window.setSeasonTempMode = setSeasonTempMode;
window.setSelectedDayAsToday = setSelectedDayAsToday;
window.showWeatherTip = showWeatherTip;
window.switchView = switchView;
window.toggleTheme = toggleTheme;
window.updateSwatch = updateSwatch;
window.openFilePicker = openFilePicker;
});

// Re-render the open calendar window when the shared config changes, so
// every connected client stays in sync automatically.
Hooks.on("updateSetting", (setting) => {
  if (setting.key === `${MODULE_ID}.${SETTING_KEY}`) {
    if (game.annwnCalendar?.rendered) game.annwnCalendar.render();
  }
});

// Add a full-width "Open Calendar" button at the bottom of the Journal
// sidebar tab. renderJournalDirectory fires every time that tab renders;
// html is jQuery-wrapped in Foundry v12 and a plain HTMLElement in v13+,
// so this normalizes to a raw element either way.
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