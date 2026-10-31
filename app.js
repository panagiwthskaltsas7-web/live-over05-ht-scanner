
const $ = id => document.getElementById(id);

const API_URL =
  "https://live-over05-ht-scanner.panagiwthskaltsas7.workers.dev/api/scanner";

const HISTORY_KEY = "over05ht-real-history-v1";
const SIGNALS_KEY = "over05ht-real-signals-v1";

let threshold = 10;
let games = [];
let signals = [];
let previous = {};
let loading = false;
let lastUpdated = "—";
let lastSnapshot = null;
let lastFetched = null;
let isCached = false;

try {
  previous = JSON.parse(
    localStorage.getItem(HISTORY_KEY) || "{}"
  );

  signals = JSON.parse(
    localStorage.getItem(SIGNALS_KEY) || "[]"
  );
} catch {
  previous = {};
  signals = [];
}

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
  return Number(value).toFixed(2);
}

function formatTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

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

  if (minutes < 1) {
    return "λιγότερο από 1 λεπτό";
  }

  if (minutes < 60) {
    return `${minutes} λεπτά`;
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  return `${hours} ώρ. ${remaining} λεπ.`;
}

function saveHistory() {
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(previous)
    );

    localStorage.setItem(
      SIGNALS_KEY,
      JSON.stringify(signals.slice(0, 50))
    );
  } catch (error) {
    console.warn("Storage unavailable", error);
  }
}

function getStatus(game) {
  // Δεν εμφανίζουμε σήμα από παλιά
  // ή επαναλαμβανόμενα στιγμιότυπα.
  if (!game.newSnapshot) return "normal";

  if (game.drop >= threshold) return "high";

  if (game.drop >= threshold * 0.55) {
    return "watch";
  }

  return "normal";
}

function updateRefreshStatus(message) {
  const element = $("refreshStatus");

  if (element) {
    element.textContent = message;
  }
}

function notify(game) {
  if (
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    try {
      new Notification("Over 0.5 HT – Πτώση απόδοσης", {
        body:
          `${game.name}: ` +
          `${formatPrice(game.baseline)} → ` +
          `${formatPrice(game.price)} ` +
          `(-${game.drop.toFixed(1)}%)`
      });
    } catch (error) {
      console.warn("Notification unavailable", error);
    }
  }
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
          Πάτησε Ανανέωση για νέο έλεγχο.
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

      const comparison =
        game.baseline === null
          ? `Τρέχουσα απόδοση: ${formatPrice(game.price)}`
          : `${formatPrice(game.baseline)} → ` +
            `${formatPrice(game.price)}`;

      const movement =
        game.baseline === null
          ? "Πρώτη καταγραφή"
          : !game.newSnapshot
            ? "Δεν υπάρχει νέο στιγμιότυπο για σύγκριση"
            : game.drop > 0
              ? `Πτώση ${game.drop.toFixed(1)}%`
              : game.drop < 0
                ? `Άνοδος ${Math.abs(game.drop).toFixed(1)}%`
                : "Χωρίς μεταβολή";

      return `
        <article class="match">
          <div class="matchhead">
            <div>
              <div class="matchname">
                ${escapeHTML(game.name)}
              </div>

              <div class="minute">
                ${escapeHTML(game.league)}
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
              <small>Stoiximan</small>
              <b>${formatPrice(game.price)}</b>
            </div>

            <div class="source">
              <small>Ώρα δεδομένων</small>
              <b>${escapeHTML(lastUpdated)}</b>
            </div>
          </div>

          <div class="bar">
            <span style="width:${
              Math.min(
                Math.max(game.drop, 0) * 3,
                100
              )
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
          <b>-${Number(signal.drop).toFixed(1)}%</b>
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
    "Έλεγχος διαθέσιμων δεδομένων Stoiximan..."
  );

  try {
    const response = await fetch(
      API_URL + "?t=" + Date.now(),
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data.matches)) {
      throw new Error("Invalid API response");
    }

    const snapshot =
      data.updatedAt || data.fetchedAt || null;

    const fetched = data.fetchedAt || null;

    lastSnapshot = snapshot;
    lastFetched = fetched;
    isCached = Boolean(data.cached);
    lastUpdated = formatTime(snapshot);

    const nextGames = [];

    for (const match of data.matches) {
      const price = Number(match.price);

      if (!Number.isFinite(price) || price <= 1) {
        continue;
      }

      const id =
        String(match.eventId) +
        ":" +
        String(match.selectionId);

      const saved = previous[id];

      const name =
        `${match.home} – ${match.away}`;

      let baseline = null;
      let drop = 0;
      let newSnapshot = false;

      if (
        saved &&
        Number.isFinite(Number(saved.price))
      ) {
        baseline = Number(saved.price);

        newSnapshot = Boolean(
          snapshot &&
          saved.updatedAt &&
          snapshot !== saved.updatedAt
        );

        if (baseline > 0) {
          drop = (1 - price / baseline) * 100;
        }
      }

      const game = {
        id,
        name,
        league: match.league || "Ποδόσφαιρο",
        price,
        baseline,
        drop,
        newSnapshot
      };

      nextGames.push(game);

      if (
        newSnapshot &&
        drop >= threshold &&
        !signals.some(signal =>
          signal.id === id &&
          signal.updatedAt === snapshot
        )
      ) {
        signals.unshift({
          id,
          name,
          drop,
          baseline,
          price,
          updatedAt: snapshot,
          time: formatTime(snapshot)
        });

        notify(game);
      }

      if (!saved || newSnapshot) {
        previous[id] = {
          price,
          updatedAt: snapshot
        };
      }
    }

    games = nextGames;

    saveHistory();
    render();

    const age = formatAge(lastSnapshot);

    const ageMinutes = lastSnapshot
      ? (Date.now() - new Date(lastSnapshot).getTime()) / 60000
      : Infinity;

    if (ageMinutes >= 60) {
      updateRefreshStatus(
        `⚠️ Παλιά δεδομένα: ${age}. ` +
        `Τελευταία ενημέρωση: ${lastUpdated}. ` +
        `Η ανανέωση δεν έφερε νεότερες αποδόσεις.`
      );
    } else {
      updateRefreshStatus(
        `✓ Ο έλεγχος ολοκληρώθηκε. ` +
        `Ώρα δεδομένων: ${lastUpdated}. ` +
        `Ηλικία: ${age}. ` +
        (isCached
          ? "Απάντηση από προσωρινή μνήμη."
          : "Απάντηση από τον πάροχο.")
      );
    }

  } catch (error) {
    console.error("Scanner refresh failed:", error);

    updateRefreshStatus(
      "❌ Αποτυχία ανανέωσης. " +
      "Οι προηγούμενοι αγώνες παραμένουν στην οθόνη."
    );

  } finally {
    loading = false;

    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent =
        "↻ Ανανέωση αποδόσεων";
    }
  }
}

$("threshold").addEventListener(
  "input",
  event => {
    threshold = Number(event.target.value);

    $("thresholdValue").textContent = threshold;

    render();
  }
);

$("notifyBtn").addEventListener(
  "click",
  async () => {
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
  }
);

const refreshBtn = $("refreshBtn");

if (refreshBtn) {
  refreshBtn.addEventListener(
    "click",
    loadLiveGames
  );
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./sw.js")
    .catch(() => {});
}

render();
loadLiveGames();
