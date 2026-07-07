// ============================================================================
// Profile / settings view
// ============================================================================

export function renderProfile(host, ctx) {
  const { state, db, auth, el, clear, avatar, toast, openSheet } = ctx;
  const me = () => state.user;

  const wrap = el("div");
  host.append(wrap);
  paint();

  function genderLabel(g) { return { female: "Female", male: "Male", other: "Other" }[g] || g; }

  function paint() {
    clear(wrap);
    const u = me();

    // header (tap to edit)
    wrap.append(el("div.card", {}, [
      el("div.profile-head", { style: "cursor:pointer", onclick: openEditSheet, title: "Edit profile" }, [
        avatar(u, "lg"),
        el("div.username", {}, [u.username]),
        el("div.gender-badge", {}, [genderLabel(u.gender) + " · " + u.email]),
        el("div.small", { style: "color:var(--pink);font-weight:700;margin-top:2px" }, ["✏️ Tap to edit"]),
      ]),
    ]));

    // cycle summary
    if (u.gender !== "male") {
      const anchor = state.anchors[u.id];
      const box = el("div.card", {}, [ el("h2", {}, ["Your cycle"]) ]);
      if (anchor) {
        const p = ctx.phaseOf(u, new Date());
        const next = ctx.nextPeriodStart(anchor, u.cycle_length, new Date());
        box.append(
          el("div.psum-row", {}, [ el("span", { style: "flex:1" }, ["Current phase"]), el("span.chip", { style: `background:${p.color}` }, [p.manual ? `${p.label} ✍️` : p.label]) ]),
          el("div.psum-row", {}, [ el("span", { style: "flex:1" }, ["Cycle length (learned)"]), el("b", {}, [`${u.cycle_length} days`]) ]),
          el("div.psum-row", {}, [ el("span", { style: "flex:1" }, ["Period · luteal (learned)"]), el("b", {}, [`${u.period_length} · ${u.luteal_length || 14} days`]) ]),
          el("div.psum-row", {}, [ el("span", { style: "flex:1" }, ["Last logged Day 1"]), el("b", {}, [ctx.prettyDate(anchor)]) ]),
          el("div.psum-row", {}, [ el("span", { style: "flex:1" }, ["Next period (predicted)"]), el("b", {}, [ctx.prettyDate(ctx.toISO(next))]) ]),
        );
      } else {
        box.append(el("p.muted.small", {}, ["No Day 1 logged yet — add one to start predictions."]));
      }
      box.append(
        el("div.row", { style: "margin-top:12px" }, [
          el("button.btn.auto", { onclick: openDay1Sheet }, ["📅 Update Day 1"]),
          el("button.btn.auto.secondary", { onclick: openLogPhaseSheet }, ["✍️ Log a phase"]),
        ])
      );
      wrap.append(box);
    } else {
      wrap.append(el("div.card", {}, [
        el("h2", {}, ["Deriods 💪"]),
        el("p.muted.small", {}, ["Open any day on the calendar to drop or remove a Deriod."]),
      ]));
    }

    // account actions
    wrap.append(el("div.card", {}, [
      el("h2", {}, ["Account"]),
      el("button.btn.secondary", { style: "margin-bottom:10px", onclick: openEditSheet }, ["✏️ Edit profile"]),
      el("button.btn.ghost", { onclick: () => { if (confirm("Log out of FloMap?")) ctx.logout(); } }, ["Log out"]),
    ]));

    wrap.append(el("p.center.small.muted", { style: "margin-top:8px" }, ["FloMap · track your flow, together"]));
  }

  // --- update Day 1 -------------------------------------------------------
  function openDay1Sheet() {
    openSheet("Update Day 1", (close) => {
      const u = me();
      const dateIn = el("input", { type: "date", value: state.anchors[u.id] || ctx.toISO(new Date()), max: ctx.toISO(new Date()) });
      const save = el("button.btn", {}, ["Log this as Day 1"]);
      const err = el("div.error-msg");
      const historyBox = el("div");

      save.addEventListener("click", async () => {
        if (!dateIn.value) return err.textContent = "Pick a date.";
        save.disabled = true;
        try {
          await db.logPeriodStart(u.id, dateIn.value);
          await db.relearnCycle(u.id);
          await ctx.reloadNetwork();
          toast("Day 1 updated ✔");
          close(); paint(); ctx.repaint();
        } catch (e) { err.textContent = e.message; save.disabled = false; }
      });

      loadHistory();
      async function loadHistory() {
        clear(historyBox);
        let starts = [];
        try { starts = await db.getPeriodStarts([u.id]); } catch (e) {}
        if (!starts.length) return;
        historyBox.append(el("div.small.muted", { style: "margin:14px 0 4px" }, ["Logged Day 1 history"]));
        for (const s of starts) {
          historyBox.append(el("div.list-item", {}, [
            el("span.grow", {}, [ctx.prettyDate(s.start_date)]),
            el("button.link-btn", { onclick: async () => {
              try { await db.deletePeriodStart(u.id, s.start_date); await db.relearnCycle(u.id); await ctx.reloadNetwork(); loadHistory(); paint(); ctx.repaint(); toast("Removed"); }
              catch (e) { toast(e.message, true); }
            } }, ["Delete"]),
          ]));
        }
      }

      return el("div", {}, [
        el("p.small.muted", {}, ["Set the first day your current period started. We'll recalculate all predictions from here."]),
        el("div.field", { style: "margin-top:10px" }, [ el("label", {}, ["First day of period"]), dateIn ]),
        err, save, historyBox,
      ]);
    });
  }

  // --- log / override a cycle phase --------------------------------------
  function openLogPhaseSheet() {
    openSheet("Log a cycle phase", (close) => {
      const u = me();
      const todayISO = ctx.toISO(new Date());
      const PHASES = ["period", "fertile", "ovulation", "follicular", "luteal"];
      const phaseSel = el("select", {}, PHASES.map(p =>
        el("option", { value: p }, [ctx.PHASES[p].label])));
      const startIn = el("input", { type: "date", value: todayISO });
      const endIn = el("input", { type: "date", value: todayISO });
      const err = el("div.error-msg");
      const save = el("button.btn", {}, ["Save log"]);
      const historyBox = el("div");

      // Ovulation is usually a single day → keep end in sync until user edits it.
      let endTouched = false;
      endIn.addEventListener("input", () => { endTouched = true; });
      const syncEnd = () => {
        if (!endTouched || endIn.value < startIn.value) endIn.value = startIn.value;
      };
      startIn.addEventListener("input", syncEnd);
      phaseSel.addEventListener("change", () => {
        if (phaseSel.value === "ovulation") { endIn.value = startIn.value; endTouched = false; }
      });

      save.addEventListener("click", async () => {
        err.textContent = "";
        if (!startIn.value || !endIn.value) return err.textContent = "Pick start and end dates.";
        if (endIn.value < startIn.value) return err.textContent = "End date can't be before start.";
        save.disabled = true;
        try {
          await db.addCycleEvent(u.id, phaseSel.value, startIn.value, endIn.value);
          await ctx.reloadNetwork();
          toast("Logged — predictions updated ✔");
          close(); paint(); ctx.repaint();
        } catch (e) { err.textContent = e.message; save.disabled = false; }
      });

      loadHistory();
      async function loadHistory() {
        clear(historyBox);
        let events = [];
        try { events = await db.getCycleEvents([u.id]); } catch (e) {}
        if (!events.length) return;
        historyBox.append(el("div.small.muted", { style: "margin:16px 0 4px" }, ["Your logged phases"]));
        for (const ev of events) {
          const range = ev.start_date === ev.end_date
            ? ctx.prettyDate(ev.start_date)
            : `${ctx.prettyDate(ev.start_date)} → ${ctx.prettyDate(ev.end_date)}`;
          historyBox.append(el("div.list-item", {}, [
            el("span.chip", { style: `background:${ctx.PHASES[ev.phase].color};font-size:11px` }, [ctx.PHASES[ev.phase].label]),
            el("span.grow.small", { style: "margin-left:8px" }, [range]),
            el("button.link-btn", { onclick: async () => {
              try { await db.deleteCycleEvent(ev.id); await ctx.reloadNetwork(); loadHistory(); paint(); ctx.repaint(); toast("Removed"); }
              catch (e) { toast(e.message, true); }
            } }, ["Delete"]),
          ]));
        }
      }

      return el("div", {}, [
        el("p.small.muted", {}, ["Log what you actually experienced. It overrides the calendar for those days, and FloMap learns from it to sharpen next cycle's predictions."]),
        el("div.field", { style: "margin-top:10px" }, [ el("label", {}, ["Phase"]), phaseSel ]),
        el("div.row", {}, [
          el("div.field", {}, [ el("label", {}, ["Start"]), startIn ]),
          el("div.field", {}, [ el("label", {}, ["End"]), endIn ]),
        ]),
        el("p.small.muted", {}, ["Tip: logging your real period start & ovulation teaches it the most."]),
        err, save, historyBox,
      ]);
    });
  }

  // --- edit profile -------------------------------------------------------
  function openEditSheet() {
    openSheet("Edit profile", (close) => {
      const u = me();
      let avatarData = u.avatar_url;

      const preview = avatar({ username: u.username, avatar_url: avatarData }, "lg");
      const file = el("input", { type: "file", accept: "image/*", style: "display:none" });
      const pick = el("button.btn.secondary.auto", { type: "button" }, ["📷 Change photo"]);
      pick.addEventListener("click", () => file.click());
      file.addEventListener("change", async () => {
        if (!file.files[0]) return;
        try {
          const cropped = await ctx.cropImageFile(file.files[0], { size: 400 });
          file.value = "";
          if (!cropped) return;
          avatarData = cropped;
          preview.replaceWith((preview = avatar({ username: uname.value, avatar_url: avatarData }, "lg")));
        } catch (e) { toast(e.message, true); }
      });

      const uname = el("input", { value: u.username, maxLength: 20 });
      const gender = el("select", {}, [
        el("option", { value: "female", selected: u.gender === "female" }, ["Female"]),
        el("option", { value: "male", selected: u.gender === "male" }, ["Male"]),
        el("option", { value: "other", selected: u.gender === "other" }, ["Other / prefer not to say"]),
      ]);
      const clen = el("input", { type: "number", value: u.cycle_length, min: 15, max: 60 });
      const plen = el("input", { type: "number", value: u.period_length, min: 1, max: 14 });
      const cycleFields = el("div", {}, [
        el("div.row", {}, [
          el("div.field", {}, [ el("label", {}, ["Avg cycle length"]), clen ]),
          el("div.field", {}, [ el("label", {}, ["Avg period length"]), plen ]),
        ]),
      ]);
      cycleFields.style.display = u.gender === "male" ? "none" : "block";
      gender.addEventListener("change", () => {
        cycleFields.style.display = gender.value === "male" ? "none" : "block";
      });

      const err = el("div.error-msg");
      const save = el("button.btn", {}, ["Save changes"]);
      save.addEventListener("click", async () => {
        const fields = {
          username: uname.value.trim(),
          avatar_url: avatarData,
          gender: gender.value,
          cycle_length: ctx.clampInt(clen.value, 15, 60, 28),
          period_length: ctx.clampInt(plen.value, 1, 14, 5),
        };
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(fields.username))
          return err.textContent = "Username: 3–20 letters, numbers, or _.";
        save.disabled = true;
        try {
          await db.updateUser(u.id, fields);
          await auth.refreshCurrentUser();
          state.user = auth.getCurrentUser();
          await ctx.reloadNetwork();
          toast("Profile updated ✔");
          close(); ctx.rerender();
        } catch (e) { err.textContent = e.message; save.disabled = false; }
      });

      return el("div", {}, [
        el("div.avatar-pick", {}, [ preview, pick, file ]),
        el("div.field", {}, [ el("label", {}, ["Username"]), uname ]),
        el("div.field", {}, [ el("label", {}, ["Gender"]), gender ]),
        cycleFields,
        err, save,
      ]);
    });
  }
}
