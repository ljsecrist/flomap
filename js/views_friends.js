// ============================================================================
// Friends view: add by username, handle requests, list friends
// ============================================================================

export function renderFriends(host, ctx) {
  const { state, db, el, clear, avatar, toast } = ctx;
  const me = state.user;

  const wrap = el("div");
  host.append(wrap);

  async function paint() {
    clear(wrap);

    // --- find & add friends (live search) ---
    const input = el("input", {
      placeholder: "Search people by name…", autocapitalize: "none",
      autocomplete: "off", autocorrect: "off", spellcheck: false,
    });
    const err = el("div.error-msg");
    const results = el("div.search-results");

    let searchTimer, searchSeq = 0;
    input.addEventListener("input", () => {
      clearTimeout(searchTimer);
      const q = input.value.trim();
      err.textContent = "";
      if (!q) { clear(results); return; }
      results.innerHTML = `<p class="small muted" style="margin-top:10px">Searching…</p>`;
      searchTimer = setTimeout(() => runSearch(q), 220);
    });

    async function runSearch(q) {
      const seq = ++searchSeq;
      let found = [];
      try { found = await db.searchUsers(q, me.id, 8); }
      catch (e) { err.textContent = e.message; clear(results); return; }
      if (seq !== searchSeq) return; // a newer keystroke superseded this one
      clear(results);
      if (!found.length) {
        results.append(el("p.small.muted", { style: "margin-top:10px" }, [`No members match “${q}”.`]));
        return;
      }
      for (const u of found) results.append(resultRow(u));
    }

    function resultRow(u) {
      const isFriend = state.friends.some(f => f.id === u.id);
      const btn = isFriend
        ? el("span.small.muted", {}, ["Friends ✓"])
        : el("button.btn.small.auto", {}, ["Add"]);
      if (!isFriend) btn.addEventListener("click", () => addFriend(u, btn));
      return el("div.list-item", {}, [
        avatar(u, "md"),
        el("div.grow", {}, [ el("div.name", {}, [u.username]) ]),
        btn,
      ]);
    }

    async function addFriend(u, btn) {
      btn.disabled = true; btn.textContent = "…";
      try {
        const res = await db.sendFriendRequest(me.id, u.id);
        if (res.autoAccepted) { toast(`You're now friends with ${u.username}! 🎉`); await ctx.reloadNetwork(); }
        else toast(`Request sent to ${u.username}`);
        btn.replaceWith(el("span.small.muted", {}, [res.autoAccepted ? "Friends ✓" : "Requested"]));
        await refresh();
      } catch (e) { toast(e.message, true); btn.disabled = false; btn.textContent = "Add"; }
    }

    wrap.append(el("div.card", {}, [
      el("h2", {}, ["Find friends"]),
      input,
      el("p.small.muted", { style: "margin-top:6px" }, ["Type part of a username — no need to get it exact."]),
      err,
      results,
    ]));

    // placeholders that get filled async
    const reqCard = el("div");
    const friendsCard = el("div");
    wrap.append(reqCard, friendsCard);

    async function refresh() {
      // requests
      let incoming = [], outgoing = [];
      try { incoming = await db.getIncomingRequests(me.id); } catch (e) {}
      try { outgoing = await db.getOutgoingRequests(me.id); } catch (e) {}
      clear(reqCard);
      if (incoming.length || outgoing.length) {
        const c = el("div.card", {}, [ el("h2", {}, ["Requests"]) ]);
        for (const r of incoming) {
          c.append(el("div.list-item", {}, [
            avatar(r.requester, "md"),
            el("div.grow", {}, [ el("div.name", {}, [r.requester.username]), el("div.small.muted", {}, ["wants to be friends"]) ]),
            el("div.actions.pill-actions", {}, [
              el("button.btn.small.auto", { onclick: async () => {
                try { await db.acceptRequest(r.id); toast("Friend added! 🎉"); await ctx.reloadNetwork(); refresh(); }
                catch (e) { toast(e.message, true); }
              } }, ["Accept"]),
              el("button.btn.small.auto.secondary", { onclick: async () => {
                try { await db.removeFriendship(r.id); refresh(); } catch (e) { toast(e.message, true); }
              } }, ["Decline"]),
            ]),
          ]));
        }
        for (const r of outgoing) {
          c.append(el("div.list-item", {}, [
            avatar(r.addressee, "md"),
            el("div.grow", {}, [ el("div.name", {}, [r.addressee.username]), el("div.small.muted", {}, ["request pending"]) ]),
            el("button.btn.small.auto.ghost", { onclick: async () => {
              try { await db.removeFriendship(r.id); refresh(); } catch (e) { toast(e.message, true); }
            } }, ["Cancel"]),
          ]));
        }
        reqCard.append(c);
      }

      // friends list
      clear(friendsCard);
      const list = state.friends;
      const c = el("div.card", {}, [ el("h2", {}, [`Friends (${list.length})`]) ]);
      if (!list.length) {
        c.append(el("div.empty-state", {}, [ el("span.emoji", {}, ["👯"]), "No friends yet. Add someone by username above!" ]));
      } else {
        for (const f of list) {
          c.append(el("div.list-item", {}, [
            avatar(f, "md"),
            el("div.grow", {}, [ el("div.name", {}, [f.username]), phaseLine(f) ]),
            el("button.btn.small.auto.ghost", { onclick: () => unfriend(f) }, ["Remove"]),
          ]));
        }
      }
      friendsCard.append(c);
    }

    function phaseLine(f) {
      if (f.gender === "male") return el("div.small.muted", {}, ["No cycle tracked 💪"]);
      const p = ctx.phaseOf(f, new Date());
      if (!p) return el("div.small.muted", {}, ["Cycle not set"]);
      return el("div.small", {}, [
        el("span.chip", { style: `background:${p.color};font-size:11px` }, [p.label]),
        el("span.muted", { style: "margin-left:6px" }, [p.manual ? "logged ✍️" : `day ${p.day}`]),
      ]);
    }

    async function unfriend(f) {
      if (!confirm(`Remove ${f.username} from your friends?`)) return;
      try { await db.unfriend(me.id, f.id); toast("Removed"); await ctx.reloadNetwork(); refresh(); }
      catch (e) { toast(e.message, true); }
    }

    await refresh();
  }

  paint();
}
