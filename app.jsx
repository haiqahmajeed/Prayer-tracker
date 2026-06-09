import { useState, useEffect, useCallback } from "react";

// ── Storage helpers ──────────────────────────────────────────────────────────
const S = {
  async get(k) {
    try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; }
    catch { return null; }
  },
  async set(k, v) {
    try { await window.storage.set(k, JSON.stringify(v)); } catch {}
  }
};

// ── Constants ─────────────────────────────────────────────────────────────────
const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const PRAYER_ICONS = { Fajr: "🌙", Dhuhr: "☀️", Asr: "🌤", Maghrib: "🌅", Isha: "✨" };

const BADGES = [
  { id: "first_day", icon: "🌱", name: "First Step", desc: "Complete all 5 prayers in a day", req: d => d >= 1 },
  { id: "week", icon: "🔥", name: "Week Warrior", desc: "7-day streak", req: (_, s) => s >= 7 },
  { id: "fortnight", icon: "⚡", name: "Unstoppable", desc: "14-day streak", req: (_, s) => s >= 14 },
  { id: "month", icon: "🏆", name: "Champion", desc: "30-day streak", req: (_, s) => s >= 30 },
  { id: "century", icon: "💎", name: "Diamond", desc: "100 perfect days", req: d => d >= 100 },
  { id: "consistent", icon: "🌟", name: "Consistent", desc: "Never missed Fajr for 7 days", req: (_, __, f) => f >= 7 },
];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ── Prayer time fetch ─────────────────────────────────────────────────────────
async function fetchPrayerTimes(lat, lng, date) {
  const d = date || new Date();
  const dateStr = `${d.getDate().toString().padStart(2,"0")}-${(d.getMonth()+1).toString().padStart(2,"0")}-${d.getFullYear()}`;
  const url = `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${lat}&longitude=${lng}&method=2`;
  const res = await fetch(url);
  const json = await res.json();
  return json.data.timings;
}

// ── Geolocation ───────────────────────────────────────────────────────────────
function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) reject("no-geo");
    else navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject("denied")
    );
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function dateKey(y, m, d) {
  return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}
function parseTime(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function nowMinutes() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}
function fmt12(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${((h % 12) || 12)}:${String(m).padStart(2,"0")} ${ampm}`;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("today");
  const [prayerTimes, setPrayerTimes] = useState(null);
  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState("");
  const [records, setRecords] = useState({});
  const [streak, setStreak] = useState(0);
  const [perfectDays, setPerfectDays] = useState(0);
  const [fajrStreak, setFajrStreak] = useState(0);
  const [unlockedBadges, setUnlockedBadges] = useState([]);
  const [newBadge, setNewBadge] = useState(null);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [locError, setLocError] = useState(false);
  const [now, setNow] = useState(new Date());
  const [justChecked, setJustChecked] = useState(null);

  // Tick clock every minute
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // Load data from storage
  useEffect(() => {
    async function load() {
      const rec = await S.get("records") || {};
      const loc = await S.get("location");
      const locName = await S.get("locationName") || "";
      setRecords(rec);
      setLocationName(locName);
      if (loc) {
        setLocation(loc);
        await loadPrayerTimes(loc, rec);
      } else {
        await requestLocation(rec);
      }
    }
    load();
  }, []);

  async function requestLocation(rec) {
    try {
      const loc = await getLocation();
      setLocation(loc);
      await S.set("location", loc);
      // Reverse geocode for city name
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${loc.lat}&lon=${loc.lng}&format=json`);
        const j = await r.json();
        const name = j.address.city || j.address.town || j.address.state || "Your Area";
        setLocationName(name);
        await S.set("locationName", name);
      } catch {}
      await loadPrayerTimes(loc, rec || records);
    } catch {
      setLocError(true);
      setLoading(false);
    }
  }

  async function loadPrayerTimes(loc, rec) {
    try {
      const times = await fetchPrayerTimes(loc.lat, loc.lng);
      setPrayerTimes(times);
      computeStats(rec || records);
    } catch {}
    setLoading(false);
  }

  function computeStats(rec) {
    // Streak: count consecutive days back from today with all 5 prayers done
    let s = 0, perf = 0, fajr = 0;
    const today = todayKey();
    let d = new Date();
    // Don't count today in streak unless complete
    for (let i = 0; i < 365; i++) {
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      if (key === today && i === 0) { d.setDate(d.getDate()-1); continue; }
      const dayRec = rec[key] || {};
      const done = PRAYERS.filter(p => dayRec[p]).length;
      if (done === 5) { s++; perf++; }
      else break;
      d.setDate(d.getDate()-1);
    }
    // Perfect days total
    let totalPerf = 0, totalFajr = 0;
    Object.entries(rec).forEach(([k, v]) => {
      if (PRAYERS.filter(p => v[p]).length === 5) totalPerf++;
      if (v["Fajr"]) totalFajr++;
    });
    setStreak(s);
    setPerfectDays(totalPerf);

    // Fajr streak (consecutive days)
    let fd = 0, fd2 = new Date();
    for (let i = 0; i < 365; i++) {
      const key = `${fd2.getFullYear()}-${String(fd2.getMonth()+1).padStart(2,"0")}-${String(fd2.getDate()).padStart(2,"0")}`;
      if ((rec[key] || {})["Fajr"]) fd++;
      else if (key !== today) break;
      fd2.setDate(fd2.getDate()-1);
    }
    setFajrStreak(fd);

    // Badges
    const earned = BADGES.filter(b => b.req(totalPerf, s, fd)).map(b => b.id);
    setUnlockedBadges(earned);
  }

  async function togglePrayer(prayer) {
    const key = todayKey();
    const updated = {
      ...records,
      [key]: {
        ...(records[key] || {}),
        [prayer]: !(records[key]?.[prayer])
      }
    };
    setRecords(updated);
    await S.set("records", updated);
    computeStats(updated);

    if (updated[key][prayer]) {
      setJustChecked(prayer);
      setTimeout(() => setJustChecked(null), 1200);

      // Check for new badge
      const prevBadges = unlockedBadges;
      setTimeout(() => {
        setUnlockedBadges(prev => {
          const newOnes = prev.filter(b => !prevBadges.includes(b));
          if (newOnes.length > 0) {
            const badge = BADGES.find(b => b.id === newOnes[0]);
            setNewBadge(badge);
            setTimeout(() => setNewBadge(null), 3500);
          }
          return prev;
        });
      }, 300);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return <Splash />;
  if (locError) return <LocError onRetry={() => { setLocError(false); setLoading(true); requestLocation(records); }} />;

  const todayRec = records[todayKey()] || {};
  const doneCount = PRAYERS.filter(p => todayRec[p]).length;
  const nowMin = nowMinutes();

  return (
    <div style={styles.root}>
      {/* Badge toast */}
      {newBadge && (
        <div style={styles.badgeToast}>
          <span style={{ fontSize: 28 }}>{newBadge.icon}</span>
          <div>
            <div style={styles.badgeToastTitle}>Badge Unlocked!</div>
            <div style={styles.badgeToastName}>{newBadge.name}</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>مواقيت الصلاة</div>
          <div style={styles.headerSub}>{locationName || "Prayer Tracker"}</div>
        </div>
        <div style={styles.streakBadge}>
          <span style={{ fontSize: 18 }}>🔥</span>
          <span style={styles.streakNum}>{streak}</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {[["today","Today"], ["calendar","Calendar"], ["rewards","Rewards"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ ...styles.tab, ...(tab === id ? styles.tabActive : {}) }}>
            {label}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {tab === "today" && (
          <TodayView
            prayerTimes={prayerTimes}
            todayRec={todayRec}
            doneCount={doneCount}
            nowMin={nowMin}
            onToggle={togglePrayer}
            justChecked={justChecked}
            streak={streak}
            now={now}
          />
        )}
        {tab === "calendar" && (
          <CalendarView
            records={records}
            calMonth={calMonth}
            calYear={calYear}
            setCalMonth={setCalMonth}
            setCalYear={setCalYear}
          />
        )}
        {tab === "rewards" && (
          <RewardsView
            streak={streak}
            perfectDays={perfectDays}
            fajrStreak={fajrStreak}
            unlockedBadges={unlockedBadges}
            records={records}
          />
        )}
      </div>
    </div>
  );
}

// ── Today View ────────────────────────────────────────────────────────────────
function TodayView({ prayerTimes, todayRec, doneCount, nowMin, onToggle, justChecked, streak, now }) {
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // Find next prayer
  let nextPrayer = null;
  if (prayerTimes) {
    for (const p of PRAYERS) {
      const t = prayerTimes[p];
      if (t && parseTime(t) > nowMin && !todayRec[p]) { nextPrayer = p; break; }
    }
  }

  return (
    <div>
      {/* Date + progress ring */}
      <div style={styles.dateRow}>
        <div style={styles.dateText}>{dateStr}</div>
        {streak > 0 && <div style={styles.streakPill}>🔥 {streak} day streak</div>}
      </div>

      {/* Progress arc */}
      <div style={styles.progressWrap}>
        <ProgressRing done={doneCount} total={5} />
        <div style={styles.progressLabel}>
          <span style={styles.progressNum}>{doneCount}</span>
          <span style={styles.progressOf}>/5</span>
        </div>
        {doneCount === 5 && <div style={styles.completeMsg}>All prayers complete ✨</div>}
      </div>

      {/* Prayer cards */}
      <div style={styles.prayerList}>
        {PRAYERS.map(prayer => {
          const time = prayerTimes?.[prayer];
          const done = !!todayRec[prayer];
          const isNext = prayer === nextPrayer;
          const isJust = prayer === justChecked;
          return (
            <PrayerCard
              key={prayer}
              prayer={prayer}
              time={time}
              done={done}
              isNext={isNext}
              isJust={isJust}
              onToggle={() => onToggle(prayer)}
              nowMin={nowMin}
            />
          );
        })}
      </div>
    </div>
  );
}

function ProgressRing({ done, total }) {
  const r = 44, cx = 56, cy = 56;
  const circ = 2 * Math.PI * r;
  const pct = done / total;
  const dash = circ * pct;
  return (
    <svg width={112} height={112} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EEF0F5" strokeWidth={8} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={done === 5 ? "#7EB99F" : "#A8BCD8"}
        strokeWidth={8} strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round" style={{ transition: "stroke-dasharray 0.6s ease" }} />
    </svg>
  );
}

function PrayerCard({ prayer, time, done, isNext, isJust, onToggle, nowMin }) {
  const isPast = time ? parseTime(time) < nowMin : false;
  const missedUnchecked = isPast && !done;

  return (
    <div style={{
      ...styles.prayerCard,
      ...(isNext ? styles.prayerCardNext : {}),
      ...(done ? styles.prayerCardDone : {}),
    }}>
      <div style={styles.prayerLeft}>
        <span style={styles.prayerIcon}>{PRAYER_ICONS[prayer]}</span>
        <div>
          <div style={{ ...styles.prayerName, ...(done ? { color: "#7EB99F" } : {}) }}>{prayer}</div>
          <div style={styles.prayerTime}>{fmt12(time) || "Loading..."}</div>
        </div>
      </div>
      <div style={styles.prayerRight}>
        {missedUnchecked && !done && <span style={styles.missedDot} title="Missed on time" />}
        {isNext && !done && <span style={styles.nextLabel}>Next</span>}
        <button onClick={onToggle} style={{ ...styles.checkBtn, ...(done ? styles.checkBtnDone : {}), ...(isJust ? styles.checkBtnAnim : {}) }}>
          {done ? "✓" : ""}
        </button>
      </div>
    </div>
  );
}

// ── Calendar View ─────────────────────────────────────────────────────────────
function CalendarView({ records, calMonth, calYear, setCalMonth, setCalYear }) {
  const [selected, setSelected] = useState(null);

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  }

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selKey = selected ? dateKey(calYear, calMonth, selected) : null;
  const selRec = selKey ? (records[selKey] || {}) : null;

  return (
    <div>
      {/* Month nav */}
      <div style={styles.calNav}>
        <button onClick={prevMonth} style={styles.calNavBtn}>‹</button>
        <span style={styles.calMonthLabel}>{MONTHS[calMonth]} {calYear}</span>
        <button onClick={nextMonth} style={styles.calNavBtn}>›</button>
      </div>

      {/* Day headers */}
      <div style={styles.calGrid}>
        {DAYS.map(d => <div key={d} style={styles.calDayHeader}>{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const key = dateKey(calYear, calMonth, d);
          const rec = records[key] || {};
          const done = PRAYERS.filter(p => rec[p]).length;
          const isToday = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
          const isSel = d === selected;
          return (
            <button key={d} onClick={() => setSelected(d === selected ? null : d)} style={{
              ...styles.calDay,
              ...(isToday ? styles.calDayToday : {}),
              ...(isSel ? styles.calDaySelected : {}),
            }}>
              <span style={styles.calDayNum}>{d}</span>
              {done > 0 && <CalDots done={done} />}
            </button>
          );
        })}
      </div>

      {/* Selected day detail */}
      {selected && selRec && (
        <div style={styles.calDetail}>
          <div style={styles.calDetailTitle}>{MONTHS[calMonth]} {selected}</div>
          <div style={styles.calDetailGrid}>
            {PRAYERS.map(p => (
              <div key={p} style={{ ...styles.calDetailPrayer, ...(selRec[p] ? styles.calDetailDone : styles.calDetailMissed) }}>
                <span>{PRAYER_ICONS[p]}</span>
                <span style={{ fontSize: 12, marginTop: 2 }}>{p}</span>
                <span style={{ fontSize: 11 }}>{selRec[p] ? "✓" : "–"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={styles.legend}>
        <div style={styles.legendItem}><CalDots done={5} /><span>All 5</span></div>
        <div style={styles.legendItem}><CalDots done={3} /><span>Partial</span></div>
        <div style={styles.legendItem}><CalDots done={0} /><span>None</span></div>
      </div>
    </div>
  );
}

function CalDots({ done }) {
  const color = done === 5 ? "#7EB99F" : done >= 3 ? "#A8BCD8" : done > 0 ? "#F0C77A" : "#E8E8E8";
  return (
    <div style={{ display: "flex", gap: 2, justifyContent: "center", marginTop: 2 }}>
      {[...Array(Math.min(done, 5))].map((_, i) => (
        <div key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: color }} />
      ))}
    </div>
  );
}

// ── Rewards View ──────────────────────────────────────────────────────────────
function RewardsView({ streak, perfectDays, fajrStreak, unlockedBadges, records }) {
  const totalPrayers = Object.values(records).reduce((sum, day) => sum + PRAYERS.filter(p => day[p]).length, 0);
  const completionRate = Object.keys(records).length > 0
    ? Math.round((perfectDays / Object.keys(records).length) * 100) : 0;

  return (
    <div>
      {/* Flame / visual */}
      <div style={styles.flameWrap}>
        <div style={styles.flameBig}>{streak >= 30 ? "💎" : streak >= 14 ? "⚡" : streak >= 7 ? "🔥" : "🌱"}</div>
        <div style={styles.flameStreak}>{streak}</div>
        <div style={styles.flameSub}>day streak</div>
        {streak > 0 && (
          <div style={styles.flameBar}>
            <div style={{ ...styles.flameBarFill, width: `${Math.min((streak / 30) * 100, 100)}%` }} />
          </div>
        )}
        {streak < 30 && <div style={styles.flameNext}>{30 - streak} days to Diamond 💎</div>}
      </div>

      {/* Stats */}
      <div style={styles.statsGrid}>
        <StatCard icon="🕌" value={totalPrayers} label="Total Prayers" />
        <StatCard icon="✨" value={perfectDays} label="Perfect Days" />
        <StatCard icon="📊" value={`${completionRate}%`} label="Completion" />
        <StatCard icon="🌙" value={fajrStreak} label="Fajr Streak" />
      </div>

      {/* Badges */}
      <div style={styles.badgesTitle}>Badges</div>
      <div style={styles.badgesGrid}>
        {BADGES.map(b => {
          const earned = unlockedBadges.includes(b.id);
          return (
            <div key={b.id} style={{ ...styles.badgeCard, ...(earned ? styles.badgeEarned : styles.badgeLocked) }}>
              <div style={styles.badgeIcon}>{earned ? b.icon : "🔒"}</div>
              <div style={styles.badgeName}>{b.name}</div>
              <div style={styles.badgeDesc}>{b.desc}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ icon, value, label }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statIcon}>{icon}</div>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

// ── Splash / Error ─────────────────────────────────────────────────────────────
function Splash() {
  return (
    <div style={{ ...styles.root, justifyContent: "center", alignItems: "center", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 48 }}>🕌</div>
      <div style={{ fontSize: 22, color: "#3A4A6B", fontWeight: 600 }}>Loading Prayer Times…</div>
      <div style={{ color: "#888", fontSize: 14 }}>Fetching your local times</div>
    </div>
  );
}

function LocError({ onRetry }) {
  return (
    <div style={{ ...styles.root, justifyContent: "center", alignItems: "center", display: "flex", flexDirection: "column", gap: 16, padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 48 }}>📍</div>
      <div style={{ fontSize: 20, color: "#3A4A6B", fontWeight: 600 }}>Location needed</div>
      <div style={{ color: "#666", fontSize: 14, lineHeight: 1.6 }}>
        Prayer times are calculated from your location. Please allow location access when prompted.
      </div>
      <button onClick={onRetry} style={styles.retryBtn}>Allow Location & Continue</button>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  root: { minHeight: "100vh", background: "#F7F8FC", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#2C3A52" },
  header: { background: "#fff", padding: "20px 20px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #ECEEF4" },
  headerTitle: { fontSize: 22, fontWeight: 700, color: "#2C3A52", letterSpacing: "-0.3px" },
  headerSub: { fontSize: 13, color: "#8A96AD", marginTop: 2 },
  streakBadge: { display: "flex", alignItems: "center", gap: 6, background: "#FFF5E6", borderRadius: 20, padding: "6px 14px", border: "1px solid #FFE0B2" },
  streakNum: { fontSize: 18, fontWeight: 700, color: "#E07B39" },

  tabs: { display: "flex", background: "#fff", borderBottom: "1px solid #ECEEF4" },
  tab: { flex: 1, padding: "13px 0", border: "none", background: "none", fontSize: 14, color: "#8A96AD", cursor: "pointer", fontWeight: 500, transition: "all 0.2s" },
  tabActive: { color: "#3A4A6B", borderBottom: "2px solid #A8BCD8", fontWeight: 700 },
  content: { padding: "20px 16px", maxWidth: 480, margin: "0 auto" },

  dateRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  dateText: { fontSize: 15, color: "#5A6880", fontWeight: 500 },
  streakPill: { fontSize: 13, background: "#FFF5E6", color: "#E07B39", borderRadius: 12, padding: "4px 10px", fontWeight: 600 },

  progressWrap: { display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24, position: "relative" },
  progressLabel: { position: "absolute", top: 32, display: "flex", alignItems: "baseline", gap: 2 },
  progressNum: { fontSize: 32, fontWeight: 800, color: "#2C3A52" },
  progressOf: { fontSize: 16, color: "#8A96AD", fontWeight: 500 },
  completeMsg: { marginTop: 8, fontSize: 14, color: "#7EB99F", fontWeight: 600 },

  prayerList: { display: "flex", flexDirection: "column", gap: 10 },
  prayerCard: { background: "#fff", borderRadius: 16, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: "1px solid #F0F2F8", transition: "all 0.2s" },
  prayerCardNext: { border: "1.5px solid #A8BCD8", boxShadow: "0 2px 12px rgba(168,188,216,0.25)" },
  prayerCardDone: { background: "#F5FBF8", border: "1px solid #C8E8D8" },
  prayerLeft: { display: "flex", alignItems: "center", gap: 12 },
  prayerIcon: { fontSize: 22 },
  prayerName: { fontSize: 16, fontWeight: 600, color: "#2C3A52" },
  prayerTime: { fontSize: 13, color: "#8A96AD", marginTop: 2 },
  prayerRight: { display: "flex", alignItems: "center", gap: 8 },
  missedDot: { width: 8, height: 8, borderRadius: "50%", background: "#F0A0A0", display: "inline-block" },
  nextLabel: { fontSize: 11, fontWeight: 700, color: "#A8BCD8", letterSpacing: "0.5px", textTransform: "uppercase" },
  checkBtn: { width: 36, height: 36, borderRadius: "50%", border: "2px solid #E0E4EE", background: "#fff", cursor: "pointer", fontSize: 18, color: "#7EB99F", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" },
  checkBtnDone: { background: "#7EB99F", border: "2px solid #7EB99F", color: "#fff" },
  checkBtnAnim: { transform: "scale(1.25)" },

  calNav: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  calNavBtn: { background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#3A4A6B", padding: "0 8px" },
  calMonthLabel: { fontSize: 18, fontWeight: 700, color: "#2C3A52" },
  calGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 16 },
  calDayHeader: { fontSize: 11, color: "#8A96AD", textAlign: "center", fontWeight: 600, paddingBottom: 6 },
  calDay: { background: "#fff", border: "1px solid #F0F2F8", borderRadius: 10, padding: "6px 2px", textAlign: "center", cursor: "pointer", minHeight: 44, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  calDayToday: { border: "2px solid #A8BCD8", background: "#F0F5FC" },
  calDaySelected: { background: "#E8F0FC", border: "2px solid #7A9DD8" },
  calDayNum: { fontSize: 13, fontWeight: 500, color: "#2C3A52" },
  calDetail: { background: "#fff", borderRadius: 16, padding: 16, marginBottom: 16, boxShadow: "0 1px 6px rgba(0,0,0,0.06)" },
  calDetailTitle: { fontSize: 15, fontWeight: 700, color: "#2C3A52", marginBottom: 12 },
  calDetailGrid: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 },
  calDetailPrayer: { display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 4px", borderRadius: 10, fontSize: 16 },
  calDetailDone: { background: "#F0FAF4", color: "#7EB99F" },
  calDetailMissed: { background: "#FBF0F0", color: "#C88888" },
  legend: { display: "flex", gap: 16, justifyContent: "center", marginTop: 8 },
  legendItem: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8A96AD" },

  flameWrap: { display: "flex", flexDirection: "column", alignItems: "center", background: "#fff", borderRadius: 20, padding: "28px 20px", marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" },
  flameBig: { fontSize: 56 },
  flameStreak: { fontSize: 48, fontWeight: 800, color: "#2C3A52", lineHeight: 1 },
  flameSub: { fontSize: 14, color: "#8A96AD", marginBottom: 14 },
  flameBar: { width: "80%", height: 8, background: "#EEF0F5", borderRadius: 4, overflow: "hidden", marginTop: 8 },
  flameBarFill: { height: "100%", background: "linear-gradient(to right, #A8BCD8, #7EB99F)", borderRadius: 4, transition: "width 0.8s ease" },
  flameNext: { fontSize: 12, color: "#8A96AD", marginTop: 8 },

  statsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 },
  statCard: { background: "#fff", borderRadius: 16, padding: "16px 12px", textAlign: "center", boxShadow: "0 1px 6px rgba(0,0,0,0.06)" },
  statIcon: { fontSize: 22, marginBottom: 6 },
  statValue: { fontSize: 26, fontWeight: 800, color: "#2C3A52" },
  statLabel: { fontSize: 12, color: "#8A96AD", marginTop: 2 },

  badgesTitle: { fontSize: 17, fontWeight: 700, color: "#2C3A52", marginBottom: 12 },
  badgesGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 },
  badgeCard: { borderRadius: 14, padding: "14px 8px", textAlign: "center", border: "1px solid #F0F2F8" },
  badgeEarned: { background: "#F5FBF8", border: "1px solid #C8E8D8" },
  badgeLocked: { background: "#FAFAFA", opacity: 0.6 },
  badgeIcon: { fontSize: 26, marginBottom: 6 },
  badgeName: { fontSize: 12, fontWeight: 700, color: "#2C3A52", marginBottom: 4 },
  badgeDesc: { fontSize: 10, color: "#8A96AD", lineHeight: 1.4 },

  badgeToast: { position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "#fff", borderRadius: 16, padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.15)", zIndex: 1000, border: "1px solid #C8E8D8", animation: "slideDown 0.4s ease" },
  badgeToastTitle: { fontSize: 11, color: "#7EB99F", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" },
  badgeToastName: { fontSize: 15, fontWeight: 700, color: "#2C3A52" },

  retryBtn: { background: "#3A4A6B", color: "#fff", border: "none", borderRadius: 12, padding: "14px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer" },
};
