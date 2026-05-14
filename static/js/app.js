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
  settings: JSON.parse(localStorage.getItem("appSettings") || '{"textSize":"normal","compact":false}'),
  authMode: "login",
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

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.detail || "So'rov bajarilmadi");
  }
  return data;
}

function setUser(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  updateAuthChrome();
}

function clearUser() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  updateAuthChrome();
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
  renderer();
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
  localStorage.setItem("appSettings", JSON.stringify(state.settings));
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
    <div class="hero-strip">
      <div>
        <h2>Avtomaktab imtihoniga tayyorlanish</h2>
        <p>Testlar, biletlar, mavzulashtirilgan mashqlar va xato savollar bitta joyda. Login orqali natijalar saqlanadi, admin panel orqali savollar boshqariladi.</p>
      </div>
      <div class="stat-panel">
        <div class="stat-cell"><strong>${state.stats.questions || 0}</strong><span>Savollar</span></div>
        <div class="stat-cell"><strong>${state.stats.tickets || 0}</strong><span>Biletlar</span></div>
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
          <button class="exam-step edge" data-action="prev" type="button" ${isFirstQuestion ? "disabled" : ""}>«</button>
          ${state.currentQuestions
            .map((item, index) => {
              const status = answerStatus(item);
              const active = index === state.currentIndex ? "active" : "";
              return `<button class="exam-step ${status} ${active}" data-question-index="${index}" type="button">${index + 1}</button>`;
            })
            .join("")}
          <button class="exam-step edge" data-action="next" type="button" ${isLastQuestion ? "disabled" : ""}>»</button>
        </div>
        <button class="finish-exam" data-action="finish" type="button">TESTNI<br>YAKUNLASH</button>
      </div>
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
          <span aria-hidden="true">‹</span>
          Oldingi
        </button>
        <span class="exam-current-count">${state.currentIndex + 1} / ${state.currentQuestions.length}</span>
        <button class="exam-nav-button primary" data-action="next" type="button" ${isLastQuestion ? "disabled" : ""}>
          Keyingi
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </section>`;
  ensureQuizTimer();
  document.querySelector(".exam-step.active")?.scrollIntoView({ inline: "center", block: "nearest" });
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
          <div class="settings-row">
            <span><strong>Rang rejimi</strong><small>Yorug' yoki qorong'i interfeys</small></span>
            <button class="secondary-button" data-action="toggle-theme" type="button">Almashtirish</button>
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
    themeBtn.click();
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
themeBtn.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
});

if (localStorage.getItem("theme") === "dark") document.body.classList.add("dark");
applySettings();
updateAuthChrome();
renderNav();
loadHome().catch((error) => {
  content.innerHTML = `<div class="empty-state"><div><h2>Xatolik</h2><p>${error.message}</p></div></div>`;
});
