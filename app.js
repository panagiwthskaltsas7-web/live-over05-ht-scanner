
const $ = id => document.getElementById(id);

const API_URL =
  "https://football-odds-scanner.panagiwthskaltsas7.workers.dev";

let threshold = 10;
let games = [];
let signals = [];
let loading = false;
let lastUpdated = "—";
let lastSnapshot = null;

function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]
  );
}

function formatPrice(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toFixed(2)
    : "—";
}

function formatTime(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleTimeString("el-GR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatAge(value) {
  if (!value) return "άγνωστη ηλικία";

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return "άγνωστη ηλικία";
  }

  const minutes = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 60000)
  );

  if (minutes < 1) return "λιγότερο από 1 λεπτό";
  if (minutes < 60) return `${minutes} λεπτά`;

  return `${Math.floor(minutes / 60)} ώρ. ${minutes % 60} λεπ.`;
}

function updateRefreshStatus(message) {
  const element = $("refreshStatus");
  if (element) element.textContent = message;
}

function getStatus(game) {
  if (game.drop >= threshold && game.hasComparison) {
    return "high";
  }

  if (
    game.drop >= threshold * 0.55 &&
    game.hasComparison
  ) {
    return "watch";
  }

  return "normal";
}

function render() {
  $("count").textContent = games.length;
  $("signals").textContent = signals.length;
  $("updated").textContent = lastUpdated;

  if (!games.length) {
    $("matches").innerHTML = `
      <article class="match">
        <div class="matchname">
          Δεν υπάρχουν διαθέσιμοι αγώνες.
        </div>
        <div class="minute">
          Αναμονή για τον επόμενο αυτόματο έλεγχο.
        </div>
      </article>
    `;
  } else {
    $("matches").innerHTML = games.map(game => {
      const state = getStatus(game);

      const label =
        state === "high"
          ? "Ισχυρή πτώση"
          : state === "watch"
            ? "Υπό παρακολούθηση"
            : "Χωρίς νέο σήμα";

      const comparison = game.hasComparison
        ? `${formatPrice(game.baseline)} → ${formatPrice(game.price)}`
        : `Τρέχουσα απόδοση: ${formatPrice(game.price)}`;

      const movement = game.hasComparison
        ? game.drop > 0
          ? `Πτώση ${game.drop.toFixed(1)}%`
          : game.drop < 0
            ? `Άνοδος ${Math.abs(game.drop).toFixed(1)}%`
            : "Χωρίς μεταβολή"
        : "Δεν καταγράφηκε νέα πτώση στον τελευταίο έλεγχο";

      return `
        <article class="match">
          <div class="matchhead">
            <div>
              <div class="matchname">
                ${escapeHTML(game.name)}
              </div>
              <div class="minute">
                ${escapeHTML(game.league)}
                · ${escapeHTML(game.minute)}
                · Over 0.5 HT
              </div>
            </div>

            <span class="status ${state}">
              ${label}
            </span>
          </div>

          <div class="odds">
            ${comparison}
          </div>

          <div class="drop">
            ${movement}
          </div>

          <div class="sourcegrid">
            <div class="source">
              <small>API-Football</small>
              <b>${formatPrice(game.price)}</b>
            </div>

            <div class="source">
              <small>Ώρα δεδομένων</small>
              <b>${escapeHTML(lastUpdated)}</b>
            </div>
          </div>

          <div class="bar">
            <span style="width:${
              Math.min(Math.max(game.drop, 0) * 3, 100)
            }%"></span>
          </div>
        </article>
      `;
    }).join("");
  }

  $("historyList").innerHTML = signals.length
    ? signals.map(signal => `
        <div class="historyitem">
          <span>
            ${escapeHTML(signal.name)}
            · ${escapeHTML(signal.time)}
          </span>
          <b>-${signal.drop.toFixed(1)}%</b>
        </div>
      `).join("")
    : "Δεν υπάρχουν ακόμη σήματα.";
}

async function loadLiveGames() {
  if (loading) return;

  loading = true;

  const refreshBtn = $("refreshBtn");

  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "↻ Γίνεται έλεγχος...";
  }

  updateRefreshStatus(
    "Ανάκτηση αποθηκευμένων δεδομένων API-Football..."
  );

  try {
    const [scannerResponse, signalsResponse] =
      await Promise.all([
        fetch(
          API_URL + "/api/scanner?t=" + Date.now(),
          { cache: "no-store" }
        ),
        fetch(
          API_URL + "/api/signals?t=" + Date.now(),
          { cache: "no-store" }
        )
      ]);

    if (!scannerResponse.ok || !signalsResponse.ok) {
      throw new Error("Αποτυχία σύνδεσης με τον Worker");
    }

    const data = await scannerResponse.json();
    const signalsData = await signalsResponse.json();

    if (!Array.isArray(data.matches)) {
      throw new Error("Μη έγκυρα δεδομένα scanner");
    }

    lastSnapshot = data.fetchedAt || null;
    lastUpdated = formatTime(lastSnapshot);

    const rawSignals = Array.isArray(signalsData.signals)
      ? signalsData.signals
      : [];

    const latestSignals = Array.isArray(data.signals)
      ? data.signals
      : [];

    const latestSignalMap = new Map(
      latestSignals.map(signal => [
        String(signal.fixtureId),
        signal
      ])
    );

    games = data.matches.map(match => {
      const id = String(match.fixtureId);
      const signal = latestSignalMap.get(id);

      const baseline = signal
        ? Number(signal.previousOdd)
        : null;

      const price = Number(match.odd);

      const drop = signal
        ? Number(signal.dropPercent)
        : 0;

      return {
        id,
        name:
          `Ομάδα ${match.homeTeamId ?? "?"} – ` +
          `Ομάδα ${match.awayTeamId ?? "?"}`,
        league: `Λίγκα ${match.leagueId ?? "?"}`,
        minute: match.minute == null
          ? "Λεπτό άγνωστο"
          : `${match.minute}'`,
        price,
        baseline,
        drop,
        hasComparison: Boolean(signal)
      };
    }).filter(game =>
      Number.isFinite(game.price) && game.price > 1
    );

    signals = rawSignals
      .map(signal => ({
        id: String(signal.fixtureId),
        name:
          `Ομάδα ${signal.homeTeamId ?? "?"} – ` +
          `Ομάδα ${signal.awayTeamId ?? "?"}`,
        drop: Number(signal.dropPercent),
        time: formatTime(signal.detectedAt)
      }))
      .filter(signal => Number.isFinite(signal.drop))
      .filter(signal => signal.drop >= threshold);

    render();

    const age = formatAge(lastSnapshot);
    const ageMinutes = lastSnapshot
      ? (Date.now() - Date.parse(lastSnapshot)) / 60000
      : Infinity;

    if (ageMinutes >= 30) {
      updateRefreshStatus(
        `⚠️ Τα δεδομένα είναι παλιά (${age}). ` +
        `Τελευταία ενημέρωση: ${lastUpdated}.`
      );
    } else {
      updateRefreshStatus(
        `✓ Τελευταίος αυτόματος έλεγχος: ${lastUpdated}. ` +
        `Ηλικία δεδομένων: ${age}. ` +
        `Η ανανέωση δεν καταναλώνει API-Football requests.`
      );
    }

  } catch (error) {
    console.error("Scanner refresh failed:", error);

    updateRefreshStatus(
      "❌ Αποτυχία ανανέωσης. " +
      "Τα προηγούμενα δεδομένα παραμένουν στην οθόνη."
    );

  } finally {
    loading = false;

    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "↻ Ανανέωση αποδόσεων";
    }
  }
}

const thresholdInput = $("threshold");

if (thresholdInput) {
  thresholdInput.addEventListener("input", event => {
    threshold = Number(event.target.value);
    $("thresholdValue").textContent = threshold;
    render();
  });
}

const notifyBtn = $("notifyBtn");

if (notifyBtn) {
  notifyBtn.addEventListener("click", async () => {
    if (!("Notification" in window)) {
      alert(
        "Οι ειδοποιήσεις δεν υποστηρίζονται " +
        "σε αυτό το περιβάλλον."
      );
      return;
    }

    try {
      const permission =
        await Notification.requestPermission();

      alert(
        permission === "granted"
          ? "Δόθηκε άδεια ειδοποιήσεων."
          : "Δεν δόθηκε άδεια ειδοποιήσεων."
      );
    } catch {
      alert("Δεν ήταν δυνατή η ενεργοποίηση.");
    }
  });
}

const refreshBtn = $("refreshBtn");

if (refreshBtn) {
  refreshBtn.addEventListener("click", loadLiveGames);
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./sw.js")
    .catch(() => {});
}

render();
loadLiveGames();
