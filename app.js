/* Plan B client: polls JSON under d/{DATA_PATH}/. Path comes from #d= once, then localStorage. */
(function () {
  const LS = "desk_data_path";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let tab = "home";
  let range = "LIVE";
  let view = { kind: "tab" };
  let state = null, chart = null, activity = null, account = null;
  let errTimer = 0, failN = 0, lastOk = null;
  let base = "";

  function readPath() {
    const h = location.hash || "";
    const m = h.match(/[#&]d=([A-Za-z0-9_-]+)/);
    if (m && m[1].length >= 32) {
      try { localStorage.setItem(LS, m[1]); } catch (e) {}
      return m[1];
    }
    try { return localStorage.getItem(LS) || ""; } catch (e) { return ""; }
  }

  function dataUrl(rel) {
    return base + "d/" + PATH + "/" + rel;
  }

  const PATH = readPath();
  if (!PATH) {
    document.getElementById("gate").classList.remove("hidden");
    document.getElementById("tabs").classList.add("hidden");
    return;
  }

  function applyDeepLink() {
    const h = location.hash || "";
    const au = h.match(/[&]audit=([A-Za-z0-9]+)/);
    const co = h.match(/[&]coin=([A-Za-z0-9]+)/);
    const tb = h.match(/[&]tab=(home|agents|activity|account)/);
    if (au) view = { kind: "audit", mint: au[1] };
    else if (co) view = { kind: "coin", mint: co[1] };
    if (tb) tab = tb[1];
  }
  applyDeepLink();

  async function pull(rel) {
    const r = await fetch(dataUrl(rel), { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }

  async function refresh() {
    try {
      const [s, c, a, acc] = await Promise.all([
        pull("state.json"),
        pull("chart.json"),
        pull("activity.json"),
        pull("account.json"),
      ]);
      state = s; chart = c; activity = a; account = acc;
      failN = 0;
      lastOk = new Date();
      document.getElementById("err").classList.add("hidden");
      render();
    } catch (e) {
      failN += 1;
      const n = Math.min(60, 5 * failN);
      const el = document.getElementById("err");
      el.classList.remove("hidden");
      const t = lastOk ? lastOk.toLocaleTimeString() : "never";
      el.textContent = "Desk offline · retrying in " + n + "s · last update " + t;
    }
  }

  function money(n) {
    if (n == null || isNaN(n)) return "—";
    const sign = n < 0 ? "-" : "";
    return sign + "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function pct(n) {
    if (n == null || isNaN(n)) return "—";
    const sign = n >= 0 ? "+" : "";
    return sign + n.toFixed(2) + "%";
  }

  function nav(title, back) {
    return `<div class="nav">${back ? `<button class="back" id="back">‹</button>` : `<button class="avatar" id="go-account">●</button>`}
      <div class="title">${title}</div><div class="grow"></div>
      <button class="iconbtn bell" id="bell">🔔<span class="dot"></span></button></div>`;
  }

  function render() {
    const root = document.getElementById("screen");
    if (view.kind === "coin") return renderCoin(root);
    if (view.kind === "audit") return renderAudit(root);
    if (tab === "home") renderHome(root);
    else if (tab === "agents") renderAgents(root);
    else if (tab === "activity") renderActivity(root, false);
    else renderAccount(root);
  }

  function renderHome(root) {
    if (!state) {
      root.innerHTML = nav("Grok Bot ›") + `<div class="skeleton" style="height:80px;margin:16px"></div>`;
      return;
    }
    const paper = state.mode === "PAPER" ? `<span class="pill paper">PAPER</span>` : "";
    const up = (state.today_pct || 0) >= 0;
    const rows = (activity && activity.rows) ? activity.rows.slice(0, 5) : [];
    root.innerHTML = nav("Grok Bot ›") +
      `<input class="search" id="search" placeholder="Name, symbol or mint">` +
      `<div class="home-bal"><div class="row"><div class="odometer num" id="bal">${money(state.balance)}</div>${paper}
        <span class="pill green">${(state.multiplier || 1).toFixed(2)}×</span></div>
        <div class="today ${up ? "" : "neg"}">${pct(state.today_pct)} today</div></div>
      <div class="chart-wrap"><canvas id="home-chart" style="width:100%;height:180px"></canvas></div>
      <div class="ranges">${["LIVE","1H","4H","1D","1W","ALL"].map((r) => `<button data-range="${r}" class="${r===range?"on":""}">${r}</button>`).join("")}</div>
      <div class="section"><h2>Agents · 5 running</h2></div>
      <div class="carousel" id="cards"></div>
      <div class="section"><h2>Activity</h2><button class="link" id="see-all">See all</button></div>
      ${rows.length ? rows.map(activityRow).join("") : `<div class="empty">Nothing yet tonight</div>`}`;
    drawHomeChart();
    drawCards();
    document.getElementById("see-all").onclick = () => { tab = "activity"; syncTabs(); render(); };
    document.getElementById("go-account").onclick = () => { tab = "account"; syncTabs(); render(); };
    document.querySelectorAll(".ranges button").forEach((b) => b.onclick = () => { range = b.dataset.range; render(); });
    document.getElementById("search").addEventListener("change", onSearch);
    root.querySelectorAll(".activity-row").forEach((b) => b.onclick = () => openRow(b.dataset.kind, b.dataset.mint));
  }

  function drawHomeChart() {
    const cv = document.getElementById("home-chart");
    if (!cv || !window.DeskCharts) return;
    const pts = (chart && chart.ranges && chart.ranges[range]) || [];
    const marks = (chart && chart.marks) || [];
    const start = pts.length ? pts[0].v : null;
    DeskCharts.lineChart(cv, pts, marks, start);
  }

  function drawCards() {
    const el = document.getElementById("cards");
    if (!el || !state) return;
    const agents = state.agents || [];
    if (!agents.length) {
      el.innerHTML = `<div class="agent-card"><h3>Scanner</h3><div class="meta">Listening for graduations</div></div>`;
      return;
    }
    el.innerHTML = agents.map((a) => {
      const color = {scanner:"#64d2ff",auditor:"#fff",analyst:"#ffd60a",executor:"#00d35a",risk:"#ff6b9a"}[a.name] || "#fff";
      let body = `<div class="meta">${a.label || a.status}</div>`;
      if (a.name === "analyst") body += `<canvas class="ring" data-score="${a.score||0}"></canvas>`;
      if (a.name === "risk") body += `<div class="pills"><span class="pill stop">stop -${a.stop_pct}%</span><span class="pill trail">trail ${a.trail_pct}%</span></div>`;
      const dec = (a.decisions || []).slice(0, 4).map((d) => {
        const kill = d.verdict === "kill" || d.verdict === "reject";
        return `<li class="${kill?"kill":""}"><span>${(d.mint||"").slice(0,6)}</span><span class="why">${d.reason||d.verdict||""}</span></li>`;
      }).join("");
      return `<div class="agent-card" data-agent="${a.name}" style="border-top:3px solid ${color}">
        <h3>${cap(a.name)} · ${a.status}</h3>${body}<ul class="feed">${dec || (a.name==="scanner"?"<li>Listening for graduations</li>":"")}</ul></div>`;
    }).join("");
    el.querySelectorAll("canvas.ring").forEach((c) => DeskCharts.scoreRing(c, Number(c.dataset.score)));
  }

  function activityRow(r) {
    return `<button class="activity-row" data-kind="${r.kind}" data-mint="${r.mint||""}">
      <div><div>${esc(r.title||"")}</div><div class="sub">${esc(r.subtitle||"")}</div></div>
      <div class="val">${esc(r.value||"")}</div></button>`;
  }

  function renderActivity(root, all) {
    const rows = (activity && activity.rows) || [];
    root.innerHTML = nav("Activity") + (rows.length ? rows.map(activityRow).join("") : `<div class="empty">Nothing yet tonight</div>`);
    root.querySelectorAll(".activity-row").forEach((b) => b.onclick = () => openRow(b.dataset.kind, b.dataset.mint));
    const acc = document.getElementById("go-account");
    if (acc) acc.onclick = () => { tab = "account"; syncTabs(); render(); };
  }

  function renderAgents(root) {
    const agents = (state && state.agents) || [];
    root.innerHTML = nav("Agents") + agents.map((a) => {
      const dec = (a.decisions || []).slice(0, 20).map((d) =>
        `<div class="activity-row"><div><div>${esc((d.mint||"").slice(0,8))} · ${esc(d.verdict||"")}</div><div class="sub">${esc(d.reason||"")} · ${(d.ts||"").slice(11,16)}</div></div></div>`
      ).join("");
      return `<div class="agent-row"><div><div>${cap(a.name)}</div><div class="sub">${a.status} · ${a.count||0} today</div></div></div>${dec}`;
    }).join("") || `<div class="empty">No agents yet</div>`;
  }

  function renderAccount(root) {
    const a = account || {};
    const st = a.settings || {};
    const paper = (a.mode || "PAPER") === "PAPER";
    const groups = groupSettings(st);
    root.innerHTML = nav("Account") +
      `<div class="setting-row"><div>Mode</div><div>${esc(a.mode||"PAPER")} ${paper?'<span class="pill paper">PAPER</span>':""} · read-only</div></div>
       <div class="setting-row"><div>Stack</div><div class="num">${money(a.stack)}</div></div>
       ${a.profile_url ? `<a class="setting-row" href="${a.profile_url}"><div>Your FOMO profile</div><div>›</div></a>` : ""}
       ${a.signup_url ? `<button class="setting-row" id="invite"><div>Invite a friend</div><div>›</div></button>` : ""}
       <div class="setting-row"><div>Telegram</div><div>${esc(a.telegram||"not")}</div></div>
       <div class="setting-row"><div>Notifications</div><div>${esc(a.web_push||"Telegram only")}</div></div>
       <div class="section"><h2>Settings</h2></div>
       ${groups}`;
    const inv = document.getElementById("invite");
    if (inv && a.signup_url) inv.onclick = () => share(a.signup_url);
  }

  function groupSettings(st) {
    const keys = Object.keys(st).sort();
    return keys.map((k) => `<div class="setting-row"><div>${esc(k)}</div><div class="mono">${esc(String(st[k]))}</div></div>`).join("");
  }

  async function renderCoin(root) {
    root.innerHTML = nav("Coin", true) + `<div class="skeleton" style="height:200px;margin:16px"></div>`;
    bindBack();
    try {
      const c = await pull("coin/" + view.mint + ".json");
      const paper = (state && state.mode === "PAPER") ? `<span class="pill paper">PAPER</span>` : "";
      const btn = c.position ? "Sell on FOMO" : "Buy on FOMO";
      const chg = c.change_since_entry_pct;
      root.innerHTML = nav((c.name || "Coin") + " ", true) +
        `<div class="coin-head">${paper} <span class="muted">${esc(c.symbol||"")} · Solana</span>
          ${c.shield ? `<span class="pill green">${c.shield}</span>` : ""}
          <div class="price num">${c.price != null ? Number(c.price).toPrecision(6) : "—"}</div>
          ${chg != null ? `<div class="today ${chg>=0?"":"neg"}">${chg>=0?"▲":"▼"} ${pct(chg)} since entry</div>` : ""}</div>
        <div class="chart-wrap" style="height:220px"><canvas id="coin-chart" style="width:100%;height:220px"></canvas></div>
        <div class="stats">
          <div class="box"><div class="lbl">Liquidity</div><div class="num">${c.position ? "" : ""}—</div></div>
          <div class="box"><div class="lbl">Holders</div><div class="num">${c.holders != null ? c.holders : "n/a"}</div></div>
        </div>
        ${c.position ? `<div class="setting-row"><div>Your position · $${Number(c.position.size_usd).toFixed(2)} in · Executor</div></div>
           <div class="setting-row"><div>Stop / trail / time</div><div class="num">${c.stop_line||"—"} · ${c.trail_line||"—"} · ${fmtLeft(c.timeout_left_s)}</div></div>` : ""}
        <a class="btn-fomo" href="${c.coin_url}">${btn}</a>`;
      bindBack();
      const cv = document.getElementById("coin-chart");
      if (cv) DeskCharts.candles(cv, c.candles || [], c.trail_line, c.stop_line);
    } catch (e) {
      root.innerHTML = nav("Coin", true) + `<div class="empty">Could not load this coin.</div>`;
      bindBack();
    }
  }

  async function renderAudit(root) {
    root.innerHTML = nav("Auditor", true) + `<div class="skeleton" style="height:200px;margin:16px"></div>`;
    bindBack();
    try {
      const a = await pull("audit/" + view.mint + ".json");
      const layers = a.layers || [];
      const rejected = layers.some((L) => L.pass === false);
      const head = rejected ? `Rejected · ${(layers.find((L)=>L.pass===false)||{}).value||""}` : `Cleared · 8/8 parts`;
      root.innerHTML = nav(a.name || "Auditor", true) +
        `<div class="coin-head"><div>${esc(head)}</div>
          <div class="muted">${rejected ? "Grok Bot won't buy this" : "Sent to Executor"}</div></div>
        <div class="layers">${layers.map((L) => {
          const cls = L.pass === true ? "ok" : (L.pass === false ? "bad" : "skip");
          return `<div class="layer"><span>${L.n}. ${esc(L.name)}</span><span class="${cls}">${esc(L.value)}</span></div>`;
        }).join("")}</div>
        <a class="btn-fomo" href="${a.coin_url}">Open on FOMO</a>`;
      bindBack();
    } catch (e) {
      root.innerHTML = nav("Auditor", true) + `<div class="empty">No coin taken apart yet</div>`;
      bindBack();
    }
  }

  function bindBack() {
    const b = document.getElementById("back");
    if (b) b.onclick = () => { view = { kind: "tab" }; render(); };
  }
  function openRow(kind, mint) {
    if (!mint) return;
    if (kind === "rejected") view = { kind: "audit", mint };
    else view = { kind: "coin", mint };
    render();
  }
  function onSearch(e) {
    const q = (e.target.value || "").trim();
    if (!q) return;
    const rows = ((activity && activity.rows) || []);
    const hit = rows.find((r) => (r.name||"").toLowerCase() === q.toLowerCase() || (r.mint||"") === q || (r.mint||"").startsWith(q));
    if (hit && hit.mint) { view = { kind: "coin", mint: hit.mint }; render(); }
  }
  function fmtLeft(s) {
    if (s == null) return "—";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h + "h " + m + "m left";
  }
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c])); }
  function share(url) {
    if (navigator.share) navigator.share({ url, title: "FOMO" }).catch(() => copy(url));
    else copy(url);
  }
  function copy(url) {
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => alert("Link copied")).catch(() => {});
  }
  function syncTabs() {
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  }
  document.getElementById("tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    tab = b.dataset.tab;
    view = { kind: "tab" };
    syncTabs();
    render();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  refresh();
  setInterval(refresh, 15000);
})();
