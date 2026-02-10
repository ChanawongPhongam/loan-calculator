// ===== ค่าคงที่ตามสูตร (ไม่เปลี่ยน) =====
const DAYS_TOTAL = 24;
const RECEIVE_RATE = 0.9;
const UNIT_DIV = 20;

let mode = "normal";
let lastSnapshot = null;

// ✅ ใช้ key เดิมเพื่อไม่ให้ประวัติหาย
const HISTORY_KEY = "cut_history_v5";

// ✅ วันละ 300-400 คน แนะนำ 5000 (ประมาณ 10-15 วัน)
const HISTORY_LIMIT = 5000;

// ===== Helpers =====
function $(id) { return document.getElementById(id); }

function toNumber(v) {
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function clampInt(n, min, max) {
  n = Math.floor(n);
  return Math.max(min, Math.min(max, n));
}

function fmt(n) {
  n = Number.isFinite(n) ? n : 0;
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function modeLabel(m) {
  if (m === "normal") return "ตัดธรรมดา";
  if (m === "reduce") return "ตัดลดยอด";
  return "เพิ่มยอด";
}

function nowThaiString() {
  return new Date().toLocaleString("th-TH");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ===== Date helpers =====
function ym(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; // "2026-02"
}

function ymd(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; // "2026-02-10"
}

function thaiMonthLabel(ymKey) {
  const [Y, M] = ymKey.split("-").map(Number);
  const dt = new Date(Y, M - 1, 1);
  const monthName = dt.toLocaleString("th-TH", { month: "long" });
  return `${monthName} ${Y}`;
}

function thaiDateLabel(ymdKey) {
  const [Y, M, D] = ymdKey.split("-").map(Number);
  const dt = new Date(Y, M - 1, D);
  return dt.toLocaleDateString("th-TH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

// ===== NAV (2 หน้า) =====
function setPage(page) {
  const isCalc = page === "calc";
  $("page_calc").classList.toggle("hidden", !isCalc);
  $("page_history").classList.toggle("hidden", isCalc);

  $("nav_calc").classList.toggle("active", isCalc);
  $("nav_history").classList.toggle("active", !isCalc);

  if (!isCalc) renderHistory();
}

// ===== Mode =====
function setMode(m) {
  mode = m;

  $("m_normal").classList.toggle("active", m === "normal");
  $("m_reduce").classList.toggle("active", m === "reduce");
  $("m_increase").classList.toggle("active", m === "increase");

  const showNew = (m === "reduce" || m === "increase");
  $("newBox").classList.toggle("hidden", !showNew);
  $("normalResult").classList.toggle("hidden", showNew);
  $("newResult").classList.toggle("hidden", !showNew);

  $("newTitle").textContent =
    m === "reduce" ? "ข้อมูลยอดใหม่ (ลดยอด)"
      : m === "increase" ? "ข้อมูลยอดใหม่ (เพิ่มยอด)"
        : "ข้อมูลยอดใหม่";

  recalc();
}

// ===== 🔒 ตัวล็อกโหมด =====
function checkModeLock(oldP, newP) {
  if (mode === "reduce" && newP > oldP) return "โหมดลดยอด: ยอดใหม่ต้องน้อยกว่าหรือเท่ากับยอดเดิม";
  if (mode === "increase" && newP < oldP) return "โหมดเพิ่มยอด: ยอดใหม่ต้องมากกว่าหรือเท่ากับยอดเดิม";
  return "";
}

// ===== Calculator (สูตรเดิม 100%) =====
function recalc() {
  const customerName = ($("customerName").value || "").trim();
  const oldP = toNumber($("oldPrincipal").value);
  const daysPaid = clampInt(toNumber($("daysPaid").value), 0, DAYS_TOTAL);
  const newP = toNumber($("newPrincipal").value);

  if (mode !== "normal") {
    const lockMsg = checkModeLock(oldP, newP);
    if (lockMsg) {
      $("canCut").innerHTML = `<span class="no">ล็อก ❌</span>`;
      $("cashOutNew").textContent = "-";
      $("minNewPrincipal").textContent = "-";
      $("copyStatus").textContent = lockMsg;
      lastSnapshot = null;
      return;
    } else {
      $("copyStatus").textContent = "";
    }
  } else {
    $("copyStatus").textContent = "";
  }

  const payPerDayOld = oldP > 0 ? oldP / UNIT_DIV : 0;
  const receiveOld = oldP * RECEIVE_RATE;

  const daysOwed = DAYS_TOTAL - daysPaid;
  const owedAmount = daysOwed * payPerDayOld;

  const cashOutNormal = receiveOld - owedAmount;

  const receiveNew = newP * RECEIVE_RATE;
  const payPerDayNew = newP > 0 ? newP / UNIT_DIV : 0;
  const cashOutNew = receiveNew - owedAmount;
  const canCut = cashOutNew >= 0;

  const minNewPrincipal = owedAmount > 0 ? Math.ceil(owedAmount / RECEIVE_RATE) : 0;

  $("payPerDayOld").textContent = `${fmt(payPerDayOld)} บาท`;
  $("receiveOld").textContent = `${fmt(receiveOld)} บาท`;
  $("daysOwed").textContent = `${daysOwed} วัน`;
  $("owedAmount").textContent = `${fmt(owedAmount)} บาท`;
  if (cashOutNormal < 0) {
    $("cashOutNormal").innerHTML =
      `<span class="no">❌ ตัดไม่ได้ (${fmt(cashOutNormal)} บาท)</span>`;
  } else {
    $("cashOutNormal").innerHTML =
      `<span class="ok">✅ ${fmt(cashOutNormal)} บาท</span>`;
  }


  $("receiveNew").textContent = `${fmt(receiveNew)} บาท`;
  $("payPerDayNew").textContent = `${fmt(payPerDayNew)} บาท`;
  $("minNewPrincipal").textContent = `${fmt(minNewPrincipal)} บาท`;
  $("canCut").innerHTML = canCut ? `<span class="ok">ได้ ✅</span>` : `<span class="no">ไม่ได้ ❌</span>`;
  $("cashOutNew").textContent = `${fmt(cashOutNew)} บาท`;

  lastSnapshot = {
    customerName,
    mode,
    oldP,
    daysPaid,
    payPerDayOld,
    receiveOld,
    daysOwed,
    owedAmount,
    cashOutNormal,
    newP,
    receiveNew,
    payPerDayNew,
    canCut,
    cashOutNew,
    minNewPrincipal
  };
}

function buildCopyText(s) {
  const nameLine = s.customerName ? `ลูกค้า: ${s.customerName}\n` : "";
  const common =
    `โหมด: ${modeLabel(s.mode)}\n` +
    `ยอดเดิม: ${fmt(s.oldP)} | รับจริงเดิม: ${fmt(s.receiveOld)} | งวด/วัน: ${fmt(s.payPerDayOld)}\n` +
    `ส่งแล้ว: ${s.daysPaid} วัน | วันค้าง: ${s.daysOwed} วัน | ยอดค้าง: ${fmt(s.owedAmount)}\n`;

  if (s.mode === "normal") {
    return nameLine + common +
      `เงินตัดให้ลูกค้า: ${fmt(s.cashOutNormal)} บาท\n` +
      `หมายเหตุ: ตัดแล้วเริ่มนับใหม่ 1/24 วัน`;
  }

  return nameLine + common +
    `ยอดใหม่: ${fmt(s.newP)} | รับจริงยอดใหม่: ${fmt(s.receiveNew)} | งวดใหม่/วัน: ${fmt(s.payPerDayNew)}\n` +
    `ตัดได้ไหม: ${s.canCut ? "ได้" : "ไม่ได้"}\n` +
    `เงินที่ลูกค้าได้รับ: ${fmt(s.cashOutNew)} บาท\n` +
    `ขั้นต่ำยอดใหม่ที่ตัดได้: ${fmt(s.minNewPrincipal)} บาท\n` +
    `หมายเหตุ: ตัดแล้วเริ่มนับใหม่ 1/24 วัน`;
}

// ===== Clipboard =====
async function writeClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

// ===== History store =====
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveHistory(arr) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, HISTORY_LIMIT)));
  updateHistoryCount();
}

function updateHistoryCount() {
  $("historyCount").textContent = String(loadHistory().length);
}

function addHistoryItem(item) {
  const arr = loadHistory();
  arr.unshift(item);
  saveHistory(arr);
}

function deleteHistoryItem(id) {
  const arr = loadHistory().filter(x => String(x.id) !== String(id));
  saveHistory(arr);
  renderHistory();
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  updateHistoryCount();
  renderHistory();
}

// ===== Copy + Save history ONLY when copying =====
async function copyResult() {
  if (!lastSnapshot) return;

  const text = buildCopyText(lastSnapshot);
  const statusEl = $("copyStatus");

  try {
    await writeClipboard(text);

    addHistoryItem({
      id: (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2)),
      ts: Date.now(),
      tsText: nowThaiString(),
      customerName: lastSnapshot.customerName || "",

      // เก็บข้อมูลที่ต้องใช้ส่งออก Excel ด้วย (ครบ)
      mode: lastSnapshot.mode,
      oldP: lastSnapshot.oldP,
      newP: lastSnapshot.newP,
      daysPaid: lastSnapshot.daysPaid,
      owedAmount: lastSnapshot.owedAmount,
      canCut: lastSnapshot.canCut,
      cashOutNormal: lastSnapshot.cashOutNormal,
      cashOutNew: lastSnapshot.cashOutNew,

      copiedText: text
    });

    statusEl.textContent = "คัดลอกแล้ว + บันทึกประวัติ ✅";
    setTimeout(() => statusEl.textContent = "", 1500);
  } catch {
    statusEl.textContent = "คัดลอกไม่สำเร็จ ❌";
    setTimeout(() => statusEl.textContent = "", 2000);
  }
}

// ===== XLSX Export =====
function ensureXLSX() {
  if (typeof XLSX === "undefined") {
    alert("ยังโหลดไลบรารี XLSX ไม่สำเร็จ (เช็คว่าเปิดเน็ตได้ และมี script xlsx ใน index.html)");
    return false;
  }
  return true;
}

function historyItemToRow(it) {
  const dt = new Date(it.ts);
  return {
    "เดือน": ym(it.ts),
    "วันที่": dt.toLocaleDateString("th-TH"),
    "เวลา": dt.toLocaleTimeString("th-TH"),
    "ชื่อลูกค้า": it.customerName || "",
    "โหมด": modeLabel(it.mode),
    "ยอดเดิม": it.oldP ?? "",
    "ยอดใหม่": it.newP ?? "",
    "ส่งแล้ว(วัน)": it.daysPaid ?? "",
    "ยอดค้าง": it.owedAmount ?? "",
    "ตัดได้ไหม": it.mode === "normal" ? "" : (it.canCut ? "ได้" : "ไม่ได้"),
    "เงินตัดธรรมดา": it.mode === "normal" ? (it.cashOutNormal ?? "") : "",
    "เงินรับ(ลดยอด/เพิ่มยอด)": it.mode !== "normal" ? (it.cashOutNew ?? "") : "",
    "ข้อความที่คัดลอก": it.copiedText || ""
  };
}

function exportXLSXAll() {
  if (!ensureXLSX()) return;

  const all = loadHistory();
  if (!all.length) {
    alert("ยังไม่มีประวัติให้ส่งออก");
    return;
  }

  const rows = all.map(historyItemToRow);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  ws["!cols"] = [
    { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 22 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 40 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, "ประวัติทั้งหมด");
  XLSX.writeFile(wb, `history_all.xlsx`);
}

function exportXLSXMonth(monthKey) {
  if (!ensureXLSX()) return;

  const all = loadHistory().filter(x => ym(x.ts) === monthKey);
  if (!all.length) {
    alert("เดือนไม่มีข้อมูลให้ส่งออก");
    return;
  }

  const rows = all.map(historyItemToRow);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  ws["!cols"] = [
    { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 22 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 40 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, `เดือน ${monthKey}`);
  XLSX.writeFile(wb, `history_${monthKey}.xlsx`);
}

// ===== Render History: เดือน -> วัน -> รายชื่อลูกค้า (เปิดวันแล้วโชว์ลูกค้าทันที) =====
function renderHistory() {
  const list = $("historyList");
  const all = loadHistory();

  if (!all.length) {
    list.innerHTML = `<div class="hint">ยังไม่มีประวัติ (จะบันทึกเมื่อกด “คัดลอกผลลัพธ์”)</div>`;
    updateHistoryCount();
    return;
  }

  // Group by month
  const monthMap = new Map(); // "YYYY-MM" -> items[]
  for (const item of all) {
    const mKey = ym(item.ts);
    if (!monthMap.has(mKey)) monthMap.set(mKey, []);
    monthMap.get(mKey).push(item);
  }

  const monthKeys = Array.from(monthMap.keys()).sort((a, b) => b.localeCompare(a)); // ล่าสุดก่อน

  list.innerHTML = monthKeys.map((mKey) => {
    const monthItems = monthMap.get(mKey);

    // Group by date in month
    const dateMap = new Map(); // "YYYY-MM-DD" -> items[]
    for (const it of monthItems) {
      const dKey = ymd(it.ts);
      if (!dateMap.has(dKey)) dateMap.set(dKey, []);
      dateMap.get(dKey).push(it);
    }
    const dateKeys = Array.from(dateMap.keys()).sort((a, b) => b.localeCompare(a));

    return `
      <details class="monthCard">
        <summary>
          <span>${escapeHtml(thaiMonthLabel(mKey))}</span>
          <span class="monthMeta">${monthItems.length} รายการ</span>
        </summary>

        <div class="monthBody">
          <div class="itemButtons" style="margin-top:10px;">
            <button class="smallBtn" type="button" data-action="export-month-xlsx" data-month="${escapeHtml(mKey)}">
              ส่งออก Excel เดือนนี้
            </button>
          </div>

          ${dateKeys.map((dKey) => {
      const dayItems = dateMap.get(dKey);

      const dayRows = dayItems.map(renderCustomerRow).join("");

      return `
              <details class="dateCard">
                <summary>
                  <span>${escapeHtml(thaiDateLabel(dKey))}</span>
                  <span class="dateMeta">${dayItems.length} คน</span>
                </summary>
                <div class="dateBody">
                  ${dayRows}
                </div>
              </details>
            `;
    }).join("")}
        </div>
      </details>
    `;
  }).join("");

  updateHistoryCount();
}

function renderCustomerRow(item) {
  const name = item.customerName ? item.customerName : "(ไม่ใส่ชื่อ)";
  const modeTxt = modeLabel(item.mode);

  let moneyLine = "";
  if (item.mode === "normal") {
    moneyLine = `เงินตัด: ${fmt(item.cashOutNormal)} บาท`;
  } else {
    moneyLine = `เงินรับ: ${fmt(item.cashOutNew)} บาท (${item.canCut ? "ตัดได้" : "ตัดไม่ได้"})`;
  }

  return `
    <div class="historyItem">
      <div class="itemTop">
        <div>
          <div class="itemName">${escapeHtml(name)} — ${escapeHtml(modeTxt)}</div>
          <div class="itemMeta">${escapeHtml(item.tsText || "")}</div>
        </div>
        <div class="itemMeta">
          ยอดเดิม ${fmt(item.oldP)} | ส่งแล้ว ${item.daysPaid} วัน | ยอดค้าง ${fmt(item.owedAmount)}
        </div>
      </div>

      <div><b>${escapeHtml(moneyLine)}</b></div>

      <details style="margin-top:8px;">
        <summary class="itemMeta" style="cursor:pointer;">ดูข้อความที่คัดลอก</summary>
        <div class="pre">${escapeHtml(item.copiedText || "")}</div>
      </details>

      <div class="itemButtons" style="margin-top:10px;">
        <button class="smallBtn" type="button" data-action="copy" data-id="${escapeHtml(item.id)}">คัดลอกอีกครั้ง</button>
        <button class="smallBtn danger" type="button" data-action="delete" data-id="${escapeHtml(item.id)}">ลบรายการ</button>
      </div>
    </div>
  `;
}

// ✅ Event Delegation: ปุ่มคัดลอก/ลบ/ส่งออก Excel ในประวัติไม่หลุด
function onHistoryClick(e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.getAttribute("data-action");

  if (action === "export-month-xlsx") {
    const mKey = btn.getAttribute("data-month");
    exportXLSXMonth(String(mKey));
    return;
  }

  const id = btn.getAttribute("data-id");
  const item = loadHistory().find(x => String(x.id) === String(id));
  if (!item) return;

  if (action === "delete") {
    deleteHistoryItem(id);
    return;
  }

  if (action === "copy") {
    writeClipboard(item.copiedText || "")
      .then(() => {
        const old = btn.textContent;
        btn.textContent = "คัดลอกแล้ว ✅";
        setTimeout(() => btn.textContent = old, 1200);
      })
      .catch(() => {
        const old = btn.textContent;
        btn.textContent = "คัดลอกไม่ได้ ❌";
        setTimeout(() => btn.textContent = old, 1500);
      });
  }
}

// ===== Wire =====
$("nav_calc").addEventListener("click", () => setPage("calc"));
$("nav_history").addEventListener("click", () => setPage("history"));

$("m_normal").addEventListener("click", () => setMode("normal"));
$("m_reduce").addEventListener("click", () => setMode("reduce"));
$("m_increase").addEventListener("click", () => setMode("increase"));

["customerName", "oldPrincipal", "daysPaid", "newPrincipal"].forEach(id => {
  $(id).addEventListener("input", recalc);
});

$("copyBtn").addEventListener("click", copyResult);

// Theme toggle
const themeBtn = document.getElementById("themeToggle");
if(themeBtn){
  themeBtn.addEventListener("click", () => {
    // toggle dark <-> light (ง่ายสุดสำหรับใช้งานจริง)
    const current = loadTheme();
    const next = (current === "dark") ? "light" : "dark";
    saveTheme(next);
    applyTheme(next);
  });
}

// Apply theme on load
applyTheme(loadTheme());

// Update icon if system theme changes while on auto
if(window.matchMedia){
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if(loadTheme() === "auto") applyTheme("auto");
  });
}


$("clearHistoryBtn").addEventListener("click", () => {
  const ok = confirm("ล้างประวัติทั้งหมดใช่ไหม?");
  if (ok) clearHistory();
});

$("historyList").addEventListener("click", onHistoryClick);

// Export all button (บนหัวหน้า history)
$("exportXlsxAllBtn").addEventListener("click", exportXLSXAll);

// ===== Theme (Dark mode) =====
const THEME_KEY = "ui_theme_v1"; // "dark" | "light" | "auto"

function applyTheme(mode){
  // mode: "dark" | "light" | "auto"
  document.body.classList.remove("theme-dark", "theme-light");

  if(mode === "dark"){
    document.body.classList.add("theme-dark");
  } else if(mode === "light"){
    document.body.classList.add("theme-light");
  } else {
    // auto: follow system, but allow prefers-color-scheme to do work
    // no class needed
  }

  const btn = document.getElementById("themeToggle");
  if(btn){
    const isDark = document.body.classList.contains("theme-dark") ||
      (!document.body.classList.contains("theme-light") && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);

    btn.textContent = isDark ? "☀️" : "🌙";
    btn.title = isDark ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด";
  }
}

function loadTheme(){
  try{
    return localStorage.getItem(THEME_KEY) || "auto";
  }catch{
    return "auto";
  }
}

function saveTheme(v){
  try{ localStorage.setItem(THEME_KEY, v); }catch{}
}


// Start
updateHistoryCount();
setPage("calc");
setMode("normal");
recalc();


