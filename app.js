/* 認知圖鑑 · Mind Atlas */
(function () {
  "use strict";

  const LS_BOOKMARKS = "mindatlas.bookmarks.v1";
  const LS_ANSWERS = "mindatlas.answers.v1";
  const LS_RECENT = "mindatlas.recent.v1";
  const BUILD_EMBED = null; // filled from version.json

  const TYPE_LABEL = {
    cover: "封面",
    core: "核心",
    example: "例子",
    action: "行動",
    question: "問你",
  };

  const state = {
    concepts: [],
    days: [],
    tags: null,
    version: null,
    byId: new Map(),
    filterDomain: "",
    filterTag: "",
    search: "",
    modalId: null,
    modalIdx: 0,
    feedCarousels: new Map(), // conceptId -> idx
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function toast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("on"), 1800);
  }

  async function loadJSON(path) {
    const res = await fetch(path + "?t=" + Date.now());
    if (!res.ok) throw new Error(`載入失敗 ${path}: ${res.status}`);
    return res.json();
  }

  function getBookmarks() {
    try {
      return JSON.parse(localStorage.getItem(LS_BOOKMARKS) || "[]");
    } catch {
      return [];
    }
  }
  function setBookmarks(arr) {
    localStorage.setItem(LS_BOOKMARKS, JSON.stringify(arr));
  }
  function isBookmarked(id) {
    return getBookmarks().includes(id);
  }
  function toggleBookmark(id) {
    const arr = getBookmarks();
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    else arr.unshift(id);
    setBookmarks(arr);
    return i < 0;
  }

  function getAnswers() {
    try {
      return JSON.parse(localStorage.getItem(LS_ANSWERS) || "{}");
    } catch {
      return {};
    }
  }
  function setAnswer(id, text) {
    const a = getAnswers();
    a[id] = { text, at: new Date().toISOString() };
    localStorage.setItem(LS_ANSWERS, JSON.stringify(a));
  }

  function getRecent() {
    try {
      return JSON.parse(localStorage.getItem(LS_RECENT) || "[]");
    } catch {
      return [];
    }
  }
  function pushRecent(id) {
    let r = getRecent().filter((x) => x !== id);
    r.unshift(id);
    r = r.slice(0, 12);
    localStorage.setItem(LS_RECENT, JSON.stringify(r));
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function gradientStyle(c) {
    const g = c.cover?.gradient || ["#eef2f6", "#f5f0e8"];
    return `background: linear-gradient(145deg, ${g[0]} 0%, ${g[1]} 100%);`;
  }

  function hasCoverImage(c) {
    return Boolean(c.cover?.image);
  }

  function coverImgSrc(c) {
    return c.cover?.image || "";
  }

  /** Build HTML for a slide (feed or modal). Photo on cover-type when image exists. */
  function buildSlideInner(c, s, extrasHtml) {
    const usePhoto = s.type === "cover" && hasCoverImage(c);
    const emoji = escapeHtml(c.cover?.emoji || "💡");
    const typeLabel = escapeHtml(TYPE_LABEL[s.type] || s.type);
    const title = escapeHtml(s.title || c.title);
    const body = escapeHtml(s.body || "");
    const extras = extrasHtml || "";
    if (usePhoto) {
      return {
        className: "slide slide-photo",
        style: "",
        html: `
        <img class="slide-bg" src="${escapeHtml(coverImgSrc(c))}" alt="" loading="lazy" decoding="async" />
        <div class="slide-scrim" aria-hidden="true"></div>
        <div class="slide-inner">
          <span class="slide-emoji-badge" aria-hidden="true">${emoji}</span>
          <div class="slide-type">${typeLabel}</div>
          <h3>${title}</h3>
          <p>${body}</p>
          ${extras}
        </div>`,
      };
    }
    return {
      className: "slide",
      style: gradientStyle(c),
      html: `
        <div class="slide-emoji">${emoji}</div>
        <div class="slide-type">${typeLabel}</div>
        <h3>${title}</h3>
        <p>${body}</p>
        ${extras}`,
    };
  }

  function buildLibCoverHtml(c) {
    const emoji = escapeHtml(c.cover?.emoji || "💡");
    const title = escapeHtml(c.title);
    if (hasCoverImage(c)) {
      return `
        <div class="cover cover-photo">
          <img class="cover-bg" src="${escapeHtml(coverImgSrc(c))}" alt="" loading="lazy" decoding="async" />
          <div class="cover-scrim" aria-hidden="true"></div>
          <div class="cover-inner">
            <span class="em-badge" aria-hidden="true">${emoji}</span>
            <h3>${title}</h3>
          </div>
        </div>`;
    }
    return `
        <div class="cover" style="${gradientStyle(c)}">
          <div class="em">${emoji}</div>
          <h3>${title}</h3>
        </div>`;
  }

  function conceptSearchBlob(c) {
    const slides = (c.slides || []).map((s) => `${s.title} ${s.body}`).join(" ");
    return [c.title, c.subtitle, c.domain, ...(c.tags || []), slides, c.cover?.hook]
      .join(" ")
      .toLowerCase();
  }

  function filteredConcepts() {
    const q = state.search.trim().toLowerCase();
    return state.concepts.filter((c) => {
      if (state.filterDomain && c.domain !== state.filterDomain) return false;
      if (state.filterTag && !(c.tags || []).includes(state.filterTag)) return false;
      if (q && !conceptSearchBlob(c).includes(q)) return false;
      return true;
    });
  }

  function dayForDate(date) {
    return state.days.find((d) => d.date === date) || null;
  }

  function conceptsForDay(day) {
    if (!day) return [];
    return (day.conceptIds || []).map((id) => state.byId.get(id)).filter(Boolean);
  }

  function bindNav() {
    $$(".nav button").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".nav button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const id = btn.dataset.section;
        $$(".section").forEach((s) => s.classList.toggle("active", s.id === id));
        if (id === "sec-review") renderReview();
        if (id === "sec-library") renderLibrary();
      });
    });
  }

  function goSection(sectionId) {
    const btn = $(`.nav button[data-section="${sectionId}"]`);
    if (btn) btn.click();
  }

  /* ---------- Feed ---------- */
  function renderFeed() {
    const today = todayISO();
    let day = dayForDate(today);
    let concepts = conceptsForDay(day);
    let label = "今日";

    if (!concepts.length) {
      // fallback to latest day with concepts
      for (const d of state.days) {
        const cs = conceptsForDay(d);
        if (cs.length) {
          day = d;
          concepts = cs;
          label = d.date === today ? "今日" : "最新";
          break;
        }
      }
    }

    $("#feed-title").textContent = label === "今日" ? "今日 Feed" : `${day?.date || ""} Feed`;
    $("#feed-hint").textContent = day ? `${concepts.length} 個概念` : "—";
    $("#feed-summary").textContent = day?.summary || day?.title || "";

    const list = $("#feed-list");
    const empty = $("#feed-empty");
    list.innerHTML = "";

    if (!concepts.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    concepts.forEach((c) => {
      list.appendChild(buildStoryCard(c));
    });
  }

  function buildStoryCard(c) {
    const wrap = document.createElement("article");
    wrap.className = "story-card";
    wrap.dataset.id = c.id;

    const idx = state.feedCarousels.get(c.id) || 0;
    const slides = c.slides || [];

    wrap.innerHTML = `
      <div class="story-meta">
        <span class="domain">${escapeHtml(c.domain)}</span>
        <span class="date">${escapeHtml(c.date)}</span>
      </div>
      <div class="inline-carousel" data-cid="${escapeHtml(c.id)}">
        <div class="inline-track"></div>
      </div>
      <div class="story-foot">
        <div class="tags">${(c.tags || []).slice(0, 4).map((t) => `<span class="mini-tag">#${escapeHtml(t)}</span>`).join("")}</div>
        <div style="display:flex;align-items:center;gap:4px">
          <button type="button" class="heart-btn ${isBookmarked(c.id) ? "on" : ""}" data-bm="${escapeHtml(c.id)}" aria-label="收藏">${isBookmarked(c.id) ? "♥" : "♡"}</button>
          <button type="button" class="btn-text" data-open="${escapeHtml(c.id)}">放大</button>
        </div>
      </div>
    `;

    const track = $(".inline-track", wrap);
    slides.forEach((s, i) => {
      const extras = `
          <div class="slide-actions">
            <button type="button" class="car-mini" data-dir="-1" ${i === 0 && idx === 0 ? "disabled" : ""} aria-label="上一張">‹</button>
            <div class="dots-inline">${slides.map((_, di) => `<span class="dot ${di === idx ? "on" : ""}"></span>`).join("")}</div>
            <button type="button" class="car-mini" data-dir="1" aria-label="下一張">›</button>
          </div>`;
      const built = buildSlideInner(c, s, extras);
      const slide = document.createElement("div");
      slide.className = built.className;
      if (built.style) slide.style.cssText = built.style;
      slide.innerHTML = built.html;
      track.appendChild(slide);
    });

    // position
    track.style.transform = `translateX(-${idx * 100}%)`;
    updateInlineDots(wrap, idx, slides.length);

    const carousel = $(".inline-carousel", wrap);
    bindSwipe(carousel, {
      getIndex: () => state.feedCarousels.get(c.id) || 0,
      setIndex: (n) => {
        const max = slides.length - 1;
        const next = Math.max(0, Math.min(max, n));
        state.feedCarousels.set(c.id, next);
        track.style.transform = `translateX(-${next * 100}%)`;
        updateInlineDots(wrap, next, slides.length);
      },
      max: () => slides.length - 1,
    });

    wrap.addEventListener("click", (e) => {
      const bm = e.target.closest("[data-bm]");
      if (bm) {
        e.stopPropagation();
        const on = toggleBookmark(bm.dataset.bm);
        bm.classList.toggle("on", on);
        bm.textContent = on ? "♥" : "♡";
        toast(on ? "已收藏" : "已取消收藏");
        return;
      }
      const open = e.target.closest("[data-open]");
      if (open) {
        openModal(open.dataset.open, state.feedCarousels.get(c.id) || 0);
        return;
      }
      const mini = e.target.closest(".car-mini");
      if (mini) {
        e.stopPropagation();
        const dir = Number(mini.dataset.dir);
        const cur = state.feedCarousels.get(c.id) || 0;
        const next = Math.max(0, Math.min(slides.length - 1, cur + dir));
        state.feedCarousels.set(c.id, next);
        track.style.transform = `translateX(-${next * 100}%)`;
        updateInlineDots(wrap, next, slides.length);
      }
    });

    return wrap;
  }

  function updateInlineDots(wrap, idx, total) {
    $$(".slide", wrap).forEach((slide, si) => {
      const dots = $$(".dot", slide);
      dots.forEach((d, di) => d.classList.toggle("on", di === idx));
      const prev = $('[data-dir="-1"]', slide);
      const next = $('[data-dir="1"]', slide);
      if (prev) prev.disabled = idx <= 0;
      if (next) next.disabled = idx >= total - 1;
    });
  }

  function bindSwipe(el, api) {
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let locked = null; // 'h' | 'v'

    el.addEventListener(
      "touchstart",
      (e) => {
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        tracking = true;
        locked = null;
      },
      { passive: true }
    );

    el.addEventListener(
      "touchmove",
      (e) => {
        if (!tracking) return;
        const t = e.touches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (!locked) {
          if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
            locked = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
          }
        }
      },
      { passive: true }
    );

    el.addEventListener(
      "touchend",
      (e) => {
        if (!tracking) return;
        tracking = false;
        if (locked !== "h") return;
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        if (Math.abs(dx) < 40) return;
        const cur = api.getIndex();
        if (dx < 0) api.setIndex(cur + 1);
        else api.setIndex(cur - 1);
      },
      { passive: true }
    );
  }

  /* ---------- Library ---------- */
  function renderDomainChips() {
    const domains = state.tags?.domains?.map((d) => d.id) || [
      ...new Set(state.concepts.map((c) => c.domain)),
    ];
    const row = $("#domain-chips");
    row.innerHTML =
      `<button type="button" class="chip ${!state.filterDomain ? "on" : ""}" data-domain="">全部領域</button>` +
      domains
        .map(
          (d) =>
            `<button type="button" class="chip ${state.filterDomain === d ? "on" : ""}" data-domain="${escapeHtml(d)}">${escapeHtml(d)}</button>`
        )
        .join("");
    row.onclick = (e) => {
      const b = e.target.closest("[data-domain]");
      if (!b) return;
      state.filterDomain = b.dataset.domain;
      renderDomainChips();
      renderLibrary();
    };
  }

  function renderTagChips() {
    const tagSet = new Set();
    state.concepts.forEach((c) => (c.tags || []).forEach((t) => tagSet.add(t)));
    const tags = [...tagSet].sort();
    const row = $("#tag-chips");
    row.innerHTML = tags
      .map(
        (t) =>
          `<button type="button" class="chip tag-chip ${state.filterTag === t ? "on" : ""}" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`
      )
      .join("");
    row.onclick = (e) => {
      const b = e.target.closest("[data-tag]");
      if (!b) return;
      state.filterTag = state.filterTag === b.dataset.tag ? "" : b.dataset.tag;
      renderTagChips();
      renderLibrary();
    };
  }

  function renderLibrary() {
    const list = filteredConcepts();
    $("#lib-count").textContent = `${list.length} / ${state.concepts.length}`;
    const grid = $("#lib-grid");
    const empty = $("#lib-empty");
    grid.innerHTML = "";
    if (!list.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    list.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lib-card";
      btn.innerHTML = `
        ${buildLibCoverHtml(c)}
        <div class="body">
          <p class="sub">${escapeHtml(c.subtitle || c.cover?.hook || "")}</p>
          <div class="row">
            <span class="dom">${escapeHtml(c.domain)}</span>
            <span class="hint">${escapeHtml(c.date)}</span>
          </div>
        </div>
      `;
      btn.addEventListener("click", () => openModal(c.id, 0));
      grid.appendChild(btn);
    });
  }

  /* ---------- Map ---------- */
  function renderMap() {
    const domains =
      state.tags?.domains ||
      [...new Set(state.concepts.map((c) => c.domain))].map((id) => ({
        id,
        emoji: "📂",
        desc: "",
      }));
    const grid = $("#map-grid");
    grid.innerHTML = "";
    domains.forEach((d) => {
      const count = state.concepts.filter((c) => c.domain === d.id).length;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "map-tile";
      btn.innerHTML = `
        <div class="em">${escapeHtml(d.emoji || "📂")}</div>
        <h3>${escapeHtml(d.id)}</h3>
        <p>${escapeHtml(d.desc || "")}</p>
        <div class="count">${count} 個概念</div>
      `;
      btn.addEventListener("click", () => {
        state.filterDomain = d.id;
        state.filterTag = "";
        state.search = "";
        const search = $("#search");
        if (search) search.value = "";
        renderDomainChips();
        renderTagChips();
        goSection("sec-library");
        renderLibrary();
        toast(`已篩選：${d.id}`);
      });
      grid.appendChild(btn);
    });
  }

  /* ---------- Review ---------- */
  function renderReview() {
    const answers = getAnswers();
    const unanswered = state.concepts.filter((c) => {
      const hasQ = (c.slides || []).some((s) => s.type === "question");
      return hasQ && !answers[c.id];
    });

    const qEl = $("#review-questions");
    const qEmpty = $("#review-q-empty");
    qEl.innerHTML = "";
    if (!unanswered.length) {
      qEmpty.classList.remove("hidden");
    } else {
      qEmpty.classList.add("hidden");
      unanswered.forEach((c) => {
        const q = (c.slides || []).find((s) => s.type === "question");
        const row = document.createElement("button");
        row.type = "button";
        row.className = "list-row";
        row.innerHTML = `
          <div class="em">${escapeHtml(c.cover?.emoji || "❓")}</div>
          <div>
            <div class="t">${escapeHtml(c.title)}</div>
            <div class="s">${escapeHtml(q?.body || "有問題等你答")}</div>
          </div>
        `;
        row.addEventListener("click", () => {
          const qi = (c.slides || []).findIndex((s) => s.type === "question");
          openModal(c.id, Math.max(0, qi));
        });
        qEl.appendChild(row);
      });
    }

    const bms = getBookmarks()
      .map((id) => state.byId.get(id))
      .filter(Boolean);
    const bmEl = $("#review-bookmarks");
    const bmEmpty = $("#review-bm-empty");
    bmEl.innerHTML = "";
    if (!bms.length) {
      bmEmpty.classList.remove("hidden");
    } else {
      bmEmpty.classList.add("hidden");
      bms.forEach((c) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "lib-card";
        btn.innerHTML = `
          ${buildLibCoverHtml(c)}
          <div class="body">
            <p class="sub">${escapeHtml(c.subtitle || "")}</p>
            <div class="row"><span class="dom">${escapeHtml(c.domain)}</span></div>
          </div>
        `;
        btn.addEventListener("click", () => openModal(c.id, 0));
        bmEl.appendChild(btn);
      });
    }

    const recent = getRecent()
      .map((id) => state.byId.get(id))
      .filter(Boolean);
    const rEl = $("#review-recent");
    const rEmpty = $("#review-recent-empty");
    rEl.innerHTML = "";
    if (!recent.length) {
      rEmpty.classList.remove("hidden");
    } else {
      rEmpty.classList.add("hidden");
      recent.forEach((c) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "list-row";
        row.innerHTML = `
          <div class="em">${escapeHtml(c.cover?.emoji || "💡")}</div>
          <div>
            <div class="t">${escapeHtml(c.title)}</div>
            <div class="s">${escapeHtml(c.domain)} · ${escapeHtml(c.date)}</div>
          </div>
        `;
        row.addEventListener("click", () => openModal(c.id, 0));
        rEl.appendChild(row);
      });
    }
  }

  /* ---------- Archive ---------- */
  function renderArchive() {
    const list = $("#archive-list");
    const empty = $("#archive-empty");
    list.innerHTML = "";
    if (!state.days.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    state.days.forEach((d) => {
      const n = (d.conceptIds || []).length;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "archive-item";
      btn.innerHTML = `
        <div class="d">${escapeHtml(d.date)}</div>
        <h3>${escapeHtml(d.title)}</h3>
        <p>${escapeHtml(d.summary || "")}</p>
        <div class="n">${n} 個概念</div>
      `;
      btn.addEventListener("click", () => {
        // show that day's concepts in feed-like way: open first, or filter library by date via search
        const first = (d.conceptIds || [])[0];
        if (first) openModal(first, 0);
      });
      list.appendChild(btn);
    });
  }

  /* ---------- Modal ---------- */
  function openModal(id, startIdx) {
    const c = state.byId.get(id);
    if (!c) return;
    state.modalId = id;
    state.modalIdx = startIdx || 0;
    pushRecent(id);

    const modal = $("#modal");
    modal.hidden = false;
    document.body.style.overflow = "hidden";

    $("#modal-kicker").textContent = `${c.domain} · ${c.date}`;
    $("#modal-title").textContent = c.title;
    const bm = $("#modal-bookmark");
    bm.classList.toggle("on", isBookmarked(id));
    bm.textContent = isBookmarked(id) ? "♥" : "♡";

    const track = $("#carousel-track");
    track.innerHTML = "";
    (c.slides || []).forEach((s) => {
      const built = buildSlideInner(c, s, "");
      const slide = document.createElement("div");
      slide.className = built.className;
      if (built.style) slide.style.cssText = built.style;
      slide.innerHTML = built.html;
      track.appendChild(slide);
    });

    renderModalDots();
    updateModalPosition();
    renderModalFoot(c);

    // focus for keyboard
    modal.focus?.();
  }

  function renderModalDots() {
    const c = state.byId.get(state.modalId);
    const dots = $("#carousel-dots");
    const n = (c?.slides || []).length;
    dots.innerHTML = Array.from({ length: n }, (_, i) => {
      return `<button type="button" class="dot ${i === state.modalIdx ? "on" : ""}" data-i="${i}" aria-label="第 ${i + 1} 張" style="border:none;padding:0;cursor:pointer"></button>`;
    }).join("");
  }

  function updateModalPosition() {
    const track = $("#carousel-track");
    track.style.transform = `translateX(-${state.modalIdx * 100}%)`;
    const c = state.byId.get(state.modalId);
    const max = (c?.slides || []).length - 1;
    $("#car-prev").disabled = state.modalIdx <= 0;
    $("#car-next").disabled = state.modalIdx >= max;
    $$("#carousel-dots .dot").forEach((d, i) => d.classList.toggle("on", i === state.modalIdx));
    renderModalFoot(c);
  }

  function renderModalFoot(c) {
    if (!c) return;
    const slide = (c.slides || [])[state.modalIdx];
    const foot = $("#modal-foot");
    const src = c.source?.url
      ? `<div>來源：<a href="${escapeHtml(c.source.url)}" target="_blank" rel="noopener">${escapeHtml(c.source.label || c.source.url)}</a></div>`
      : c.source?.label
        ? `<div>來源：${escapeHtml(c.source.label)}</div>`
        : "";

    let answerUI = "";
    if (slide?.type === "question") {
      const prev = getAnswers()[c.id]?.text || "";
      answerUI = `
        <div class="answer-box">
          <textarea id="answer-input" placeholder="用幾句寫低你嘅答案（存本機）…">${escapeHtml(prev)}</textarea>
          <button type="button" id="answer-save">儲存答案</button>
        </div>
      `;
    }

    foot.innerHTML = src + answerUI;
    $("#answer-save")?.addEventListener("click", () => {
      const text = $("#answer-input")?.value?.trim() || "";
      if (!text) {
        toast("寫啲嘢先再儲存啦");
        return;
      }
      setAnswer(c.id, text);
      toast("答案已存本機");
    });
  }

  function closeModal() {
    $("#modal").hidden = true;
    document.body.style.overflow = "";
    state.modalId = null;
  }

  function modalStep(dir) {
    const c = state.byId.get(state.modalId);
    if (!c) return;
    const max = (c.slides || []).length - 1;
    state.modalIdx = Math.max(0, Math.min(max, state.modalIdx + dir));
    updateModalPosition();
  }

  function bindModal() {
    $("#modal-close").addEventListener("click", closeModal);
    $$("[data-close]").forEach((el) => el.addEventListener("click", closeModal));
    $("#car-prev").addEventListener("click", () => modalStep(-1));
    $("#car-next").addEventListener("click", () => modalStep(1));
    $("#carousel-dots").addEventListener("click", (e) => {
      const d = e.target.closest("[data-i]");
      if (!d) return;
      state.modalIdx = Number(d.dataset.i);
      updateModalPosition();
    });
    $("#modal-bookmark").addEventListener("click", () => {
      if (!state.modalId) return;
      const on = toggleBookmark(state.modalId);
      const bm = $("#modal-bookmark");
      bm.classList.toggle("on", on);
      bm.textContent = on ? "♥" : "♡";
      toast(on ? "已收藏" : "已取消收藏");
      // sync feed hearts
      $$(`[data-bm="${state.modalId}"]`).forEach((el) => {
        el.classList.toggle("on", on);
        el.textContent = on ? "♥" : "♡";
      });
    });

    bindSwipe($("#carousel"), {
      getIndex: () => state.modalIdx,
      setIndex: (n) => {
        const c = state.byId.get(state.modalId);
        const max = (c?.slides || []).length - 1;
        state.modalIdx = Math.max(0, Math.min(max, n));
        updateModalPosition();
      },
      max: () => {
        const c = state.byId.get(state.modalId);
        return (c?.slides || []).length - 1;
      },
    });

    document.addEventListener("keydown", (e) => {
      if ($("#modal").hidden) return;
      if (e.key === "Escape") closeModal();
      if (e.key === "ArrowLeft") modalStep(-1);
      if (e.key === "ArrowRight") modalStep(1);
    });
  }

  /* ---------- Version ---------- */
  async function checkVersion(manual) {
    try {
      const j = await loadJSON("version.json");
      const cur = state.version?.version;
      if (cur && j.version && j.version !== cur) {
        toast("發現新版本，重新整理…");
        setTimeout(() => location.reload(), 600);
        return;
      }
      if (manual) toast("已係最新版本");
      state.version = j;
      updateFooter();
    } catch {
      if (manual) toast("檢查更新失敗");
    }
  }

  function updateFooter() {
    const v = state.version;
    $("#footer-meta").textContent = v
      ? `BUILD ${v.version} · ${v.built} ${v.tz || "HKT"}`
      : "認知圖鑑 · Mind Atlas";
  }

  function renderAll() {
    $("#brand-sub").textContent = `Mind Atlas · ${state.concepts.length} 張卡`;
    $("#pill-count").textContent = `${state.concepts.length} concepts`;
    $("#pill-date").textContent = todayISO();
    renderFeed();
    renderDomainChips();
    renderTagChips();
    renderLibrary();
    renderMap();
    renderArchive();
    updateFooter();
  }

  async function boot() {
    const root = $("#app");
    try {
      const [conceptsData, daysData, tagsData, version] = await Promise.all([
        loadJSON("data/concepts.json"),
        loadJSON("data/days.json"),
        loadJSON("data/tags.json").catch(() => null),
        loadJSON("version.json").catch(() => null),
      ]);
      state.concepts = conceptsData.concepts || [];
      state.days = daysData.days || [];
      state.tags = tagsData;
      state.version = version;
      state.byId = new Map(state.concepts.map((c) => [c.id, c]));
      // newest first for days
      state.days.sort((a, b) => (a.date < b.date ? 1 : -1));
      state.concepts.sort((a, b) => (a.date < b.date ? 1 : -1));

      bindNav();
      bindModal();
      $("#search").addEventListener("input", (e) => {
        state.search = e.target.value;
        renderLibrary();
      });
      $("#upd-btn").addEventListener("click", () => checkVersion(true));

      renderAll();

      // light poll like CFA/Fit
      if (/^https?:$/.test(location.protocol)) {
        setInterval(() => checkVersion(false), 60000);
      }
    } catch (err) {
      root.innerHTML = `<div class="error">載入失敗<br><small>${escapeHtml(err.message)}</small></div>`;
      console.error(err);
    }
  }

  boot();
})();
