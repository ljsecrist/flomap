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

    // --- add friend ---
    const input = el("input", { placeholder: "Add a friend by username", autocapitalize: "none", autocomplete: "off" });
    const addBtn = el("button.btn.auto", {}, ["Add"]);
    const err = el("div.error-msg");

    const doAdd = async () => {
      const uname = input.value.trim();
      err.textContent = "";
      if (!uname) return;
      if (uname.toLowerCase() === me.username.toLowerCase()) return err.textContent = "That's you!";
      addBtn.disabled = true;
      try {
        const target = await db.findUserByUsername(uname);
        if (!target) { err.textContent = "No user with that username."; addBtn.disabled = false; return; }
        const res = await db.sendFriendRequest(me.id, target.id);
        input.value = "";
        if (res.autoAccepted) { toast(`You're now friends with ${target.username}! 🎉`); await ctx.reloadNetwork(); }
        else toast(`Friend request sent to ${target.username}`);
        await refresh();
      } catch (e) { err.textContent = e.message; }
      addBtn.disabled = false;
    };
    addBtn.addEventListener("click", doAdd);
    input.addEventListener("keydown", e => { if (e.key === "Enter") doAdd(); });

    wrap.append(el("div.card", {}, [
      el("h2", {}, ["Add a friend"]),
      el("div.row", {}, [ input, addBtn ]),
      err,
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
      const anchor = state.anchors[f.id];
      if (!anchor) return el("div.small.muted", {}, ["Cycle not set"]);
      const p = ctx.phaseFor(anchor, f.cycle_length, f.period_length, new Date());
      return el("div.small", {}, [
        el("span.chip", { style: `background:${p.color};font-size:11px` }, [p.label]),
        el("span.muted", { style: "margin-left:6px" }, [`day ${p.day}`]),
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
