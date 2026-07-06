// ============================================================================
// Calendar view + day thread sheet
// ============================================================================

export function renderCalendar(host, ctx) {
  const { state, el, clear } = ctx;

  const wrap = el("div");
  host.append(wrap);

  function computePhase(user, day) {
    if (!ctx.hasCycle(user)) return null;
    return ctx.phaseFor(state.anchors[user.id], user.cycle_length, user.period_length, day);
  }

  // ---- status card (top) -------------------------------------------------
  function statusCard() {
    const me = state.user;
    if (me.gender === "male") {
      const derCount = 0; // filled after month data loads; keep simple
      return el("div.card.status-card.male", {}, [
        el("h2", {}, ["Your status"]),
        el("div.status-big", {}, ["No cycle to track 💪"]),
        el("div.status-sub", {}, ["Tap any day to drop a Deriod or join the chat."]),
      ]);
    }
    const anchor = state.anchors[me.id];
    if (!anchor) {
      return el("div.card.status-card", {}, [
        el("h2", {}, ["Your cycle"]),
        el("div.status-big", {}, ["Set your Day 1"]),
        el("div.status-sub", {}, ["Head to Profile → “Update Day 1” to start predictions."]),
      ]);
    }
    const today = new Date();
    const info = ctx.phaseFor(anchor, me.cycle_length, me.period_length, today);
    const until = ctx.daysUntilNextPeriod(anchor, me.cycle_length, today);
    let sub;
    if (info.isPeriod) sub = `Period day ${info.day} • take it easy 🌸`;
    else if (info.isOvulation) sub = "Ovulation day • peak fertility";
    else if (info.isFertile) sub = "Fertile window";
    else sub = `${until} day${until === 1 ? "" : "s"} until your next period`;
    return el("div.card.status-card", {}, [
      el("h2", {}, [`Cycle day ${info.day} of ${me.cycle_length}`]),
      el("div.status-big", {}, [info.label]),
      el("div.status-sub", {}, [sub]),
    ]);
  }

  // ---- month grid --------------------------------------------------------
  async function paintMonth() {
    clear(wrap);
    wrap.append(statusCard());

    const { y, m } = state.cal;
    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const startWeekday = first.getDay();
    const fromISO = ctx.toISO(new Date(y, m, 1));
    const toISOd = ctx.toISO(new Date(y, m, daysInMonth));
    const netIds = state.network.map(u => u.id);
    const todayISO = ctx.toISO(new Date());

    // Load month overlays (comments count + deriods) — resilient to errors.
    let commentDays = {}, deriods = [];
    try { commentDays = await ctx.db.getCommentDays(fromISO, toISOd, netIds); } catch (e) {}
    try { deriods = await ctx.db.getDeriods(fromISO, toISOd, netIds); } catch (e) {}
    const deriodDays = {};
    for (const d of deriods) (deriodDays[d.day] ||= []).push(d);

    // header
    wrap.append(
      el("div.card", {}, [
        el("div.cal-head", {}, [
          el("div.month", {}, [`${ctx.MONTHS[m]} ${y}`]),
          el("div.cal-nav", {}, [
            el("button", { onclick: () => shift(-1), "aria-label": "Previous month" }, ["‹"]),
            el("button", { onclick: goToday, title: "Today" }, ["•"]),
            el("button", { onclick: () => shift(1), "aria-label": "Next month" }, ["›"]),
          ]),
        ]),
        weekHeader(),
        grid(),
        legend(deriods.length > 0),
      ])
    );

    function weekHeader() {
      return el("div.weekdays", {}, ctx.WEEKDAYS.map(d => el("div", {}, [d])));
    }

    function grid() {
      const g = el("div.grid");
      for (let i = 0; i < startWeekday; i++) g.append(el("div.cell.empty"));
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(y, m, d);
        const iso = ctx.toISO(date);
        const myPhase = computePhase(state.user, date);

        const cls = ["cell"];
        if (iso === todayISO) cls.push("today");
        if (myPhase) cls.push("p-" + myPhase.phase);

        const cell = el("div", { class: cls.join(" "), onclick: () => openDaySheet(date) }, [
          el("span.daynum", {}, [String(d)]),
        ]);

        // friend indicators: dots for friends in period / fertile that day
        const dots = [];
        for (const f of state.friends) {
          const p = computePhase(f, date);
          if (p && (p.isPeriod || p.isFertile || p.isOvulation)) {
            dots.push(el("i", { style: `background:${p.color}`, title: `${f.username}: ${p.label}` }));
          }
          if (dots.length >= 4) break;
        }
        if (dots.length) cell.append(el("div.dots", {}, dots));

        // deriod marker
        if (deriodDays[iso]) cell.append(el("span.deriod-mark", { title: "Deriod" }, ["💪"]));

        // comment badge
        if (commentDays[iso]) cell.append(el("span.badge", {}, ["💬" + commentDays[iso]]));

        g.append(cell);
      }
      return g;
    }
  }

  function legend(hasDeriods) {
    const item = (color, label) => el("span", {}, [ el("i", { style: `background:${color}` }), label ]);
    return el("div.legend", {}, [
      item(ctx.PHASES.period.color, "Period"),
      item(ctx.PHASES.fertile.color, "Fertile"),
      item(ctx.PHASES.ovulation.color, "Ovulation"),
      item(ctx.PHASES.follicular.color, "Follicular"),
      item(ctx.PHASES.luteal.color, "Luteal"),
      hasDeriods ? el("span", {}, ["💪 Deriod"]) : null,
      el("span", {}, ["💬 Chat"]),
    ]);
  }

  function shift(delta) {
    let { y, m } = state.cal;
    m += delta;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    state.cal = { y, m };
    paintMonth();
  }
  function goToday() {
    const n = new Date();
    state.cal = { y: n.getFullYear(), m: n.getMonth() };
    paintMonth();
  }

  // ---- DAY SHEET ---------------------------------------------------------
  function openDaySheet(date) {
    const iso = ctx.toISO(date);
    const netIds = state.network.map(u => u.id);

    ctx.openSheet(ctx.prettyDate(iso), (close) => {
      const body = ctx.el("div");
      const phaseBox = ctx.el("div.phase-summary");
      const deriodBox = ctx.el("div");
      const threadBox = ctx.el("div");
      body.append(phaseBox, deriodBox, ctx.el("hr.hr"),
        ctx.el("h2", { style: "font-size:15px;margin-bottom:2px" }, ["Day chat"]), threadBox);

      // phase summary for everyone in the network
      const rows = [];
      for (const u of state.network) {
        const p = computePhase(u, date);
        if (!p) continue;
        rows.push(ctx.el("div.psum-row", {}, [
          ctx.avatar(u, "sm"),
          ctx.el("span", { style: "flex:1" }, [u.id === state.user.id ? "You" : u.username]),
          ctx.el("span.chip", { style: `background:${p.color}` }, [`${p.label} · d${p.day}`]),
        ]));
      }
      if (rows.length) { phaseBox.append(ctx.el("div.small.muted", { style: "margin-bottom:4px" }, ["Cycle phases"]), ...rows); }
      else phaseBox.append(ctx.el("p.small.muted", {}, ["No cycle data for this day yet."]));

      loadDeriods();
      loadThread();

      // ---- deriods ----
      async function loadDeriods() {
        ctx.clear(deriodBox);
        let list = [];
        try { list = await ctx.db.getDeriods(iso, iso, netIds); } catch (e) {}
        if (list.length) {
          deriodBox.append(ctx.el("div.small.muted", { style: "margin:10px 0 4px" }, ["Deriods 💪"]));
          for (const d of list) {
            deriodBox.append(ctx.el("div.psum-row", {}, [
              ctx.avatar(d.author, "sm"),
              ctx.el("span", { style: "flex:1" }, [
                (d.user_id === state.user.id ? "You" : d.author.username) + (d.note ? ` — ${d.note}` : ""),
              ]),
              d.user_id === state.user.id
                ? ctx.el("button.link-btn", { onclick: async () => {
                    try { await ctx.db.deleteDeriod(state.user.id, iso); ctx.toast("Deriod removed"); loadDeriods(); paintMonth(); }
                    catch (e) { ctx.toast(e.message, true); }
                  } }, ["Remove"])
                : null,
            ]));
          }
        }
        // Only males can create Deriods (hidden from female users per spec).
        if (state.user.gender === "male") {
          const already = list.some(d => d.user_id === state.user.id);
          if (!already) {
            deriodBox.append(ctx.el("button.btn.secondary", { style: "margin-top:10px", onclick: () => addDeriod() }, ["💪 Drop a Deriod here"]));
          }
        }
      }

      async function addDeriod() {
        const note = prompt("Add a note to your Deriod (optional):") ?? "";
        try {
          await ctx.db.addDeriod(state.user.id, iso, note.trim());
          ctx.toast("Deriod dropped 💪");
          loadDeriods(); paintMonth();
        } catch (e) { ctx.toast(e.message, true); }
      }

      // ---- comment thread ----
      async function loadThread() {
        ctx.clear(threadBox);
        threadBox.append(ctx.el("p.small.muted", {}, ["Loading…"]));
        let comments = [];
        try { comments = await ctx.db.getComments(iso, netIds); } catch (e) {}
        ctx.clear(threadBox);
        if (!comments.length) {
          threadBox.append(ctx.el("div.empty-state", { style: "padding:16px" }, [
            ctx.el("span.emoji", {}, ["💬"]), "No messages yet. Start the thread!",
          ]));
        }
        for (const c of comments) threadBox.append(commentNode(c));
        threadBox.append(composer());
      }

      function commentNode(c) {
        const mine = c.user_id === state.user.id;
        const media = c.image_url ? ctx.el("img.attach", { src: c.image_url, alt: "attachment" }) : null;
        const textEl = c.body ? ctx.el("div.text", {}, [c.body]) : null;
        const node = ctx.el("div.comment", {}, [
          ctx.avatar(c.author, "sm"),
          ctx.el("div.body", {}, [
            ctx.el("div.meta", {}, [
              ctx.el("span.name", {}, [mine ? "You" : c.author.username]),
              ctx.el("span.time", {}, [ctx.timeAgo(c.created_at) + (c.updated_at ? " · edited" : "")]),
            ]),
            textEl, media,
            mine ? ctx.el("div.actions", {}, [
              ctx.el("button", { onclick: () => editComment(c, node) }, ["Edit"]),
              ctx.el("button.del", { onclick: () => removeComment(c) }, ["Delete"]),
            ]) : null,
          ]),
        ]);
        return node;
      }

      async function removeComment(c) {
        if (!confirm("Delete this message?")) return;
        try { await ctx.db.deleteComment(c.id); ctx.toast("Deleted"); loadThread(); paintMonth(); }
        catch (e) { ctx.toast(e.message, true); }
      }

      function editComment(c, node) {
        const ta = ctx.el("textarea", { value: c.body || "" });
        const save = ctx.el("button.btn.small.auto", {}, ["Save"]);
        const cancel = ctx.el("button.btn.small.auto.ghost", {}, ["Cancel"]);
        const editor = ctx.el("div", {}, [ta, ctx.el("div.row", { style: "margin-top:6px" }, [save, cancel])]);
        node.replaceWith(editor);
        save.addEventListener("click", async () => {
          try { await ctx.db.updateComment(c.id, ta.value.trim(), c.image_url); ctx.toast("Updated"); loadThread(); }
          catch (e) { ctx.toast(e.message, true); }
        });
        cancel.addEventListener("click", () => loadThread());
      }

      // ---- composer ----
      function composer() {
        let imageData = null;
        const ta = ctx.el("textarea", { placeholder: "Add to the thread…", rows: 1 });
        const fileInput = ctx.el("input", { type: "file", accept: "image/*", style: "display:none" });
        const previewWrap = ctx.el("div");
        const photoBtn = ctx.el("button.icon-btn", { type: "button", title: "Add photo" }, ["📷"]);
        const sendBtn = ctx.el("button.icon-btn.send", { type: "button", title: "Send" }, ["➤"]);

        photoBtn.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", async () => {
          if (!fileInput.files[0]) return;
          try {
            imageData = await ctx.fileToDataURL(fileInput.files[0]);
            ctx.clear(previewWrap).append(ctx.el("div.preview", {}, [
              ctx.el("img", { src: imageData }),
              ctx.el("button", { type: "button", onclick: () => { imageData = null; ctx.clear(previewWrap); } }, ["✕"]),
            ]));
          } catch (e) { ctx.toast(e.message, true); }
        });

        const send = async () => {
          const text = ta.value.trim();
          if (!text && !imageData) return;
          sendBtn.disabled = true;
          try {
            await ctx.db.addComment(state.user.id, iso, text, imageData);
            ta.value = ""; imageData = null; ctx.clear(previewWrap);
            loadThread(); paintMonth();
          } catch (e) { ctx.toast(e.message, true); }
          sendBtn.disabled = false;
        };
        sendBtn.addEventListener("click", send);
        ta.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
        });

        return ctx.el("div.composer", {}, [
          previewWrap,
          ctx.el("div.inputrow", {}, [ photoBtn, ta, sendBtn, fileInput ]),
          ctx.el("div.small.muted", { style: "margin-top:4px" }, ["Tip: ⌘/Ctrl + Enter to send"]),
        ]);
      }

      return body;
    });
  }

  paintMonth();
}
