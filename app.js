const subjects = ["전체", "측량학", "수리학·수문학", "토질역학", "응용역학", "철근콘크리트", "상하수도"];
const storageKey = "civil-engineer-flashcards-v1";
const progressKey = "civil-engineer-progress-v1";

const sampleCards = [
  {
    id: crypto.randomUUID(),
    subject: "수리학·수문학",
    front: "비에너지 공식",
    back: "\\[ E = h + \\alpha \\frac{Q^2}{2 g A^2} \\]",
    box: 0,
    due: todayISO(),
    seen: 0
  },
  {
    id: crypto.randomUUID(),
    subject: "토질역학",
    front: "간극비와 공극률",
    back: "\\[ e = \\frac{V_v}{V_s}, \\quad n = \\frac{V_v}{V} = \\frac{e}{1+e} \\]",
    box: 0,
    due: todayISO(),
    seen: 0
  },
  {
    id: crypto.randomUUID(),
    subject: "철근콘크리트",
    front: "철근비",
    back: "\\[ \\rho = \\frac{A_s}{bd} \\]\\n인장철근 단면적을 유효단면적으로 나눈 값",
    box: 0,
    due: todayISO(),
    seen: 0
  }
];

const state = {
  cards: loadCards(),
  selectedSubject: "전체",
  currentId: null,
  flipped: false,
  editingId: null,
  progress: loadProgress(),
  installPrompt: null
};

const el = {
  activeSubject: document.querySelector("#activeSubject"),
  dueCount: document.querySelector("#dueCount"),
  flashcard: document.querySelector("#flashcard"),
  cardLabel: document.querySelector("#cardLabel"),
  cardText: document.querySelector("#cardText"),
  againBtn: document.querySelector("#againBtn"),
  knowBtn: document.querySelector("#knowBtn"),
  todayCount: document.querySelector("#todayCount"),
  progressBar: document.querySelector("#progressBar"),
  subjectTabs: document.querySelector("#subjectTabs"),
  newCardBtn: document.querySelector("#newCardBtn"),
  editCardBtn: document.querySelector("#editCardBtn"),
  deleteCardBtn: document.querySelector("#deleteCardBtn"),
  editorPanel: document.querySelector("#editorPanel"),
  editorTitle: document.querySelector("#editorTitle"),
  closeEditorBtn: document.querySelector("#closeEditorBtn"),
  subjectInput: document.querySelector("#subjectInput"),
  frontInput: document.querySelector("#frontInput"),
  backInput: document.querySelector("#backInput"),
  formulaPreview: document.querySelector("#formulaPreview"),
  saveCardBtn: document.querySelector("#saveCardBtn"),
  seedBtn: document.querySelector("#seedBtn"),
  cardTotal: document.querySelector("#cardTotal"),
  cardList: document.querySelector("#cardList"),
  installBtn: document.querySelector("#installBtn")
};

init();

function init() {
  normalizeProgressDate();
  renderSubjectControls();
  bindEvents();
  if (!state.cards.length) {
    state.cards = sampleCards;
    saveCards();
  }
  chooseNextCard();
  render();
  registerServiceWorker();
}

function bindEvents() {
  el.flashcard.addEventListener("click", () => {
    state.flipped = !state.flipped;
    renderCard();
  });

  el.knowBtn.addEventListener("click", () => reviewCurrent(true));
  el.againBtn.addEventListener("click", () => reviewCurrent(false));
  el.newCardBtn.addEventListener("click", () => openEditor());
  el.editCardBtn.addEventListener("click", () => {
    const card = currentCard();
    if (card) openEditor(card);
  });
  el.deleteCardBtn.addEventListener("click", deleteCurrentCard);
  el.closeEditorBtn.addEventListener("click", () => el.editorPanel.hidden = true);
  el.saveCardBtn.addEventListener("click", saveEditorCard);
  el.seedBtn.addEventListener("click", seedSamples);
  el.backInput.addEventListener("input", updatePreview);

  document.querySelectorAll("[data-insert]").forEach((button) => {
    button.addEventListener("click", () => insertAtCursor(el.backInput, button.dataset.insert));
  });

  let startX = null;
  el.flashcard.addEventListener("touchstart", (event) => {
    startX = event.changedTouches[0].clientX;
  }, { passive: true });
  el.flashcard.addEventListener("touchend", (event) => {
    if (startX === null) return;
    const diff = event.changedTouches[0].clientX - startX;
    if (Math.abs(diff) > 70) reviewCurrent(diff > 0);
    startX = null;
  }, { passive: true });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    el.installBtn.hidden = false;
  });

  el.installBtn.addEventListener("click", async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    el.installBtn.hidden = true;
  });
}

function renderSubjectControls() {
  el.subjectTabs.innerHTML = "";
  el.subjectInput.innerHTML = "";
  subjects.forEach((subject) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.textContent = subject;
    tab.addEventListener("click", () => {
      state.selectedSubject = subject;
      chooseNextCard();
      render();
    });
    el.subjectTabs.append(tab);

    if (subject !== "전체") {
      const option = document.createElement("option");
      option.value = subject;
      option.textContent = subject;
      el.subjectInput.append(option);
    }
  });
}

function render() {
  renderTabs();
  renderCard();
  renderProgress();
  renderList();
}

function renderTabs() {
  [...el.subjectTabs.children].forEach((button) => {
    button.classList.toggle("active", button.textContent === state.selectedSubject);
  });
  el.activeSubject.textContent = state.selectedSubject === "전체" ? "전체 과목" : state.selectedSubject;
}

function renderCard() {
  const card = currentCard();
  el.cardText.classList.toggle("back", state.flipped);
  if (!card) {
    el.cardLabel.textContent = "대기";
    el.cardText.textContent = "표시할 카드가 없습니다. 새 카드를 추가해 주세요.";
    el.knowBtn.disabled = true;
    el.againBtn.disabled = true;
    return;
  }

  el.knowBtn.disabled = false;
  el.againBtn.disabled = false;
  el.cardLabel.textContent = state.flipped ? "뒷면" : "앞면";
  el.cardText.innerHTML = state.flipped ? withMath(card.back) : escapeHTML(card.front);
  typeset(el.cardText);
}

function renderProgress() {
  const due = filteredCards().filter(isDue).length;
  const total = filteredCards().length || 1;
  const learned = state.progress.count;
  el.dueCount.textContent = `오늘 복습 ${due}장`;
  el.todayCount.textContent = `${learned}장`;
  el.progressBar.style.width = `${Math.min(100, Math.round((learned / Math.max(total, 5)) * 100))}%`;
}

function renderList() {
  const cards = filteredCards();
  el.cardTotal.textContent = `${cards.length}장`;
  el.cardList.innerHTML = "";
  if (!cards.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "이 과목에는 아직 카드가 없습니다. 자주 틀리는 공식부터 하나씩 넣어 보세요.";
    el.cardList.append(empty);
    return;
  }

  cards.forEach((card) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "list-item";
    item.classList.toggle("active", card.id === state.currentId);
    item.innerHTML = `<strong>${escapeHTML(card.front)}</strong><span>${escapeHTML(card.subject)} · 복습일 ${card.due}</span>`;
    item.addEventListener("click", () => {
      state.currentId = card.id;
      state.flipped = false;
      render();
    });
    el.cardList.append(item);
  });
}

function openEditor(card) {
  state.editingId = card?.id ?? null;
  el.editorTitle.textContent = card ? "카드 편집" : "새 카드";
  el.subjectInput.value = card?.subject ?? subjects[1];
  el.frontInput.value = card?.front ?? "";
  el.backInput.value = card?.back ?? "";
  el.editorPanel.hidden = false;
  updatePreview();
  el.frontInput.focus();
}

function saveEditorCard() {
  const front = el.frontInput.value.trim();
  const back = el.backInput.value.trim();
  if (!front || !back) {
    alert("앞면과 뒷면을 모두 입력해 주세요.");
    return;
  }

  const payload = {
    subject: el.subjectInput.value,
    front,
    back,
    due: todayISO(),
    box: 0,
    seen: 0
  };

  if (state.editingId) {
    state.cards = state.cards.map((card) => card.id === state.editingId ? { ...card, ...payload } : card);
    state.currentId = state.editingId;
  } else {
    const card = { id: crypto.randomUUID(), ...payload };
    state.cards.unshift(card);
    state.currentId = card.id;
  }

  state.flipped = false;
  saveCards();
  el.editorPanel.hidden = true;
  render();
}

function deleteCurrentCard() {
  const card = currentCard();
  if (!card) return;
  if (!confirm(`"${card.front}" 카드를 삭제할까요?`)) return;
  state.cards = state.cards.filter((item) => item.id !== card.id);
  state.currentId = null;
  state.flipped = false;
  saveCards();
  chooseNextCard();
  render();
}

function reviewCurrent(known) {
  const card = currentCard();
  if (!card) return;

  const intervals = [0, 1, 3, 7, 14, 30, 60];
  card.seen += 1;
  card.box = known ? Math.min(card.box + 1, intervals.length - 1) : 0;
  card.due = addDaysISO(intervals[card.box]);

  state.progress.count += 1;
  saveCards();
  saveProgress();
  chooseNextCard(card.id);
  render();
}

function chooseNextCard(previousId) {
  const cards = filteredCards();
  if (!cards.length) {
    state.currentId = null;
    return;
  }

  const dueCards = cards.filter((card) => isDue(card) && card.id !== previousId);
  const pool = dueCards.length ? dueCards : cards.filter((card) => card.id !== previousId);
  const next = pool[0] ?? cards[0];
  state.currentId = next.id;
  state.flipped = false;
}

function currentCard() {
  return state.cards.find((card) => card.id === state.currentId) ?? null;
}

function filteredCards() {
  if (state.selectedSubject === "전체") return [...state.cards].sort(sortCards);
  return state.cards.filter((card) => card.subject === state.selectedSubject).sort(sortCards);
}

function sortCards(a, b) {
  return a.due.localeCompare(b.due) || a.subject.localeCompare(b.subject);
}

function isDue(card) {
  return card.due <= todayISO();
}

function seedSamples() {
  const existing = new Set(state.cards.map((card) => `${card.subject}:${card.front}`));
  const additions = sampleCards
    .filter((card) => !existing.has(`${card.subject}:${card.front}`))
    .map((card) => ({ ...card, id: crypto.randomUUID(), due: todayISO() }));
  state.cards = [...additions, ...state.cards];
  saveCards();
  if (additions[0]) state.currentId = additions[0].id;
  render();
}

function insertAtCursor(input, text) {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
  input.focus();
  input.selectionStart = input.selectionEnd = start + text.length;
  updatePreview();
}

function updatePreview() {
  el.formulaPreview.innerHTML = withMath(el.backInput.value.trim() || "입력한 수식이 여기에 표시됩니다.");
  typeset(el.formulaPreview);
}

function withMath(value) {
  const escaped = escapeHTML(value).replace(/\n/g, "<br>");
  return escaped.replace(/\\\[(.*?)\\\]/gs, (_, formula) => `<span class="math-block">\\[${formula}\\]</span>`);
}

function typeset(node) {
  if (window.MathJax?.typesetPromise) {
    window.MathJax.typesetPromise([node]).catch(() => {});
  }
}

function loadCards() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) ?? [];
  } catch {
    return [];
  }
}

function saveCards() {
  localStorage.setItem(storageKey, JSON.stringify(state.cards));
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(progressKey)) ?? { date: todayISO(), count: 0 };
  } catch {
    return { date: todayISO(), count: 0 };
  }
}

function normalizeProgressDate() {
  if (state.progress.date !== todayISO()) {
    state.progress = { date: todayISO(), count: 0 };
    saveProgress();
  }
}

function saveProgress() {
  localStorage.setItem(progressKey, JSON.stringify(state.progress));
}

function todayISO() {
  return toLocalISO(new Date());
}

function addDaysISO(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toLocalISO(date);
}

function toLocalISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHTML(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}
