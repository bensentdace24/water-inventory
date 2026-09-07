const STORAGE_KEY = "entries";
const LOCAL_FALLBACK_KEY = "gallon-log-entries-fallback";
let entries = [];
let editingId = null;
let usingFallback = false;

const $ = (id) => document.getElementById(id);

function hasCloudStorage() {
  return (
    typeof window.storage !== "undefined" &&
    window.storage &&
    typeof window.storage.get === "function"
  );
}

async function storageGetEntries() {
  if (hasCloudStorage()) {
    try {
      const res = await window.storage.get(STORAGE_KEY, true);
      usingFallback = false;
      return res && res.value ? JSON.parse(res.value) : [];
    } catch (e) {
      // Key may not exist yet, or the call failed — fall through to local storage.
    }
  }
  usingFallback = true;
  try {
    const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

async function storageSetEntries(data) {
  if (hasCloudStorage()) {
    try {
      const result = await window.storage.set(
        STORAGE_KEY,
        JSON.stringify(data),
        true,
      );
      if (result) {
        usingFallback = false;
        return true;
      }
    } catch (e) {
      // fall through to local storage
    }
  }
  usingFallback = true;
  try {
    localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1800);
}

async function loadEntries() {
  entries = await storageGetEntries();
  render();
  if (usingFallback) {
    showToast("Saving to this device only (not shared with staff)");
  }
}

async function persistEntries() {
  const ok = await storageSetEntries(entries);
  if (!ok) {
    showToast("Could not save — try again");
  }
}

function formatDayLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function renderStats() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  weekAgo.setHours(0, 0, 0, 0);

  let weekDelivered = 0,
    weekEmpty = 0,
    totalDelivered = 0,
    totalEmpty = 0;
  entries.forEach((e) => {
    const d = new Date(e.date + "T00:00:00");
    totalDelivered += num(e.delivered);
    totalEmpty += num(e.empty);
    if (d >= weekAgo) {
      weekDelivered += num(e.delivered);
      weekEmpty += num(e.empty);
    }
  });

  $("statTotalDelivered").textContent = totalDelivered;
  $("statTotalEmpty").textContent = totalEmpty;
  $("statWeekDelivered").textContent = weekDelivered;
  $("statOut").textContent = totalDelivered - totalEmpty;
}

function renderList() {
  const container = $("listContainer");
  container.innerHTML = "";

  if (entries.length === 0) {
    container.innerHTML =
      '<div class="empty-state"><strong>No entries yet</strong>Tap the + button to log your first delivery.</div>';
    return;
  }

  const sorted = [...entries].sort(
    (a, b) =>
      b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0),
  );
  const groups = {};
  sorted.forEach((e) => {
    (groups[e.date] = groups[e.date] || []).push(e);
  });

  Object.keys(groups)
    .sort((a, b) => b.localeCompare(a))
    .forEach((dateKey) => {
      const groupEl = document.createElement("div");
      groupEl.className = "day-group";
      const label = document.createElement("div");
      label.className = "day-label";
      label.textContent = formatDayLabel(dateKey);
      groupEl.appendChild(label);

      groups[dateKey].forEach((e) => {
        const delivered = num(e.delivered);
        const empty = num(e.empty);
        const flowClass =
          delivered > empty ? "flow-out" : empty > delivered ? "flow-in" : "";

        const row = document.createElement("div");
        row.className = "row " + flowClass;

        const chipsHtml =
          delivered || empty
            ? (delivered
                ? '<span class="chip delivered numeric">+' +
                  delivered +
                  " delivered</span>"
                : "") +
              (empty
                ? '<span class="chip empty numeric">' +
                  empty +
                  " returned</span>"
                : "")
            : '<span class="chip none">No activity logged</span>';

        const peopleParts = [];
        if (e.deliveredBy)
          peopleParts.push(
            "<b>" + escapeHtml(e.deliveredBy) + "</b> delivered",
          );
        if (e.receivedBy)
          peopleParts.push("<b>" + escapeHtml(e.receivedBy) + "</b> received");

        row.innerHTML =
          '<div class="row-main">' +
          '<div class="chips">' +
          chipsHtml +
          "</div>" +
          (peopleParts.length
            ? '<div class="people">' + peopleParts.join(" &middot; ") + "</div>"
            : "") +
          (e.notes
            ? '<div class="notes">' + escapeHtml(e.notes) + "</div>"
            : "") +
          "</div>" +
          '<div class="row-actions">' +
          '<button class="icon-btn" data-edit="' +
          e.id +
          '" title="Edit">&#9998;</button>' +
          "</div>";

        groupEl.appendChild(row);
      });

      container.appendChild(groupEl);
    });

  container.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () =>
      openSheet(btn.getAttribute("data-edit")),
    );
  });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function updateNameList() {
  const names = new Set();
  entries.forEach((e) => {
    if (e.deliveredBy) names.add(e.deliveredBy);
    if (e.receivedBy) names.add(e.receivedBy);
  });
  const list = $("nameList");
  list.innerHTML = "";
  names.forEach((n) => {
    const opt = document.createElement("option");
    opt.value = n;
    list.appendChild(opt);
  });
}

function render() {
  renderStats();
  renderList();
  updateNameList();
}

function openSheet(id) {
  editingId = id || null;
  const overlay = $("overlay");
  const sheet = $("sheet");

  if (editingId) {
    const e = entries.find((x) => x.id === editingId);
    $("sheetTitle").textContent = "Edit entry";
    $("fDate").value = e.date;
    $("fDelivered").value = e.delivered || "";
    $("fEmpty").value = e.empty || "";
    $("fDeliveredBy").value = e.deliveredBy || "";
    $("fReceivedBy").value = e.receivedBy || "";
    $("fNotes").value = e.notes || "";
    $("deleteBtn").style.display = "block";
  } else {
    $("sheetTitle").textContent = "Add entry";
    $("entryForm").reset();
    $("fDate").value = todayISO();
    $("deleteBtn").style.display = "none";
  }

  overlay.classList.add("show");
  sheet.classList.add("show");
}

function closeSheet() {
  $("overlay").classList.remove("show");
  $("sheet").classList.remove("show");
  editingId = null;
}

$("fabAdd").addEventListener("click", () => openSheet(null));
$("cancelBtn").addEventListener("click", closeSheet);
$("overlay").addEventListener("click", closeSheet);

$("entryForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const data = {
    id:
      editingId ||
      (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    date: $("fDate").value,
    delivered: $("fDelivered").value ? parseFloat($("fDelivered").value) : 0,
    empty: $("fEmpty").value ? parseFloat($("fEmpty").value) : 0,
    deliveredBy: $("fDeliveredBy").value.trim(),
    receivedBy: $("fReceivedBy").value.trim(),
    notes: $("fNotes").value.trim(),
    createdAt: editingId
      ? (entries.find((x) => x.id === editingId) || {}).createdAt || Date.now()
      : Date.now(),
  };

  if (editingId) {
    entries = entries.map((e) => (e.id === editingId ? data : e));
  } else {
    entries.push(data);
  }

  render();
  closeSheet();
  showToast("Entry saved");
  await persistEntries();
});

$("deleteBtn").addEventListener("click", async () => {
  if (!editingId) return;
  if (!confirm("Delete this entry? This cannot be undone.")) return;
  entries = entries.filter((e) => e.id !== editingId);
  render();
  closeSheet();
  showToast("Entry deleted");
  await persistEntries();
});

loadEntries();
