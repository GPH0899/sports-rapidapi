import express from "express";
import fetch from "node-fetch";
import path from "path";
import process from "process";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));
app.use(express.static("public"));

const RAPID_API_KEY = process.env.RAPID_API_KEY;
const RAPID_API_HOST = process.env.RAPID_API_HOST || "nfl-api-data.p.rapidapi.com";

// --- API: get calendar entries from RapidAPI ---
app.get("/api/calendar", async (req, res) => {
  try {
    // Use a default day or let frontend specify
    const day = req.query.day || "20181213";
    const url = `https://${RAPID_API_HOST}/nfl-scoreboard-day?day=${day}`;
    const r = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-key": RAPID_API_KEY,
        "x-rapidapi-host": RAPID_API_HOST,
      },
    });
    if (!r.ok) throw new Error(`RapidAPI failed ${r.status}`);
    const data = await r.json();
    // Extract calendar entries from leagues[0].calendar
    const calendar = data?.leagues?.[0]?.calendar || [];
    res.json({ calendar });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Utility: filter ESPN events to live/soon
function filterLiveAndSoon(events, hoursAhead = 6) {
  const now = Date.now();
  const horizon = now + hoursAhead * 60 * 60 * 1000;

  return (events || [])
    .map((ev) => {
      const id = ev?.id;
      const comp = ev?.competitions?.[0];
      const status = ev?.status;
      const state = status?.type?.state; // 'pre' | 'in' | 'post'
      const start = Date.parse(ev?.date || comp?.date || "");
      const shortName = ev?.shortName; // e.g. MIA @ LAC
      return { id, shortName, state, start };
    })
    .filter((g) => {
      if (!g.id || !g.start) return false;
      if (g.state === "in") return true; // currently in-progress
      // upcoming within hoursAhead
      return g.state === "pre" && g.start <= horizon;
    })
    .sort((a, b) => a.start - b.start);
}

// --- API: list games (LIVE + soon) ---
// --- API: list games from RapidAPI ---
app.get("/api/games", async (req, res) => {
  try {
    const day = req.query.day || "20181213"; // You can make this dynamic
    const url = `https://${RAPID_API_HOST}/nfl-scoreboard-day?day=${day}`;
    const r = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-key": RAPID_API_KEY,
        "x-rapidapi-host": RAPID_API_HOST,
      },
    });
    if (!r.ok) throw new Error(`RapidAPI failed ${r.status}`);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Page: index ---
app.get("/", (req, res) => {
  res.render("index", {
    response: null,
    error: null,
  });
});

// --- Your existing gameStatus using RapidAPI nfl-plays ---
function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

function isExplicitStoppage(playTypeText = "", shortText = "") {
  const t = (playTypeText || "").toLowerCase();
  const s = (shortText || "").toLowerCase();
  return (
    t.includes("timeout") ||
    (t.includes("end") && (t.includes("quarter") || t.includes("half") || t.includes("game"))) ||
    t.includes("two-minute warning") ||
    t.includes("review") ||
    s.includes("timeout") ||
    (s.includes("end") && (s.includes("quarter") || s.includes("half") || s.includes("game"))) ||
    s.includes("two-minute warning") ||
    s.includes("review")
  );
}

function inferStoppageFromPlays(plays) {
  if (!Array.isArray(plays) || plays.length === 0) {
    return {
      isStoppage: false,
      confidence: "low",
      stoppageReason: null,
      stoppageDurationSeconds: null,
      gameStatus: "unknown",
      lastPlaySummary: "",
    };
  }
  const sorted = [...plays].sort((a, b) => {
    const sa = Number(a.sequenceNumber ?? 0);
    const sb = Number(b.sequenceNumber ?? 0);
    if (!Number.isNaN(sa) && !Number.isNaN(sb) && sa !== sb) return sa - sb;
    const ta = Date.parse(a.wallclock || "") || 0;
    const tb = Date.parse(b.wallclock || "") || 0;
    return ta - tb;
  });

  const last = sorted[sorted.length - 1] || {};
  const now = Date.now();
  const lastWallclockMs = Date.parse(last.wallclock || "") || null;
  const secsSinceLastPlay = lastWallclockMs ? Math.floor((now - lastWallclockMs) / 1000) : null;
  const periodNum = last?.period?.number ?? null;
  const clockDisp = last?.clock?.displayValue ?? null;
  const typeText = last?.type?.text || last?.type?.alternativeText || "";
  const shortText = last?.shortText || last?.shortAlternativeText || "";

  if (isExplicitStoppage(typeText, shortText)) {
    return {
      isStoppage: true,
      confidence: "high",
      stoppageReason: typeText || "Stoppage",
      stoppageDurationSeconds: secsSinceLastPlay,
      gameStatus: `Q${periodNum ?? "?"} ${clockDisp ?? ""}`.trim(),
      lastPlaySummary: shortText || typeText || "",
    };
  }

  if (secsSinceLastPlay != null && secsSinceLastPlay > 60) {
    return {
      isStoppage: true,
      confidence: "medium",
      stoppageReason: "Possible stoppage (no events > 60s)",
      stoppageDurationSeconds: secsSinceLastPlay,
      gameStatus: `Q${periodNum ?? "?"} ${clockDisp ?? ""}`.trim(),
      lastPlaySummary: shortText || typeText || "",
    };
  }

  return {
    isStoppage: false,
    confidence: "medium",
    stoppageReason: null,
    stoppageDurationSeconds: null,
    gameStatus: `Q${periodNum ?? "?"} ${clockDisp ?? ""}`.trim(),
    lastPlaySummary: shortText || typeText || "",
  };
}

function toUnifiedResponse(gameId, raw) {
  const plays = raw?.items || raw?.plays || [];
  const inf = inferStoppageFromPlays(plays);
  return {
    gameId,
    isStoppage: inf.isStoppage,
    confidence: inf.confidence,
    stoppageReason: inf.stoppageReason,
    stoppageDurationSeconds: inf.stoppageDurationSeconds,
    stoppageDurationPretty: formatDuration(inf.stoppageDurationSeconds),
    gameStatus: inf.gameStatus,
    lastPlaySummary: inf.lastPlaySummary,
    totalPlays: Array.isArray(plays) ? plays.length : 0,
    debug: { lastPlay: plays?.[plays.length - 1] ?? null },
  };
}

app.get("/gameStatus", async (req, res) => {
  const gameId = req.query.gameId;
  if (!gameId) {
    return res.render("index", { error: "Missing gameId", response: null });
  }
  try {
    const url = `https://${RAPID_API_HOST}/nfl-plays?id=${encodeURIComponent(gameId)}`;
    const apiRes = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-key": RAPID_API_KEY,
        "x-rapidapi-host": RAPID_API_HOST,
      },
    });
    if (!apiRes.ok) throw new Error(`RapidAPI failed ${apiRes.status}`);
    const data = await apiRes.json();
    const unified = toUnifiedResponse(gameId, data);
    res.render("index", { response: unified, error: null });
  } catch (e) {
    res.render("index", { response: null, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
