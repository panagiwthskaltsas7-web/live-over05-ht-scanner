
const $ = id => document.getElementById(id);

const API_URL =
  "https://live-over05-ht-scanner.panagiwthskaltsas7.workers.dev/api/scanner";

const STORAGE_KEY = "over05ht-real-history-v1";
const SIGNALS_KEY = "over05ht-real-signals-v1";

let threshold = 10;
let games = [];
let signals = [];
let previous = {};
let loading = false;
let lastUpdated = "—";

try {
  previous = JSON.parse(
    localStorage.getItem(STORAGE_KEY) || "{}"
  );

  signals = JSON.parse(
    localStorage.getItem(SIGNALS_KEY) || "[]"
  );
} catch (error) {
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

function formatPrice(price) {
  return Number(price).toFixed(2);
}

function formatTime(dateString) {
  if (!dateString) return "—";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleTimeString("el-GR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function saveHistory() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(previous)
    );

    localStorage.setItem(
      SIGNALS_KEY,
      JSON.stringify(signals.slice(0, 50))
    );
  } catch (error) {
    console.warn("Could not save history");
  }
}

function notify(game) {
  // Δεν πρόκειται για push ειδοποίηση.
  // Εμφανίζεται μόνο όπου το επιτρέπει ο browser.
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
      console.warn("Notification unavailable");
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
          Δεν βρέθηκαν διαθέσιμοι αγώνες.
        </div>
        <div class="minute">
          Πάτησε Ανανέωση για νέο έλεγχο.
        </div>
      </article>
    `;
  } else {
    $("matches").innerHTML = games.map(game => {
      const state = game.state;

      const label =
        state === "high"
          ? "Ισχυρή πτώση"
          : state === "watch"
            ? "Υπό παρακολούθηση"
            : "Χωρίς σήμα";

      const comparison =
        game.baseline === null
          ? `Τρέχουσα απόδοση: ${formatPrice(game.price)}`
          : `${formatPrice(game.baseline)} → ` +
            `${formatPrice(game.price)}`;

      const movement =
        game.baseline === null
          ? "Πρώτη καταγραφή – αναμονή νέας τιμής"
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
              <small>Stoiximan · πραγματικά δεδομένα</small>
              <b>${formatPrice(game.price)}</b>
            </div>
            <div class="source">
              <small>Τελευταία ενημέρωση</small>
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
    : "Δεν υπάρχουν ακόμη πραγματικά σήματα.";
}

async function loadLiveGames() {
  if (loading) return;

  loading = true;

  try {
    const response = await fetch(API_URL, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data.matches)) {
      throw new Error("Invalid scanner response");
    }

    lastUpdated = formatTime(data.updatedAt);

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

      const name =
        `${match.home} – ${match.away}`;

      const saved = previous[id];

      // Σύγκριση μόνο όταν ο πάροχος
      // έχει διαφορετικό στιγμιότυπο δεδομένων.
      const isNewSnapshot =
        saved &&
        data.updatedAt &&
        saved.updatedAt !== data.updatedAt;

      let baseline = null;
      let drop = 0;

      if (saved && Number.isFinite(Number(saved.price))) {
        baseline = Number(saved.price);

        if (baseline > 0) {
          drop = (1 - price / baseline) * 100;
        }
      }

      let state = "normal";

      if (isNewSnapshot && drop >= threshold) {
        state = "high";
      } else if (
        isNewSnapshot &&
        drop >= threshold * 0.55
      ) {
        state = "watch";
      }

      const game = {
        id,
        name,
        league: match.league || "Ποδόσφαιρο",
        price,
        baseline,
        drop,
        state
      };

      nextGames.push(game);

      if (
        state === "high" &&
        !signals.some(signal =>
          signal.id === id &&
          signal.updatedAt === data.updatedAt
        )
      ) {
        const signal = {
          id,
          name,
          drop,
          baseline,
          price,
          updatedAt: data.updatedAt,
          time: formatTime(data.updatedAt)
        };

        signals.unshift(signal);
        notify(game);
      }

      // Ενημερώνουμε την αποθηκευμένη τιμή
      // μόνο σε νέο στιγμιότυπο.
      if (!saved || isNewSnapshot) {
        previous[id] = {
          price,
          updatedAt: data.updatedAt
        };
      }
    }

    games = nextGames;
    saveHistory();
    render();

  } catch (error) {
    console.error(error);

    alert(
      "Δεν ήταν δυνατή η φόρτωση των δεδομένων. " +
      "Δοκίμασε ξανά αργότερα."
    );

    render();

  } finally {
    loading = false;
  }
}

// Ρύθμιση ορίου πτώσης
$("threshold").addEventListener("input", event => {
  threshold = Number(event.target.value);

  $("thresholdValue").textContent = threshold;

  games = games.map(game => ({
    ...game,
    state:
      game.drop >= threshold &&
      game.baseline !== null
        ? "high"
        : game.drop >= threshold * 0.55 &&
          game.baseline !== null
          ? "watch"
          : "normal"
  }));

  render();
});

// Άδεια ειδοποιήσεων όπου υποστηρίζεται
$("notifyBtn").addEventListener("click", async () => {
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
  } catch (error) {
    alert("Δεν ήταν δυνατή η ενεργοποίηση.");
  }
});

// Ανανέωση με το άνοιγμα της εφαρμογής.
// Δεν υπάρχει αυτόματο polling.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./sw.js")
    .catch(() => {});
}

render();
loadLiveGames();
