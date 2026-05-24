const defaultSettings = { textSize: "normal", compact: false, sound: false };

function readSettings() {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem("appSettings") || "{}") };
  } catch {
    return { ...defaultSettings };
  }
}

const state = {
  token: localStorage.getItem("token"),
  user: JSON.parse(localStorage.getItem("user") || "null"),
  view: "home",
  title: "Asosiy",
  stack: [],
  categories: [],
  stats: {},
  currentQuestions: [],
  currentIndex: 0,
  selected: new Map(),
  quizStartedAt: null,
  quizDurationSec: 25 * 60,
  quizTimer: null,
  quizFinishing: false,
  lastMode: "new-20",
  lastTicketId: null,
  lastTicketCategory: null,
  lastTicketNumber: null,
  lastTopic: null,
  lastLimit: 20,
  signs: [],
  signGroups: [],
  signFilter: "",
  signGroup: "all",
  topics: [],
  searchQuery: "",
  searchResults: [],
  fineQuery: "",
  bhmValue: Number(localStorage.getItem("bhmValue") || 412000),
  settings: readSettings(),
  theme: localStorage.getItem("theme") || "light",
  authMode: "login",
};

const audioState = {
  ctx: null,
  master: null,
  water: null,
};

const content = document.querySelector("#content");
const title = document.querySelector("#viewTitle");
const backBtn = document.querySelector("#backBtn");
const sideNav = document.querySelector("#sideNav");
const bottomNav = document.querySelector("#bottomNav");
const loginBtn = document.querySelector("#loginBtn");
const logoutBtn = document.querySelector("#logoutBtn");
const adminBtn = document.querySelector("#adminBtn");
const themeBtn = document.querySelector("#themeBtn");
const toastHost = document.querySelector("#toastHost");
const authDialog = document.querySelector("#authDialog");
const authForm = document.querySelector("#authForm");
const authTitle = document.querySelector("#authTitle");
const authModeBtn = document.querySelector("#authModeBtn");
const authSubmit = document.querySelector("#authSubmit");
const authError = document.querySelector("#authError");
const fullNameWrap = document.querySelector("#fullNameWrap");

const navItems = [
  { key: "home", label: "Asosiy", icon: "grid" },
  { key: "signs", label: "Belgilar", icon: "sign" },
  { key: "search", label: "Qidirmoq", icon: "search" },
  { key: "settings", label: "Sozlamalar", icon: "settings" },
];

function icon(name) {
  const icons = {
    grid: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
    sign: '<path d="M12 3l7 7-7 7-7-7 7-7z"/><path d="M12 17v4M9 10h6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M16 16l4 4"/>',
    gavel: '<path d="M14 4l6 6M12 6l6 6M4 20h9M6 16l7-7M9 19l7-7"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .7.1 1l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 3.1h5l.3-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.6.1-1z"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.grid}</svg>`;
}

function showToast(message, type = "info") {
  if (!toastHost) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastHost.append(toast);
  window.setTimeout(() => toast.classList.add("show"), 20);
  window.setTimeout(() => {
    toast.classList.remove("show");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, 3200);
}

async function api(path, options = {}) {
  document.body.classList.add("is-loading");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  try {
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const response = await fetch(path, { ...options, headers });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(data?.detail || "So'rov bajarilmadi");
    }
    return data;
  } finally {
    document.body.classList.remove("is-loading");
  }
}

function setUser(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  updateAuthChrome();
  showToast("Profilga muvaffaqiyatli kirildi", "success");
}

function clearUser() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  updateAuthChrome();
  showToast("Profil sessiyasi yopildi", "info");
}

function updateAuthChrome() {
  loginBtn.classList.toggle("hidden", Boolean(state.user));
  logoutBtn.classList.toggle("hidden", !state.user);
  adminBtn.classList.toggle("hidden", !state.user?.is_admin);
}

function setView(nextView, nextTitle, renderer, push = true) {
  if (push && state.view !== nextView) {
    state.stack.push({ view: state.view, title: state.title, renderer: state.renderer });
  }
  state.view = nextView;
  state.title = nextTitle;
  state.renderer = renderer;
  title.textContent = nextTitle;
  document.body.classList.toggle("exam-mode", nextView === "quiz");
  content.classList.toggle("exam-content", nextView === "quiz");
  backBtn.classList.toggle("hidden", state.stack.length === 0);
  renderNav();
  try {
    renderer();
  } catch (error) {
    showToast(error.message || "Sahifani chizishda xatolik", "error");
    throw error;
  }
}

function goBack() {
  const previous = state.stack.pop();
  if (!previous) return;
  state.view = previous.view;
  state.title = previous.title;
  state.renderer = previous.renderer;
  title.textContent = previous.title;
  document.body.classList.toggle("exam-mode", state.view === "quiz");
  content.classList.toggle("exam-content", state.view === "quiz");
  backBtn.classList.toggle("hidden", state.stack.length === 0);
  renderNav();
  previous.renderer();
}

function renderNav() {
  const buttons = navItems
    .map(
      (item) => `<button class="nav-item ${state.view === item.key ? "active" : ""}" data-nav="${item.key}" type="button">
        ${icon(item.icon)}
        <span>${item.label}</span>
      </button>`,
    )
    .join("");
  sideNav.innerHTML = buttons;
  bottomNav.innerHTML = navItems
    .map(
      (item) => `<button class="${state.view === item.key ? "active" : ""}" data-nav="${item.key}" type="button">
        ${icon(item.icon)}
        <span>${item.label}</span>
      </button>`,
    )
    .join("");
}

function needLogin() {
  if (state.user) return false;
  openAuth("login");
  return true;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getQuizDuration(limit) {
  const questionCount = Number(limit || state.currentQuestions.length || 20);
  if (questionCount <= 1) return 10 * 60;
  return questionCount <= 20 ? 25 * 60 : questionCount <= 50 ? 60 * 60 : questionCount * 75;
}

function resetQuizClock(limit) {
  state.quizStartedAt = Date.now();
  state.quizDurationSec = getQuizDuration(limit);
  state.quizFinishing = false;
  if (state.quizTimer) clearInterval(state.quizTimer);
  state.quizTimer = null;
}

function getRemainingSeconds() {
  if (!state.quizStartedAt) return state.quizDurationSec;
  const elapsed = Math.floor((Date.now() - state.quizStartedAt) / 1000);
  return Math.max(0, state.quizDurationSec - elapsed);
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function updateQuizTimer() {
  const timer = document.querySelector("[data-quiz-timer]");
  if (!timer) return;
  const remaining = getRemainingSeconds();
  timer.textContent = formatTime(remaining);
  timer.classList.toggle("warning", remaining <= 5 * 60);
  if (remaining === 0 && state.view === "quiz" && !state.quizFinishing) finishQuiz().catch(console.error);
}

function ensureQuizTimer() {
  updateQuizTimer();
  if (state.quizTimer) return;
  state.quizTimer = setInterval(() => {
    if (state.view !== "quiz") {
      clearInterval(state.quizTimer);
      state.quizTimer = null;
      return;
    }
    updateQuizTimer();
  }, 1000);
}

function answerStatus(question) {
  const selected = state.selected.get(question.id);
  if (!selected) return "";
  const correctAnswer = question.answers.find((answer) => answer.is_correct || answer.id === question.correct_answer_id);
  return selected === correctAnswer?.id ? "correct" : "wrong";
}

function applySettings() {
  document.body.classList.toggle("large-text", state.settings.textSize === "large");
  document.body.classList.toggle("compact-mode", Boolean(state.settings.compact));
  document.body.classList.toggle("sound-on", Boolean(state.settings.sound));
  localStorage.setItem("appSettings", JSON.stringify(state.settings));
  updateAudioEnvironment();
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioState.ctx) {
    audioState.ctx = new AudioContextClass();
    audioState.master = audioState.ctx.createGain();
    audioState.master.gain.value = 0.42;
    audioState.master.connect(audioState.ctx.destination);
  }
  return audioState.ctx;
}

function stopWaterAmbience() {
  if (!audioState.water) return;
  audioState.water.nodes.forEach((node) => {
    try {
      node.stop?.();
    } catch {
      // Already stopped by the browser audio graph.
    }
    try {
      node.disconnect?.();
    } catch {
      // Detached nodes are harmless.
    }
  });
  audioState.water = null;
}

function startWaterAmbience() {
  if (!state.settings.sound || state.theme !== "glass" || audioState.water) return;
  const ctx = getAudioContext();
  if (!ctx || !audioState.master) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const bufferLength = ctx.sampleRate * 3;
  const buffer = ctx.createBuffer(1, bufferLength, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let index = 0; index < bufferLength; index += 1) {
    last = last * 0.985 + (Math.random() * 2 - 1) * 0.015;
    data[index] = last * 0.85;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 720;
  filter.Q.value = 0.7;

  const ambienceGain = ctx.createGain();
  ambienceGain.gain.value = 0.026;

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.075;

  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.016;

  const shimmer = ctx.createOscillator();
  shimmer.type = "sine";
  shimmer.frequency.value = 185;

  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.004;

  source.connect(filter);
  filter.connect(ambienceGain);
  ambienceGain.connect(audioState.master);
  lfo.connect(lfoGain);
  lfoGain.connect(ambienceGain.gain);
  shimmer.connect(shimmerGain);
  shimmerGain.connect(audioState.master);

  source.start();
  lfo.start();
  shimmer.start();
  audioState.water = { nodes: [source, filter, ambienceGain, lfo, lfoGain, shimmer, shimmerGain] };
}

function updateAudioEnvironment() {
  if (state.settings.sound && state.theme === "glass" && audioState.ctx) startWaterAmbience();
  else stopWaterAmbience();
}

function playUiSound(kind = "click") {
  if (!state.settings.sound) return;
  const ctx = getAudioContext();
  if (!ctx || !audioState.master) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const isPrimary = kind === "primary";
  const isError = kind === "error";

  osc.type = "sine";
  osc.frequency.setValueAtTime(isError ? 180 : isPrimary ? 520 : 360, now);
  osc.frequency.exponentialRampToValueAtTime(isError ? 120 : isPrimary ? 720 : 460, now + 0.11);
  filter.type = "lowpass";
  filter.frequency.value = isPrimary ? 1800 : 1300;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(isPrimary ? 0.055 : 0.035, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioState.master);
  osc.start(now);
  osc.stop(now + 0.18);
}

function handleSoundToggle(enabled) {
  state.settings.sound = enabled;
  applySettings();
  if (enabled) {
    getAudioContext()?.resume?.().catch(() => {});
    playUiSound("primary");
    startWaterAmbience();
    showToast("Ovoz yoqildi", "success");
  } else {
    stopWaterAmbience();
    showToast("Ovoz o'chirildi", "info");
  }
}

function themeLabel(mode = state.theme) {
  if (mode === "dark") return "Dark";
  if (mode === "glass") return "Liquid Glass";
  return "Light";
}

function applyTheme(mode = state.theme) {
  state.theme = ["light", "dark", "glass"].includes(mode) ? mode : "light";
  document.body.classList.toggle("dark", state.theme === "dark");
  document.body.classList.toggle("liquid-glass", state.theme === "glass");
  localStorage.setItem("theme", state.theme);
  themeBtn?.setAttribute("title", `Rang rejimi: ${themeLabel()}`);
  themeBtn?.setAttribute("aria-label", `Rang rejimi: ${themeLabel()}`);
  const icon = themeBtn?.querySelector(".sun-icon");
  if (icon) icon.dataset.mode = state.theme;
  updateAudioEnvironment();
}

function cycleTheme() {
  const nextTheme = state.theme === "light" ? "dark" : state.theme === "dark" ? "glass" : "light";
  applyTheme(nextTheme);
  showToast(`Rang rejimi: ${themeLabel()}`, "info");
}

function money(value) {
  return new Intl.NumberFormat("uz-UZ").format(Math.round(value || 0));
}

const fineItems = [
  { title: "Xavfsizlik kamarini taqmaslik", tag: "Kamar", multiplier: 0.5, note: "Haydovchi yoki yo'lovchilar xavfsizlik kamaridan foydalanmasa." },
  { title: "Svetoforning taqiqlovchi ishorasida o'tish", tag: "Svetofor", multiplier: 2, note: "Qizil chiroq yoki tartibga soluvchining taqiqlovchi ishorasi buzilganda." },
  { title: "Tezlikni 20 km/soatgacha oshirish", tag: "Tezlik", multiplier: 1, note: "Belgilangan tezlik me'yoridan kichik oshib ketish." },
  { title: "Tezlikni 20-40 km/soat oshirish", tag: "Tezlik", multiplier: 5, note: "Tezlik me'yoridan jiddiy oshib ketish." },
  { title: "Telefondan foydalanish", tag: "Chalg'ish", multiplier: 3, note: "Harakat vaqtida qo'lda telefon ishlatish." },
  { title: "Piyodaga yo'l bermaslik", tag: "Piyoda", multiplier: 2, note: "Piyodalar o'tish joyida ustunlik berilmaganda." },
  { title: "To'xtash yoki to'xtab turish qoidasini buzish", tag: "To'xtash", multiplier: 2, note: "Taqiqlangan joyda to'xtash yoki transport oqimiga xalal berish." },
  { title: "Hujjatsiz boshqarish", tag: "Hujjat", multiplier: 1, note: "Haydovchilik hujjatlarini yonida olib yurmaslik." },
];

function filteredFines() {
  const query = state.fineQuery.trim().toLowerCase();
  if (!query) return fineItems;
  return fineItems.filter((item) => `${item.title} ${item.tag} ${item.note}`.toLowerCase().includes(query));
}

async function loadHome() {
  const data = await api("/api/home");
  state.categories = data.categories.filter((item) => !["bilet-20", "bilet-50"].includes(item.slug));
  state.stats = data.stats;
  setView("home", "Asosiy", renderHome, false);
}

function renderHome() {
  content.innerHTML = `
    <div class="premium-hero">
      <div>
        <span class="hero-kicker">bek_avtotest platformasi</span>
        <h2>Haydovchilik imtihoniga premium tayyorgarlik</h2>
        <p>${state.stats.questions || 1235}+ test, biletlar, yo'l belgilari, qidiruv va natijalarni kuzatish bitta zamonaviy tizimda jamlangan.</p>
        <div class="hero-actions">
          <button class="primary-button" data-category="new-20" type="button">20 talik testni boshlash</button>
          <button class="secondary-button" data-nav="signs" type="button">Belgilar katalogi</button>
        </div>
      </div>
      <div class="stat-panel">
        <div class="stat-cell"><small>Savollar</small><strong>${state.stats.questions || 0}</strong><span>bazadagi testlar</span></div>
        <div class="stat-cell"><small>Biletlar</small><strong>${state.stats.tickets || 0}</strong><span>20/50 format</span></div>
        <div class="stat-cell"><small>Rejimlar</small><strong>${state.categories.length}</strong><span>faol bo'limlar</span></div>
        <div class="stat-cell"><small>Belgilar</small><strong>379</strong><span>vazifalari bilan</span></div>
      </div>
    </div>
    <div class="home-section-title">
      <div>
        <h3>Test modullari</h3>
        <p>Tezkor imtihon, mavzular va xato savollar uchun tayyor bo'limlar.</p>
      </div>
    </div>
    <div class="menu-list">
      ${state.categories
        .map(
          (item) => `<button class="menu-row" data-category="${item.slug}" type="button">
            <img src="${item.icon}" alt="" loading="lazy" />
            <span class="menu-copy">
              <strong>${item.title}</strong>
              <span class="menu-desc">${item.description || ""}</span>
            </span>
            <i class="chevron"></i>
          </button>`,
        )
        .join("")}
    </div>`;
}

async function openCategory(slug) {
  if (["new-20", "new-50", "bilet-20", "bilet-50"].includes(slug)) {
    const data = await api(`/api/tickets?category=${slug}`);
    state.currentTicketCategory = data.category;
    state.tickets = data.tickets;
    setView("tickets", data.category.title, renderTickets);
    return;
  }
  if (slug === "flagged") {
    if (needLogin()) return;
    await startQuiz("flagged", null, 50, "Xato savollarim");
    return;
  }
  if (slug === "topics") {
    await renderTopics();
    return;
  }
  if (["real-20", "marathon"].includes(slug)) {
    if (needLogin()) return;
    const limit = slug === "marathon" ? 50 : 20;
    const label = state.categories.find((item) => item.slug === slug)?.title || "Test";
    await startQuiz(slug, null, limit, label);
    return;
  }
  renderPlaceholder(slug);
}

function renderTickets() {
  content.innerHTML = `
    <div class="section-head tickets-head">
      <div>
        <h2>${escapeHtml(state.currentTicketCategory.title)}</h2>
        <p>${state.tickets.length} ta bilet. Har bir bilet ichida testlar ketma-ket taqsimlangan.</p>
      </div>
    </div>
    <div class="ticket-grid">
      ${state.tickets
        .map(
          (ticket) => `<button class="ticket-card" ${
            ticket.virtual
              ? `data-ticket-number="${ticket.number}" data-ticket-limit="${ticket.question_limit}" data-ticket-category="${state.currentTicketCategory.slug}"`
              : `data-ticket="${ticket.id}" data-ticket-limit="${ticket.question_limit || 50}"`
          } type="button">
            ${ticket.is_new ? '<span class="new-label">Yangi</span>' : ""}
            <span>${ticket.number}</span>
          </button>`,
        )
        .join("")}
    </div>`;
}

async function startQuiz(mode, ticketId = null, limit = 20, label = "Test") {
  if (needLogin()) return;
  state.lastMode = mode;
  state.lastTicketId = ticketId;
  state.lastTicketCategory = null;
  state.lastTicketNumber = null;
  state.lastLimit = limit;
  const qs = await api(`/api/questions?mode=${mode}&limit=${limit}${ticketId ? `&ticket_id=${ticketId}` : ""}`);
  state.currentQuestions = qs;
  state.currentIndex = 0;
  state.selected = new Map();
  resetQuizClock(qs.length || limit);
  setView("quiz", label, renderQuiz);
}

async function startTicketQuiz(categorySlug, ticketNumber, limit, label) {
  if (needLogin()) return;
  state.lastMode = "ticket";
  state.lastTicketId = null;
  state.lastTicketCategory = categorySlug;
  state.lastTicketNumber = ticketNumber;
  state.lastLimit = limit;
  const qs = await api(`/api/questions?mode=ticket&category=${categorySlug}&ticket_number=${ticketNumber}&limit=${limit}`);
  state.currentQuestions = qs;
  state.currentIndex = 0;
  state.selected = new Map();
  resetQuizClock(qs.length || limit);
  setView("quiz", label, renderQuiz);
}

async function startTopicQuiz(topic, count) {
  if (needLogin()) return;
  state.lastMode = "topic";
  state.lastTicketId = null;
  state.lastTicketCategory = null;
  state.lastTicketNumber = null;
  state.lastTopic = topic;
  state.lastLimit = count;
  const qs = await api(`/api/questions?mode=topic&topic=${encodeURIComponent(topic)}&limit=${count}`);
  state.currentQuestions = qs;
  state.currentIndex = 0;
  state.selected = new Map();
  resetQuizClock(qs.length || count);
  setView("quiz", topic, renderQuiz);
}

async function startQuestionReview(questionId) {
  if (needLogin()) return;
  const question = state.searchResults.find((item) => item.id === Number(questionId));
  if (!question) return;
  state.lastMode = "review";
  state.lastTicketId = null;
  state.lastTicketCategory = null;
  state.lastTicketNumber = null;
  state.lastTopic = null;
  state.currentQuestions = [question];
  state.currentIndex = 0;
  state.selected = new Map();
  resetQuizClock(1);
  setView("quiz", "Qidiruv natijasi", renderQuiz);
}

function renderQuiz() {
  if (!state.currentQuestions.length) {
    content.innerHTML = `<div class="empty-state"><div><h2>Savollar topilmadi</h2><p>Admin paneldan savol qo'shing yoki importni ishga tushiring.</p></div></div>`;
    return;
  }
  const question = state.currentQuestions[state.currentIndex];
  const selected = state.selected.get(question.id);
  const hasAnswered = Boolean(selected);
  const correctAnswer = question.answers.find((answer) => answer.is_correct || answer.id === question.correct_answer_id);
  const selectedAnswer = question.answers.find((answer) => answer.id === selected);
  const isCorrect = hasAnswered && selectedAnswer?.id === correctAnswer?.id;
  const isFirstQuestion = state.currentIndex === 0;
  const isLastQuestion = state.currentIndex === state.currentQuestions.length - 1;
  content.innerHTML = `
    <section class="exam-screen">
      <div class="exam-toolbar">
        <div class="exam-timer" aria-label="Qolgan vaqt"><span data-quiz-timer>${formatTime(getRemainingSeconds())}</span></div>
        <div class="exam-numbers" aria-label="Savollar ro'yxati">
          <button class="exam-step edge" data-action="prev" type="button" ${isFirstQuestion ? "disabled" : ""} aria-label="Oldingi savol">&laquo;</button>
          ${state.currentQuestions
            .map((item, index) => {
              const status = answerStatus(item);
              const active = index === state.currentIndex ? "active" : "";
              return `<button class="exam-step ${status} ${active}" data-question-index="${index}" type="button">${index + 1}</button>`;
            })
            .join("")}
          <button class="exam-step edge" data-action="next" type="button" ${isLastQuestion ? "disabled" : ""} aria-label="Keyingi savol">&raquo;</button>
        </div>
        <button class="finish-exam" data-action="finish" type="button">TESTNI<br>YAKUNLASH</button>
      </div>
      <div class="exam-meta-line">Savol ${state.currentIndex + 1} / ${state.currentQuestions.length}</div>
      <div class="exam-question-line">
        <span>Savol ${state.currentIndex + 1} / ${state.currentQuestions.length}</span>
        <h2>${escapeHtml(question.text)}</h2>
      </div>
      ${
        hasAnswered
          ? `<div class="answer-feedback exam-status-feedback ${isCorrect ? "ok" : "bad"}">
              <strong>${isCorrect ? "To'g'ri javob!" : "Xato javob."}</strong>
              <p>${escapeHtml(question.explanation || "Bu savol uchun izoh hali qo'shilmagan.")}</p>
            </div>`
          : ""
      }
      <div class="exam-workspace ${question.image ? "" : "no-image"}">
        <div class="exam-media">
          ${
            question.image
              ? `<img class="question-image" src="${question.image}" alt="" />`
              : `<div class="question-image empty">Rasm mavjud emas</div>`
          }
        </div>
        <div class="exam-answers">
          ${question.answers
            .map((answer, index) => {
              const answerIsCorrect = answer.is_correct || answer.id === correctAnswer?.id;
              const statusClass = hasAnswered
                ? answerIsCorrect
                  ? "correct"
                  : answer.id === selected
                    ? "wrong"
                    : ""
                : selected === answer.id
                  ? "selected"
                  : "";
              return `<button class="answer-option ${statusClass}" data-answer="${answer.id}" type="button" ${hasAnswered ? "disabled" : ""}>
                <span class="answer-letter">${String.fromCharCode(65 + index)}</span>
                <span>${escapeHtml(answer.text)}</span>
              </button>`;
            })
            .join("")}
        </div>
      </div>
      <div class="exam-bottom-actions" aria-label="Savollar bo'yicha harakatlanish">
        <button class="exam-nav-button secondary" data-action="prev" type="button" ${isFirstQuestion ? "disabled" : ""}>
          <span aria-hidden="true">&lsaquo;</span>
          Oldingi
        </button>
        <span class="exam-current-count">${state.currentIndex + 1} / ${state.currentQuestions.length}</span>
        <button class="exam-nav-button primary" data-action="next" type="button" ${isLastQuestion ? "disabled" : ""}>
          Keyingi
          <span aria-hidden="true">&rsaquo;</span>
        </button>
      </div>
    </section>`;
  ensureQuizTimer();
  syncQuestionStepper();
}

function syncQuestionStepper() {
  const stepper = document.querySelector(".exam-numbers");
  const active = document.querySelector(".exam-step.active");
  if (!stepper || !active) return;
  requestAnimationFrame(() => {
    if (state.currentIndex === 0) {
      stepper.scrollLeft = 0;
      return;
    }
    const target = active.offsetLeft - stepper.clientWidth / 2 + active.clientWidth / 2;
    stepper.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  });
}

async function finishQuiz() {
  if (state.quizFinishing) return;
  state.quizFinishing = true;
  if (state.quizTimer) {
    clearInterval(state.quizTimer);
    state.quizTimer = null;
  }
  const answers = state.currentQuestions.map((question) => ({
    question_id: question.id,
    selected_answer_id: state.selected.get(question.id) || null,
  }));
  const result = await api("/api/attempts", {
    method: "POST",
    body: JSON.stringify({ mode: state.lastMode, ticket_id: state.lastTicketId, answers }),
  });
  setView("result", "Natija", () => renderResult(result));
}

function renderResult(result) {
  const wrong = result.wrong ?? result.details?.filter((item) => item.selected_answer_id && !item.is_correct).length ?? 0;
  const unanswered = result.unanswered ?? result.details?.filter((item) => !item.selected_answer_id).length ?? 0;
  const percent = result.total ? Math.round((result.correct / result.total) * 100) : 0;
  content.innerHTML = `
    <div class="quiz-card">
      <h2>Natijangiz: ${percent}%</h2>
      <div class="result-grid">
        <div class="stat-cell"><strong>${result.total}</strong><span>Jami</span></div>
        <div class="stat-cell"><strong>${result.correct}</strong><span>To'g'ri</span></div>
        <div class="stat-cell"><strong>${wrong}</strong><span>Xato</span></div>
        <div class="stat-cell"><strong>${unanswered}</strong><span>Belgilanmagan</span></div>
      </div>
      <p class="muted">Faqat noto'g'ri belgilangan javoblar "Xato belgilagan savollarim" bo'limiga qo'shiladi. Belgilanmagan savollar alohida hisoblanadi.</p>
      <div class="quiz-actions">
        <button class="secondary-button" data-action="home" type="button">Asosiyga qaytish</button>
        <button class="primary-button" data-action="retry" type="button">Qayta ishlash</button>
      </div>
    </div>`;
}

function renderPlaceholder(kind) {
  const labels = {
    signs: "Yo'l belgilari katalogi",
    search: "Qidiruv",
    fines: "Jarima va ballari",
    settings: "Sozlamalar",
    topics: "Mavzulashtirilgan testlar",
  };
  setView(kind, labels[kind] || "Bo'lim", () => {
    content.innerHTML = `<div class="empty-state"><div><h2>${labels[kind] || "Bo'lim"}</h2><p>Bu bo'lim uchun sahifa tayyor. Admin paneldan kontent qo'shilganda shu yerda ko'rinadi.</p></div></div>`;
  });
}

async function renderTopics() {
  const data = await api("/api/topics");
  state.topics = data.topics;
  setView("topics", "Mavzulashtirilgan testlar", () => {
    content.innerHTML = `
      <section class="tool-panel">
        <div class="section-head">
          <div>
            <h2>Mavzular bo'yicha mashq</h2>
            <p>1235 ta savol mavzularga ajratilgan. Mavzuni tanlang, barcha savollar ketma-ket ochiladi.</p>
          </div>
        </div>
        <div class="topic-grid">
          ${state.topics
            .map(
              (item) => `<button class="topic-card" data-topic="${escapeHtml(item.topic)}" data-topic-count="${item.count}" type="button">
                <strong>${escapeHtml(item.topic)}</strong>
                <span>${item.count} ta savol</span>
              </button>`,
            )
            .join("")}
        </div>
      </section>`;
  });
}

async function renderSigns() {
  if (!state.signs.length) {
    const data = await api("/api/signs");
    state.signs = data.signs;
    state.signGroups = data.groups;
  }
  const query = state.signFilter.trim().toLowerCase();
  const rows = state.signs.filter((item) => {
    const matchesGroup = state.signGroup === "all" || item.group === state.signGroup;
    const haystack = `${item.code} ${item.title} ${item.group} ${item.purpose || ""}`.toLowerCase();
    return matchesGroup && (!query || haystack.includes(query));
  });
  setView("signs", "Belgilar", () => {
    content.innerHTML = `
      <section class="tool-panel">
        <div class="section-head">
          <div>
            <h2>Yo'l belgilari katalogi</h2>
            <p>${state.signs.length} ta belgi rasmi, guruh va kod bo'yicha qidiruv.</p>
          </div>
          <input class="search-input" data-sign-search placeholder="Belgi kodi yoki guruh nomi" value="${escapeHtml(state.signFilter)}" />
        </div>
        <div class="filter-row">
          <button class="filter-chip ${state.signGroup === "all" ? "active" : ""}" data-sign-group="all" type="button">Hammasi</button>
          ${state.signGroups
            .map(
              (group) => `<button class="filter-chip ${state.signGroup === group.title ? "active" : ""}" data-sign-group="${escapeHtml(group.title)}" type="button">
                ${escapeHtml(group.title)} · ${group.count}
              </button>`,
            )
            .join("")}
        </div>
        <div class="sign-grid">
          ${rows
            .map(
              (item) => `<article class="sign-card">
                <img src="${item.image}" alt="${escapeHtml(item.title)}" loading="lazy" />
                <strong>${escapeHtml(item.title)}</strong>
                <span>Belgi ${escapeHtml(item.code)} · ${escapeHtml(item.group)}</span>
                <p>${escapeHtml(item.purpose || "Belgi yo'l harakati tartibini bildiradi.")}</p>
              </article>`,
            )
            .join("")}
        </div>
      </section>`;
  });
}

async function runSearch(query = state.searchQuery) {
  state.searchQuery = query;
  if (query.trim().length < 2) {
    state.searchResults = [];
    renderSearch();
    return;
  }
  const data = await api(`/api/search?q=${encodeURIComponent(query)}&limit=60`);
  state.searchResults = data.results;
  renderSearch();
}

function renderSearch() {
  setView("search", "Qidirmoq", () => {
    content.innerHTML = `
      <section class="tool-panel">
        <div class="section-head">
          <div>
            <h2>Savollar ichidan qidirish</h2>
            <p>Savol, javob, mavzu yoki izoh matni bo'yicha qidiring.</p>
          </div>
          <input class="search-input" data-question-search placeholder="Masalan: svetofor, tezlik, piyoda" value="${escapeHtml(state.searchQuery)}" autofocus />
        </div>
        <div class="search-summary">${state.searchQuery.trim().length < 2 ? "Kamida 2 ta belgi kiriting." : `${state.searchResults.length} ta natija topildi.`}</div>
        <div class="result-list">
          ${state.searchResults
            .map(
              (question) => `<button class="result-row" data-open-question="${question.id}" type="button">
                <span class="result-id">#${question.id}</span>
                <span>
                  <strong>${escapeHtml(question.text)}</strong>
                  <small>${escapeHtml(question.topic || "Mavzusiz")} · ${question.answers.length} ta javob</small>
                </span>
              </button>`,
            )
            .join("")}
        </div>
      </section>`;
  });
}

function renderFines() {
  const rows = filteredFines();
  setView("fines", "Jarima va ballari", () => {
    content.innerHTML = `
      <section class="tool-panel">
        <div class="section-head">
          <div>
            <h2>Jarima kalkulyatori</h2>
            <p>BHM qiymatini kiriting, kartalardagi miqdor avtomatik hisoblanadi.</p>
          </div>
          <input class="search-input" data-fine-search placeholder="Qoida bo'yicha qidirish" value="${escapeHtml(state.fineQuery)}" />
        </div>
        <label class="settings-row">
          <span><strong>BHM qiymati</strong><small>So'mda kiriting</small></span>
          <input class="number-input" data-bhm-input type="number" min="1" step="1000" value="${state.bhmValue}" />
        </label>
        <div class="fine-list">
          ${rows
            .map(
              (item) => `<article class="fine-card">
                <div>
                  <strong>${escapeHtml(item.title)}</strong>
                  <span>${escapeHtml(item.tag)}</span>
                  <p>${escapeHtml(item.note)}</p>
                </div>
                <div class="fine-amount">
                  <strong>${item.multiplier} BHM</strong>
                  <span>${money(item.multiplier * state.bhmValue)} so'm</span>
                </div>
              </article>`,
            )
            .join("")}
        </div>
      </section>`;
  });
}

function renderSettings() {
  setView("settings", "Sozlamalar", () => {
    content.innerHTML = `
      <section class="tool-panel">
        <div class="section-head">
          <div>
            <h2>Ilova sozlamalari</h2>
            <p>Test o'qish qulayligi, rang rejimi va profil holatini boshqaring.</p>
          </div>
        </div>
        <div class="settings-list">
          <label class="settings-row">
            <span><strong>Matn o'lchami</strong><small>Savol va javoblar kattaligi</small></span>
            <select data-setting="textSize">
              <option value="normal" ${state.settings.textSize === "normal" ? "selected" : ""}>Oddiy</option>
              <option value="large" ${state.settings.textSize === "large" ? "selected" : ""}>Katta</option>
            </select>
          </label>
          <label class="settings-row">
            <span><strong>Zich rejim</strong><small>Bilet va kataloglarda ixcham ko'rinish</small></span>
            <input data-setting="compact" type="checkbox" ${state.settings.compact ? "checked" : ""} />
          </label>
          <label class="settings-row sound-row">
            <span><strong>Ovoz effektlari</strong><small>Knopka bosilganda yumshoq signal, Liquid Glass rejimida suv shildirashi.</small></span>
            <input data-setting="sound" type="checkbox" ${state.settings.sound ? "checked" : ""} />
          </label>
          <div class="settings-row">
            <span><strong>Rang rejimi</strong><small>Hozir: ${themeLabel()}. Light, Dark va Liquid Glass mavjud.</small></span>
            <button class="secondary-button" data-action="toggle-theme" type="button">${themeLabel()} rejimini almashtirish</button>
          </div>
          <div class="settings-row">
            <span><strong>Profil</strong><small>${state.user ? escapeHtml(state.user.username) : "Kirish qilinmagan"}</small></span>
            <button class="secondary-button" data-action="${state.user ? "logout-settings" : "login-settings"}" type="button">${state.user ? "Chiqish" : "Kirish"}</button>
          </div>
        </div>
      </section>`;
  });
}

async function renderAdmin() {
  const [stats, meta, questions] = await Promise.all([
    api("/api/admin/stats"),
    api("/api/admin/categories"),
    api("/api/admin/questions"),
  ]);
  content.innerHTML = `
    <section class="admin-panel">
      <div class="admin-grid">
        <div class="stat-cell"><strong>${stats.users}</strong><span>Foydalanuvchi</span></div>
        <div class="stat-cell"><strong>${stats.questions}</strong><span>Savol</span></div>
        <div class="stat-cell"><strong>${stats.tickets}</strong><span>Bilet</span></div>
        <div class="stat-cell"><strong>${stats.attempts}</strong><span>Urinish</span></div>
      </div>
      <form id="questionForm" class="admin-form">
        <textarea name="text" placeholder="Savol matni" required></textarea>
        <input name="answers" placeholder="Javoblar: A | B | C | D" required />
        <input name="correct_index" type="number" min="0" value="0" placeholder="To'g'ri javob indeksi" />
        <input name="topic" placeholder="Mavzu" />
        <input name="image" placeholder="/drawables/i100_3.jpg" />
        <select name="category_id">${meta.categories.map((cat) => `<option value="${cat.id}">${cat.title}</option>`).join("")}</select>
        <select name="ticket_id"><option value="">Biletsiz</option>${meta.tickets.map((ticket) => `<option value="${ticket.id}">${ticket.title}</option>`).join("")}</select>
        <button class="primary-button" type="submit">Savol qo'shish</button>
      </form>
      <div class="question-table">
        ${questions
          .slice(0, 30)
          .map(
            (question) => `<div class="question-row">
              <span>${question.text}</span>
              <button class="danger-button" data-delete-question="${question.id}" type="button">O'chirish</button>
            </div>`,
          )
          .join("")}
      </div>
    </section>`;
}

function openAuth(mode = "login") {
  state.authMode = mode;
  authError.textContent = "";
  const isRegister = mode === "register";
  authTitle.textContent = isRegister ? "Ro'yxatdan o'tish" : "Kirish";
  authSubmit.textContent = isRegister ? "Ro'yxatdan o'tish" : "Kirish";
  authModeBtn.textContent = isRegister ? "Login orqali kirish" : "Ro'yxatdan o'tish";
  fullNameWrap.classList.toggle("hidden", !isRegister);
  authDialog.showModal();
}

document.addEventListener("pointerdown", (event) => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  const kind = button.matches(".primary-button, .exam-nav-button.primary, .nav-item.active") ? "primary" : "click";
  playUiSound(kind);
  updateAudioEnvironment();
});

document.addEventListener("click", async (event) => {
  const nav = event.target.closest("[data-nav]")?.dataset.nav;
  if (nav) {
    if (nav === "home") {
      state.stack = [];
      await loadHome();
    } else if (nav === "signs") {
      await renderSigns();
    } else if (nav === "search") {
      renderSearch();
    } else if (nav === "fines") {
      renderFines();
    } else if (nav === "settings") {
      renderSettings();
    } else {
      renderPlaceholder(nav);
    }
  }

  const category = event.target.closest("[data-category]")?.dataset.category;
  if (category) await openCategory(category);

  const ticketId = event.target.closest("[data-ticket]")?.dataset.ticket;
  if (ticketId) {
    const ticketButton = event.target.closest("[data-ticket]");
    await startQuiz("ticket", Number(ticketId), Number(ticketButton.dataset.ticketLimit || 50), `Bilet ${ticketButton.textContent.trim()}`);
  }

  const virtualTicketNumber = event.target.closest("[data-ticket-number]")?.dataset.ticketNumber;
  if (virtualTicketNumber) {
    const ticketButton = event.target.closest("[data-ticket-number]");
    const categorySlug = ticketButton.dataset.ticketCategory;
    const limit = Number(ticketButton.dataset.ticketLimit || 20);
    await startTicketQuiz(categorySlug, Number(virtualTicketNumber), limit, `Bilet ${virtualTicketNumber}`);
  }

  const topic = event.target.closest("[data-topic]")?.dataset.topic;
  if (topic) {
    const count = Number(event.target.closest("[data-topic]").dataset.topicCount || 20);
    await startTopicQuiz(topic, count);
  }

  const questionId = event.target.closest("[data-open-question]")?.dataset.openQuestion;
  if (questionId) await startQuestionReview(questionId);

  const signGroup = event.target.closest("[data-sign-group]")?.dataset.signGroup;
  if (signGroup) {
    state.signGroup = signGroup;
    await renderSigns();
  }

  const answerId = event.target.closest("[data-answer]")?.dataset.answer;
  if (answerId) {
    const question = state.currentQuestions[state.currentIndex];
    if (state.selected.has(question.id)) return;
    state.selected.set(question.id, Number(answerId));
    const status = answerStatus(question);
    showToast(status === "correct" ? "To'g'ri javob" : "Xato javob, to'g'ri javob ko'rsatildi", status === "correct" ? "success" : "error");
    renderQuiz();
  }

  const questionIndex = event.target.closest("[data-question-index]")?.dataset.questionIndex;
  if (questionIndex !== undefined) {
    state.currentIndex = Number(questionIndex);
    renderQuiz();
  }

  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "prev") {
    state.currentIndex = Math.max(0, state.currentIndex - 1);
    renderQuiz();
  }
  if (action === "next") {
    if (state.currentIndex === state.currentQuestions.length - 1) await finishQuiz();
    else {
      state.currentIndex += 1;
      renderQuiz();
    }
  }
  if (action === "finish") await finishQuiz();
  if (action === "flag") {
    const question = state.currentQuestions[state.currentIndex];
    await api(`/api/flagged/${question.id}`, { method: "POST", body: "{}" });
    showToast("Savol belgilanganlar ro'yxatiga yangilandi", "success");
  }
  if (action === "home") {
    state.stack = [];
    await loadHome();
  }
  if (action === "retry") {
    if (state.lastTicketCategory && state.lastTicketNumber) {
      await startTicketQuiz(state.lastTicketCategory, state.lastTicketNumber, state.lastLimit, title.textContent);
    } else if (state.lastTopic) {
      await startTopicQuiz(state.lastTopic, state.lastLimit);
    } else {
      await startQuiz(state.lastMode, state.lastTicketId, state.currentQuestions.length, title.textContent);
    }
  }
  if (action === "toggle-theme") {
    cycleTheme();
    renderSettings();
  }
  if (action === "login-settings") openAuth("login");
  if (action === "logout-settings") {
    clearUser();
    renderSettings();
  }

  const deleteQuestion = event.target.closest("[data-delete-question]")?.dataset.deleteQuestion;
  if (deleteQuestion) {
    await api(`/api/admin/questions/${deleteQuestion}`, { method: "DELETE" });
    showToast("Savol o'chirildi", "success");
    await renderAdmin();
  }
});

let searchTimer = null;
let signTimer = null;
let fineTimer = null;
document.addEventListener("input", (event) => {
  const questionSearch = event.target.closest("[data-question-search]");
  if (questionSearch) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(questionSearch.value).catch(console.error), 220);
  }

  const signSearch = event.target.closest("[data-sign-search]");
  if (signSearch) {
    state.signFilter = signSearch.value;
    clearTimeout(signTimer);
    signTimer = setTimeout(() => renderSigns().catch(console.error), 220);
  }

  const fineSearch = event.target.closest("[data-fine-search]");
  if (fineSearch) {
    state.fineQuery = fineSearch.value;
    clearTimeout(fineTimer);
    fineTimer = setTimeout(renderFines, 220);
  }

  const bhmInput = event.target.closest("[data-bhm-input]");
  if (bhmInput) {
    state.bhmValue = Number(bhmInput.value || 0);
    localStorage.setItem("bhmValue", String(state.bhmValue));
  }
});

document.addEventListener("change", (event) => {
  const setting = event.target.closest("[data-setting]");
  if (setting) {
    const key = setting.dataset.setting;
    if (key === "sound") {
      handleSoundToggle(setting.checked);
      renderSettings();
      return;
    }
    state.settings[key] = setting.type === "checkbox" ? setting.checked : setting.value;
    applySettings();
    renderSettings();
    return;
  }

  const bhmInput = event.target.closest("[data-bhm-input]");
  if (bhmInput) {
    state.bhmValue = Number(bhmInput.value || 0);
    localStorage.setItem("bhmValue", String(state.bhmValue));
    renderFines();
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const message = event.reason?.message || "Kutilmagan xatolik yuz berdi";
  showToast(message, "error");
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.textContent = "";
  const form = new FormData(authForm);
  const payload = {
    username: String(form.get("username") || ""),
    password: String(form.get("password") || ""),
  };
  if (state.authMode === "register") payload.full_name = String(form.get("full_name") || "");
  try {
    const data = await api(`/api/auth/${state.authMode}`, { method: "POST", body: JSON.stringify(payload) });
    setUser(data.token, data.user);
    authDialog.close();
    authForm.reset();
  } catch (error) {
    authError.textContent = error.message;
    showToast(error.message, "error");
  }
});

content.addEventListener("submit", async (event) => {
  const form = event.target.closest("#questionForm");
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  const answers = String(data.get("answers") || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
  await api("/api/admin/questions", {
    method: "POST",
    body: JSON.stringify({
      text: String(data.get("text") || ""),
      answers,
      correct_index: Number(data.get("correct_index") || 0),
      topic: String(data.get("topic") || ""),
      image: String(data.get("image") || "") || null,
      category_id: Number(data.get("category_id") || 0) || null,
      ticket_id: Number(data.get("ticket_id") || 0) || null,
    }),
  });
  showToast("Savol qo'shildi", "success");
  await renderAdmin();
});

loginBtn.addEventListener("click", () => openAuth("login"));
logoutBtn.addEventListener("click", async () => {
  clearUser();
  state.stack = [];
  await loadHome();
});
adminBtn.addEventListener("click", () => setView("admin", "Admin panel", renderAdmin));
backBtn.addEventListener("click", goBack);
authModeBtn.addEventListener("click", () => openAuth(state.authMode === "login" ? "register" : "login"));
document.querySelector(".modal-close").addEventListener("click", () => authDialog.close());
themeBtn.addEventListener("click", cycleTheme);

applyTheme();
applySettings();
updateAuthChrome();
renderNav();
loadHome().catch((error) => {
  content.innerHTML = `<div class="empty-state"><div><h2>Xatolik</h2><p>${error.message}</p></div></div>`;
  showToast(error.message, "error");
});
