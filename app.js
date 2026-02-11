// ===== ค่าคงที่ตามสูตร (ไม่เปลี่ยน) =====
const DAYS_TOTAL = 24;
const RECEIVE_RATE = 0.9;
const UNIT_DIV = 20;

let mode = "normal";
let lastSnapshot = null;

// ✅ ใช้ key เดิมเพื่อไม่ให้ประวัติหาย
const HISTORY_KEY = "cut_history_v5";
const HISTORY_LIMIT = 5000;

// ===== Helpers =====
function $(id){ return document.getElementById(id); }

function toNumber(v){
  const n = Number(String(v ?? "").replace(/,/g,"").trim());
  return Number.isFinite(n) ? n : 0;
}
function clampInt(n, min, max){
  n = Math.floor(n);
  return Math.max(min, Math.min(max, n));
}
function fmt(n){
  n = Number.isFinite(n) ? n : 0;
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}
function modeLabel(m){
  if (m === "normal") return "ตัดธรรมดา";
  if (m === "reduce") return "ตัดลดยอด";
  return "เพิ่มยอด";
}
function nowThaiString(){ return new Date().toLocaleString("th-TH"); }
function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}


// ===== Date helpers =====
function ym(ts){
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function ymd(ts){
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function thaiMonthLabel(ymKey){
  const [Y,M] = ymKey.split("-").map(Number);
  const dt = new Date(Y, M-1, 1);
  const monthName = dt.toLocaleString("th-TH", { month:"long" });
  return `${monthName} ${Y}`;
}
function thaiDateLabel(ymdKey){
  const [Y,M,D] = ymdKey.split("-").map(Number);
  const dt = new Date(Y, M-1, D);
  return dt.toLocaleDateString("th-TH", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
}

// ===== Input normalize + daysPaid guard =====
function normalizeNumericInput(el){
  if(!el) return;
  let s = String(el.value ?? "");
  s = s.replace(/[,\s]/g, "");     // ลบ , และช่องว่าง
  s = s.replace(/[^\d-]/g, "");    // เอาเฉพาะเลขและ -
  s = s.replace(/(?!^)-/g, "");    // ไม่ให้มี - หลายตัว
  el.value = s;
}
function setDaysPaidWarn(msg){
  const w = $("daysPaidWarn");
  if(!w) return;
  w.textContent = msg || "";
}
function clampDaysPaidLive(){
  const el = $("daysPaid");
  if(!el) return;

  normalizeNumericInput(el);

  if(String(el.value).trim() === ""){
    setDaysPaidWarn("");
    return;
  }

  const n = Number(el.value);
  if(!Number.isFinite(n)){
    el.value = "";
    setDaysPaidWarn(`กรุณาใส่จำนวนวัน 0–${DAYS_TOTAL}`);
    return;
  }

  const clamped = clampInt(n, 0, DAYS_TOTAL);
  if(clamped !== n){
    el.value = String(clamped);
    setDaysPaidWarn(`⚠️ ปรับให้อยู่ในช่วง 0–${DAYS_TOTAL} อัตโนมัติ`);
  } else {
    setDaysPaidWarn("");
  }
}

// ===== NAV (2 หน้า) =====
function setPage(page){
  const isCalc = page === "calc";
  $("page_calc")?.classList.toggle("hidden", !isCalc);
  $("page_history")?.classList.toggle("hidden", isCalc);

  $("nav_calc")?.classList.toggle("active", isCalc);
  $("nav_history")?.classList.toggle("active", !isCalc);

  if(!isCalc) renderHistory();
}

// ===== Mode =====
function setMode(m){
  mode = m;

  $("m_normal")?.classList.toggle("active", m === "normal");
  $("m_reduce")?.classList.toggle("active", m === "reduce");
  $("m_increase")?.classList.toggle("active", m === "increase");

  const showNew = (m === "reduce" || m === "increase");
  $("newBox")?.classList.toggle("hidden", !showNew);
  $("normalResult")?.classList.toggle("hidden", showNew);
  $("newResult")?.classList.toggle("hidden", !showNew);

  if($("newTitle")){
    $("newTitle").textContent =
      m === "reduce" ? "ข้อมูลยอดใหม่ (ลดยอด)"
      : m === "increase" ? "ข้อมูลยอดใหม่ (เพิ่มยอด)"
      : "ข้อมูลยอดใหม่";
  }

  recalc();
}

// ===== 🔒 ตัวล็อกโหมด =====
function checkModeLock(oldP, newP){
  if(mode === "reduce" && newP > oldP) return "โหมดลดยอด: ยอดใหม่ต้องน้อยกว่าหรือเท่ากับยอดเดิม";
  if(mode === "increase" && newP < oldP) return "โหมดเพิ่มยอด: ยอดใหม่ต้องมากกว่าหรือเท่ากับยอดเดิม";
  return "";
}

// ===== Calculator (สูตรเดิม 100%) =====
function recalc(){
  const customerName = ($("customerName")?.value || "").trim();
  const oldP = toNumber($("oldPrincipal")?.value);
  const daysPaid = clampInt(toNumber($("daysPaid")?.value), 0, DAYS_TOTAL);
  const newP = toNumber($("newPrincipal")?.value);

  if(mode !== "normal"){
    const lockMsg = checkModeLock(oldP, newP);
    if(lockMsg){
      $("canCut") && ($("canCut").innerHTML = `<span class="no">ล็อก ❌</span>`);
      $("cashOutNew") && ($("cashOutNew").textContent = "-");
      $("minNewPrincipal") && ($("minNewPrincipal").textContent = "-");
      $("copyStatus") && ($("copyStatus").textContent = lockMsg);
      lastSnapshot = null;
      return;
    } else {
      $("copyStatus") && ($("copyStatus").textContent = "");
    }
  } else {
    $("copyStatus") && ($("copyStatus").textContent = "");
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

  $("payPerDayOld") && ($("payPerDayOld").textContent = `${fmt(payPerDayOld)} บาท`);
  $("receiveOld") && ($("receiveOld").textContent = `${fmt(receiveOld)} บาท`);
  $("daysOwed") && ($("daysOwed").textContent = `${daysOwed} วัน`);
  $("owedAmount") && ($("owedAmount").textContent = `${fmt(owedAmount)} บาท`);

  if($("cashOutNormal")){
    if(cashOutNormal < 0){
      $("cashOutNormal").innerHTML = `<span class="no">❌ ตัดไม่ได้ (${fmt(cashOutNormal)} บาท)</span>`;
    } else {
      $("cashOutNormal").innerHTML = `<span class="ok">✅ ${fmt(cashOutNormal)} บาท</span>`;
    }
  }

  $("receiveNew") && ($("receiveNew").textContent = `${fmt(receiveNew)} บาท`);
  $("payPerDayNew") && ($("payPerDayNew").textContent = `${fmt(payPerDayNew)} บาท`);
  $("minNewPrincipal") && ($("minNewPrincipal").textContent = `${fmt(minNewPrincipal)} บาท`);
  $("canCut") && ($("canCut").innerHTML = canCut ? `<span class="ok">ได้ ✅</span>` : `<span class="no">ไม่ได้ ❌</span>`);
  $("cashOutNew") && ($("cashOutNew").textContent = `${fmt(cashOutNew)} บาท`);

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

// ===== Copy text (ละเอียด) =====
function buildCopyText(s){
  const name = (s.customerName || "").trim() || "(ไม่ใส่ชื่อ)";
  const modeTxt = modeLabel(s.mode);

  const header = `👤 ลูกค้า: ${name}\n🧾 โหมด: ${modeTxt}\n`;

  const common =
    `💰 ยอดเดิม: ${fmt(s.oldP)} | รับจริงเดิม: ${fmt(s.receiveOld)} | งวด/วัน: ${fmt(s.payPerDayOld)}\n` +
    `📅 ส่งแล้ว: ${s.daysPaid} วัน | วันค้าง: ${s.daysOwed} วัน | ยอดค้าง: ${fmt(s.owedAmount)}\n`;

  if(s.mode === "normal"){
    return header + common +
      `✂️ เงินตัดให้ลูกค้า: ${fmt(s.cashOutNormal)} บาท\n` +
      `🔁 หมายเหตุ: ตัดแล้วเริ่มนับใหม่ 1/24 วัน`;
  }

  return header + common +
    `🆕 ยอดใหม่: ${fmt(s.newP)} | รับจริงยอดใหม่: ${fmt(s.receiveNew)} | งวดใหม่/วัน: ${fmt(s.payPerDayNew)}\n` +
    `✅ ตัดได้ไหม: ${s.canCut ? "ได้" : "ไม่ได้"}\n` +
    `💸 เงินที่ลูกค้าได้รับ: ${fmt(s.cashOutNew)} บาท\n` +
    `📌 ขั้นต่ำยอดใหม่ที่ตัดได้: ${fmt(s.minNewPrincipal)} บาท\n` +
    `🔁 หมายเหตุ: ตัดแล้วเริ่มนับใหม่ 1/24 วัน`;
}

// ===== Copy text (สั้นสำหรับส่งจริง) =====
function buildCopyTextShort(s){
  const name = (s.customerName || "").trim() || "ไม่ใส่ชื่อ";
  const modeEmoji = s.mode === "normal" ? "✂️" : (s.mode === "reduce" ? "⬇️" : "⬆️");

  const money = (s.mode === "normal") ? s.cashOutNormal : s.cashOutNew;
  const ok = (s.mode === "normal")
    ? (s.cashOutNormal >= 0 ? "✅" : "❌")
    : (s.canCut ? "✅" : "❌");

  if(!Number.isFinite(money) || money < 0){
    return `👤${name} ${modeEmoji} ${ok} ตัดไม่ได้`;
  }
  return `👤${name} ${modeEmoji} 💸${fmt(money)} บาท`;
}

// ===== Clipboard =====
async function writeClipboard(text){
  if(navigator.clipboard && window.isSecureContext){
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
function loadHistory(){
  try{
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch{
    return [];
  }
}
function saveHistory(arr){
  localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, HISTORY_LIMIT)));
  updateHistoryCount();
}
function updateHistoryCount(){
  const el = $("historyCount");
  if(el) el.textContent = String(loadHistory().length);
}
function addHistoryItem(item){
  const arr = loadHistory();
  arr.unshift(item);
  saveHistory(arr);
}
function deleteHistoryItem(id){
  const arr = loadHistory().filter(x => String(x.id) !== String(id));
  saveHistory(arr);
  renderHistory();
}
function clearHistory(){
  localStorage.removeItem(HISTORY_KEY);
  updateHistoryCount();
  renderHistory();
}

// ===== Copy + Save history ONLY when copying =====
// ✅ คัดลอก "สั้น" แต่บันทึก "ละเอียด" ในประวัติ
async function copyResult(){
  if(!lastSnapshot) return;

  const shortText = buildCopyTextShort(lastSnapshot);
  const detailedText = buildCopyText(lastSnapshot);

  const statusEl = $("copyStatus");

  try{
    await writeClipboard(shortText);

    addHistoryItem({
      id: (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2)),
      ts: Date.now(),
      tsText: nowThaiString(),
      customerName: lastSnapshot.customerName || "",
      mode: lastSnapshot.mode,
      oldP: lastSnapshot.oldP,
      newP: lastSnapshot.newP,
      daysPaid: lastSnapshot.daysPaid,
      owedAmount: lastSnapshot.owedAmount,
      canCut: lastSnapshot.canCut,
      cashOutNormal: lastSnapshot.cashOutNormal,
      cashOutNew: lastSnapshot.cashOutNew,
      copiedText: detailedText,
      copiedTextShort: shortText
    });

    if(statusEl){
      statusEl.textContent = "📋 คัดลอกแบบสั้นแล้ว + บันทึกประวัติ ✅";
      setTimeout(()=> statusEl.textContent = "", 1500);
    }
  }catch{
    if(statusEl){
      statusEl.textContent = "❌ คัดลอกไม่สำเร็จ";
      setTimeout(()=> statusEl.textContent = "", 2000);
    }
  }
}

// ===== XLSX Export =====
function ensureXLSX(){
  if(typeof XLSX === "undefined"){
    alert("ยังโหลดไลบรารี XLSX ไม่สำเร็จ (เช็ค index.html มี script xlsx และเปิดเน็ตได้)");
    return false;
  }
  return true;
}
function historyItemToRow(it){
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
    "ข้อความคัดลอก(สั้น)": it.copiedTextShort || "",
    "ข้อความคัดลอก(ละเอียด)": it.copiedText || ""
  };
}
function exportXLSXAll(){
  if(!ensureXLSX()) return;
  const all = loadHistory();
  if(!all.length){
    alert("ยังไม่มีประวัติให้ส่งออก");
    return;
  }
  const rows = all.map(historyItemToRow);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "ประวัติทั้งหมด");
  XLSX.writeFile(wb, `history_all.xlsx`);
}
function exportXLSXMonth(monthKey){
  if(!ensureXLSX()) return;
  const all = loadHistory().filter(x => ym(x.ts) === monthKey);
  if(!all.length){
    alert("เดือนไม่มีข้อมูลให้ส่งออก");
    return;
  }
  const rows = all.map(historyItemToRow);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, `เดือน ${monthKey}`);
  XLSX.writeFile(wb, `history_${monthKey}.xlsx`);
}

// ===== Render History: เดือน -> วัน -> รายชื่อลูกค้า =====
function renderHistory(){
  const list = $("historyList");
  const all = loadHistory();

  if(!list) return;

  if(!all.length){
    list.innerHTML = `<div class="hint">ยังไม่มีประวัติ (จะบันทึกเมื่อกด “คัดลอกผลลัพธ์”) 🗂️</div>`;
    updateHistoryCount();
    return;
  }

  const monthMap = new Map();
  for(const item of all){
    const mKey = ym(item.ts);
    if(!monthMap.has(mKey)) monthMap.set(mKey, []);
    monthMap.get(mKey).push(item);
  }
  const monthKeys = Array.from(monthMap.keys()).sort((a,b)=> b.localeCompare(a));

  list.innerHTML = monthKeys.map((mKey) => {
    const monthItems = monthMap.get(mKey);

    const dateMap = new Map();
    for(const it of monthItems){
      const dKey = ymd(it.ts);
      if(!dateMap.has(dKey)) dateMap.set(dKey, []);
      dateMap.get(dKey).push(it);
    }
    const dateKeys = Array.from(dateMap.keys()).sort((a,b)=> b.localeCompare(a));

    return `
      <details class="monthCard">
        <summary>
          <span>📅 ${escapeHtml(thaiMonthLabel(mKey))}</span>
          <span class="monthMeta">${monthItems.length} รายการ</span>
        </summary>

        <div class="monthBody">
          <div class="itemButtons" style="margin-top:10px;">
            <button class="smallBtn" type="button" data-action="export-month-xlsx" data-month="${escapeHtml(mKey)}">📤 ส่งออก Excel เดือนนี้</button>
          </div>

          ${dateKeys.map((dKey) => {
            const dayItems = dateMap.get(dKey);
            return `
              <details class="dateCard">
                <summary>
                  <span>🗓️ ${escapeHtml(thaiDateLabel(dKey))}</span>
                  <span class="dateMeta">${dayItems.length} คน</span>
                </summary>
                <div class="dateBody">
                  ${dayItems.map(renderCustomerRow).join("")}
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

function renderCustomerRow(item){
  const name = item.customerName ? item.customerName : "(ไม่ใส่ชื่อ)";
  const modeTxt = modeLabel(item.mode);

  let moneyLine = "";
  if(item.mode === "normal"){
    moneyLine = `💸 เงินตัด: ${fmt(item.cashOutNormal)} บาท`;
  } else {
    moneyLine = `💸 เงินรับ: ${fmt(item.cashOutNew)} บาท (${item.canCut ? "✅ ตัดได้" : "❌ ตัดไม่ได้"})`;
  }

  const short = item.copiedTextShort || "";

  return `
    <div class="historyItem">
      <div class="itemTop">
        <div>
          <div class="itemName">👤 ${escapeHtml(name)} — ${escapeHtml(modeTxt)}</div>
          <div class="itemMeta">⏱️ ${escapeHtml(item.tsText || "")}</div>
        </div>
        <div class="itemMeta">
          🧾 ยอดเดิม ${fmt(item.oldP)} | 📅 ส่งแล้ว ${item.daysPaid} วัน | ⏳ ยอดค้าง ${fmt(item.owedAmount)}
        </div>
      </div>

      <div><b>${escapeHtml(moneyLine)}</b></div>

      ${short ? `<div class="itemMeta" style="margin-top:6px;">📋 ข้อความสั้น: <b>${escapeHtml(short)}</b></div>` : ``}

      <details style="margin-top:10px;">
        <summary class="copySummary">ดูข้อความละเอียดที่บันทึก</summary>
        <div class="pre">${escapeHtml(item.copiedText || "")}</div>
      </details>

      <div class="itemButtons" style="margin-top:12px;">
        <button class="smallBtn" type="button" data-action="copy-short" data-id="${escapeHtml(item.id)}">📋 คัดลอกสั้น</button>
        <button class="smallBtn" type="button" data-action="copy" data-id="${escapeHtml(item.id)}">🧾 คัดลอกละเอียด</button>
        <button class="smallBtn danger" type="button" data-action="delete" data-id="${escapeHtml(item.id)}">🗑️ ลบรายการ</button>
      </div>
    </div>
  `;
}

// ✅ Event Delegation ในประวัติ
function onHistoryClick(e){
  const btn = e.target.closest("button[data-action]");
  if(!btn) return;

  const action = btn.getAttribute("data-action");

  if(action === "export-month-xlsx"){
    exportXLSXMonth(String(btn.getAttribute("data-month") || ""));
    return;
  }

  const id = btn.getAttribute("data-id");

  if(action === "delete"){
    deleteHistoryItem(id);
    return;
  }

  const item = loadHistory().find(x => String(x.id) === String(id));
  if(!item) return;

  if(action === "copy-short"){
    writeClipboard(item.copiedTextShort || item.copiedText || "")
      .then(()=>{
        const old = btn.textContent;
        btn.textContent = "✅ คัดลอกแล้ว";
        setTimeout(()=> btn.textContent = old, 1200);
      })
      .catch(()=>{
        const old = btn.textContent;
        btn.textContent = "❌ ไม่สำเร็จ";
        setTimeout(()=> btn.textContent = old, 1500);
      });
    return;
  }

  if(action === "copy"){
    writeClipboard(item.copiedText || "")
      .then(()=>{
        const old = btn.textContent;
        btn.textContent = "✅ คัดลอกแล้ว";
        setTimeout(()=> btn.textContent = old, 1200);
      })
      .catch(()=>{
        const old = btn.textContent;
        btn.textContent = "❌ ไม่สำเร็จ";
        setTimeout(()=> btn.textContent = old, 1500);
      });
  }
}

// ===== Theme (Dark mode) =====
const THEME_KEY = "ui_theme_v1"; // "dark" | "light" | "auto"

function applyTheme(t){
  document.body.classList.remove("theme-dark","theme-light");
  if(t === "dark") document.body.classList.add("theme-dark");
  else if(t === "light") document.body.classList.add("theme-light");

  const btn = $("themeToggle");
  if(btn){
    const isDark =
      document.body.classList.contains("theme-dark") ||
      (!document.body.classList.contains("theme-light") &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    btn.textContent = isDark ? "☀️" : "🌙";
    btn.title = isDark ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด";
  }
}
function loadTheme(){
  try{ return localStorage.getItem(THEME_KEY) || "auto"; }
  catch{ return "auto"; }
}
function saveTheme(v){
  try{ localStorage.setItem(THEME_KEY, v); }catch{}
}

// ===== One-press delete = clear whole field (มือถือ + คอม) =====
function enableOnePressDeleteClear(){
  const ids = ["oldPrincipal","daysPaid","newPrincipal"];

  ids.forEach(id => {
    const el = $(id);
    if(!el) return;

    let prev = el.value || "";
    let clearing = false;

    function clearNow(){
      if(clearing) return;
      clearing = true;
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles:true }));
      prev = "";
      clearing = false;
    }

    el.addEventListener("focus", () => { prev = el.value || ""; });
    el.addEventListener("click", () => { prev = el.value || ""; });

    el.addEventListener("keydown", (e) => {
      if(e.key === "Backspace" || e.key === "Delete"){
        e.preventDefault();
        clearNow();
      }
    });

    el.addEventListener("beforeinput", (e) => {
      if(e.inputType && e.inputType.includes("delete")){
        e.preventDefault();
        clearNow();
      }
    });

    el.addEventListener("input", (e) => {
      if(clearing) return;
      const cur = el.value || "";
      const t = e.inputType || "";
      if(t.includes("delete") || cur.length < prev.length){
        clearNow();
        return;
      }
      prev = cur;
    });
  });
}

// ===== Keyboard Shortcuts (Operator) =====
// Normal mode: Enter สลับไป-กลับแค่ 2 ช่อง: ยอดเดิม <-> ส่งมาแล้ว(วัน)
// Reduce/Increase: Tab/Shift+Tab วนอยู่ในช่องที่เกี่ยวข้อง ไม่กระโดดไปลิงก์/ปุ่มอื่น
// + Ctrl/Cmd+Enter: copy สั้น (เหมือนกดปุ่มคัดลอก) / Ctrl/Cmd+Shift+Enter: copy ละเอียด / Esc: ล้างฟอร์ม
function enableOperatorShortcuts(){
  const oldEl = $("oldPrincipal");
  const daysEl = $("daysPaid");
  const newEl = $("newPrincipal");

  if(!oldEl || !daysEl) return;

  function focusEl(el){
    if(!el) return;
    el.focus({ preventScroll:true });
    try{ el.select(); }catch{}
  }

  // 1) NORMAL MODE: Enter toggle old <-> days
  function onEnterToggle(e){
    if(e.key !== "Enter") return;

    // กันชนกับ shortcut copy (Ctrl/Cmd/Shift)
    if(e.ctrlKey || e.metaKey || e.shiftKey) return;

    const t = e.target;

    // โหมดธรรมดา: Enter สลับ 2 ช่อง old <-> days
    if(mode === "normal"){
      if(t === oldEl){
        e.preventDefault();
        focusEl(daysEl);
      } else if(t === daysEl){
        e.preventDefault();
        focusEl(oldEl);
      }
      return;
    }

    // โหมดลดยอด/เพิ่มยอด: Enter วน 3 ช่อง old -> days -> new -> old
    if(mode === "reduce" || mode === "increase"){
      if(t === oldEl){
        e.preventDefault();
        focusEl(daysEl);
      } else if(t === daysEl){
        e.preventDefault();
        focusEl(newEl);
      } else if(newEl && t === newEl){
        e.preventDefault();
        focusEl(oldEl);
      }
      return;
    }
  }


  oldEl.addEventListener("keydown", onEnterToggle);
  daysEl.addEventListener("keydown", onEnterToggle);
  if(newEl){
    newEl.addEventListener("keydown", onEnterToggle);
  }


  // 2) Reduce/Increase: trap Tab within [old, days, new]
  function getTabOrder(){
    if(mode === "reduce" || mode === "increase"){
      return [oldEl, daysEl, newEl].filter(Boolean);
    }
    return null;
  }

  function onTabTrap(e){
    if(e.key !== "Tab") return;

    const order = getTabOrder();
    if(!order) return;

    const idx = order.indexOf(e.target);
    if(idx === -1) return;

    e.preventDefault();

    const dir = e.shiftKey ? -1 : 1;
    const next = (idx + dir + order.length) % order.length;
    focusEl(order[next]);
  }

  oldEl.addEventListener("keydown", onTabTrap);
  daysEl.addEventListener("keydown", onTabTrap);
  newEl && newEl.addEventListener("keydown", onTabTrap);

  // 3) Global shortcuts: Ctrl/Cmd+Enter copy, Esc clear
  function onGlobalShortcuts(e){
    const ctrlOrCmd = e.ctrlKey || e.metaKey;

    // Ctrl/Cmd + Shift + Enter => copy detailed ONLY (no history add)
    if(ctrlOrCmd && e.shiftKey && e.key === "Enter"){
      e.preventDefault();
      if(!lastSnapshot) return;
      writeClipboard(buildCopyText(lastSnapshot))
        .then(()=>{
          const s = $("copyStatus");
          if(s){
            s.textContent = "🧾 คัดลอกแบบละเอียดแล้ว ✅";
            setTimeout(()=> s.textContent = "", 1400);
          }
        })
        .catch(()=>{});
      return;
    }

    // Ctrl/Cmd + Enter => copy short + save history
    if(ctrlOrCmd && e.key === "Enter"){
      e.preventDefault();
      copyResult();
      return;
    }

    // Esc => clear form + focus old
    if(e.key === "Escape"){
      e.preventDefault();

      const nameEl2 = $("customerName");
      const oldEl2  = $("oldPrincipal");
      const daysEl2 = $("daysPaid");
      const newEl2  = $("newPrincipal");

      if(nameEl2) nameEl2.value = "";
      if(oldEl2) oldEl2.value = "";
      if(daysEl2) daysEl2.value = "";
      if(newEl2 && (mode === "reduce" || mode === "increase")) newEl2.value = "";

      const w = $("daysPaidWarn");
      if(w) w.textContent = "";

      recalc();

      if(oldEl2){
        oldEl2.focus({ preventScroll:true });
        try{ oldEl2.select(); }catch{}
      }
    }
  }

  if(!window.__loan_shortcuts_bound){
    window.__loan_shortcuts_bound = true;
    window.addEventListener("keydown", onGlobalShortcuts, { passive:false });
  }
}

// ===== Wire (ผูก event แค่ครั้งเดียว) =====
function wire(){
  $("nav_calc")?.addEventListener("click", () => setPage("calc"));
  $("nav_history")?.addEventListener("click", () => setPage("history"));

  $("m_normal")?.addEventListener("click", () => setMode("normal"));
  $("m_reduce")?.addEventListener("click", () => setMode("reduce"));
  $("m_increase")?.addEventListener("click", () => setMode("increase"));

  // normalize ยอดเงิน
  ["oldPrincipal","newPrincipal"].forEach(id=>{
    const el = $(id);
    el?.addEventListener("input", () => {
      normalizeNumericInput(el);
      recalc();
    });
  });

  // clamp daysPaid 0–24 + เตือน
  $("daysPaid")?.addEventListener("input", () => {
    clampDaysPaidLive();
    recalc();
  });

  // ชื่อลูกค้า
  $("customerName")?.addEventListener("input", recalc);

  // copy button
  $("copyBtn")?.addEventListener("click", copyResult);

  // history actions
  $("clearHistoryBtn")?.addEventListener("click", () => {
    const ok = confirm("ล้างประวัติทั้งหมดใช่ไหม?");
    if(ok) clearHistory();
  });

  $("historyList")?.addEventListener("click", onHistoryClick);

  $("exportXlsxAllBtn")?.addEventListener("click", exportXLSXAll);

  // Theme
  $("themeToggle")?.addEventListener("click", () => {
    const current = loadTheme();
    const next = (current === "dark") ? "light" : "dark";
    saveTheme(next);
    applyTheme(next);
  });
  applyTheme(loadTheme());

  // One-press delete
  enableOnePressDeleteClear();

  // Operator shortcuts
  enableOperatorShortcuts();
}

// ===== Start =====
updateHistoryCount();
wire();
setPage("calc");
setMode("normal");
clampDaysPaidLive();
recalc();

