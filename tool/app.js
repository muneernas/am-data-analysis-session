/* Teacher Data Analyzer — client-side only */
(() => {
  const COLORS = ["#1f8fd8", "#0f9f8a", "#e8910f", "#e85a3c", "#6b5ce0", "#2aa5a0", "#f0a202"];
  const MAX_CATS = 12;

  const state = {
    workbook: null,
    sheetNames: [],
    rows: [],
    headers: [],
    profile: null,
    school: null,
    charts: [],
    fileLabel: "",
  };

  const $ = (id) => document.getElementById(id);
  const dropzone = $("dropzone");
  const fileInput = $("fileInput");
  const dashboard = $("dashboard");

  // ——— helpers ———
  function normalizeHeader(h) {
    return String(h ?? "")
      .trim()
      .toLowerCase()
      .replace(/[%_]+/g, " ")
      .replace(/\s+/g, " ");
  }

  function toNumber(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const s = String(v).replace(/,/g, "").replace(/%/g, "").trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function unique(arr) {
    return [...new Set(arr.filter((x) => x != null && String(x).trim() !== ""))];
  }

  function avg(nums) {
    const a = nums.filter((n) => n != null && Number.isFinite(n));
    if (!a.length) return null;
    return a.reduce((s, n) => s + n, 0) / a.length;
  }

  function formatNum(n, digits = 1) {
    if (n == null || !Number.isFinite(n)) return "—";
    return Number.isInteger(n) ? String(n) : n.toFixed(digits);
  }

  function destroyCharts() {
    state.charts.forEach((c) => c.destroy());
    state.charts = [];
  }

  // ——— column profiling ———
  function profileColumns(rows, headers) {
    return headers.map((h) => {
      const values = rows.map((r) => r[h]);
      const nums = values.map(toNumber);
      const numericCount = nums.filter((n) => n != null).length;
      const nonEmpty = values.filter((v) => v != null && String(v).trim() !== "").length;
      const uniq = unique(values.map((v) => (v == null ? "" : String(v).trim())).filter(Boolean));
      const numericRatio = nonEmpty ? numericCount / nonEmpty : 0;
      const isNumeric = numericRatio >= 0.7 && numericCount >= 3;
      const isCategorical = !isNumeric && uniq.length >= 2 && uniq.length <= Math.max(40, rows.length * 0.6);
      return {
        name: h,
        key: normalizeHeader(h),
        isNumeric,
        isCategorical,
        uniqueCount: uniq.length,
        uniques: uniq.slice(0, 200),
      };
    });
  }

  function detectSchoolMap(profile) {
    const find = (...needles) => {
      for (const p of profile) {
        const k = p.key;
        if (needles.some((n) => k === n || k.includes(n))) return p.name;
      }
      return null;
    };

    const map = {
      score: find("score", "mark", "grade %", "percentage"),
      term: find("term", "semester", "period"),
      subject: find("subject", "course"),
      attendance: find("attendance"),
      gradeLevel: find("gradelevel", "grade level", "year group") || findExactGrade(profile),
      learningSupport: find("learningsupport", "learning support", "support", "intervention"),
      studentId: find("studentid", "student id", "id"),
      homework: find("homework"),
    };

    const schoolish = Boolean(map.score || (map.subject && map.term) || map.attendance);
    return schoolish ? map : null;
  }

  function findExactGrade(profile) {
    const hit = profile.find((p) => p.key === "grade" && p.isCategorical);
    return hit ? hit.name : null;
  }

  function filteredRows() {
    const col = $("filterCol").value;
    const val = $("filterVal").value;
    if (!col || !val) return state.rows;
    return state.rows.filter((r) => String(r[col] ?? "") === val);
  }

  function groupAverage(rows, catCol, numCol) {
    const buckets = new Map();
    for (const r of rows) {
      const cat = r[catCol];
      if (cat == null || String(cat).trim() === "") continue;
      const n = toNumber(r[numCol]);
      if (n == null) continue;
      const key = String(cat);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(n);
    }
    let entries = [...buckets.entries()].map(([label, vals]) => ({
      label,
      value: avg(vals),
      count: vals.length,
    }));
    entries.sort((a, b) => b.value - a.value);
    if (entries.length > MAX_CATS) entries = entries.slice(0, MAX_CATS);
    return entries;
  }

  // ——— KPIs ———
  function buildKpis(rows, school, profile) {
    const kpis = [{ label: "Rows", value: String(rows.length) }];

    if (school?.score) {
      const scores = rows.map((r) => toNumber(r[school.score])).filter((n) => n != null);
      kpis.push({ label: "Avg score", value: formatNum(avg(scores)) });
    }
    if (school?.attendance) {
      const a = rows.map((r) => toNumber(r[school.attendance])).filter((n) => n != null);
      kpis.push({ label: "Avg attendance", value: formatNum(avg(a)) + (a.length ? "%" : "") });
    }
    if (school?.studentId) {
      kpis.push({ label: "Students", value: String(unique(rows.map((r) => r[school.studentId])).length) });
    }
    if (school?.subject) {
      kpis.push({ label: "Subjects", value: String(unique(rows.map((r) => r[school.subject])).length) });
    }
    if (school?.term) {
      kpis.push({ label: "Terms", value: String(unique(rows.map((r) => r[school.term])).length) });
    }
    if (school?.homework) {
      const h = rows.map((r) => toNumber(r[school.homework])).filter((n) => n != null);
      if (h.length) kpis.push({ label: "Avg homework", value: formatNum(avg(h)) + "%" });
    }

    if (!school) {
      const nums = profile.filter((p) => p.isNumeric);
      nums.slice(0, 3).forEach((p) => {
        const vals = rows.map((r) => toNumber(r[p.name])).filter((n) => n != null);
        kpis.push({ label: `Avg ${p.name}`, value: formatNum(avg(vals)) });
      });
      const cats = profile.filter((p) => p.isCategorical);
      if (cats[0]) {
        kpis.push({ label: `Unique ${cats[0].name}`, value: String(unique(rows.map((r) => r[cats[0].name])).length) });
      }
    }

    return kpis;
  }

  function renderKpis(kpis) {
    $("kpiStrip").innerHTML = kpis
      .map(
        (k) => `<div class="kpi"><div class="label">${escapeHtml(k.label)}</div><div class="value">${escapeHtml(k.value)}</div></div>`
      )
      .join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ——— charts ———
  function makeChartCard(title, canvasId) {
    const card = document.createElement("div");
    card.className = "chart-card";
    card.innerHTML = `<h3>${escapeHtml(title)}</h3><div class="chart-wrap"><canvas id="${canvasId}"></canvas></div>`;
    return card;
  }

  function addBarChart(grid, id, title, labels, data, label) {
    grid.appendChild(makeChartCard(title, id));
    const chart = new Chart($(id), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: label || "Average",
            data,
            backgroundColor: labels.map((_, i) => COLORS[i % COLORS.length]),
            borderRadius: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: "rgba(18,48,71,0.06)" } },
          x: { grid: { display: false } },
        },
      },
    });
    state.charts.push(chart);
  }

  function addGroupedBar(grid, id, title, labels, datasets) {
    grid.appendChild(makeChartCard(title, id));
    const chart = new Chart($(id), {
      type: "bar",
      data: {
        labels,
        datasets: datasets.map((d, i) => ({
          ...d,
          backgroundColor: COLORS[i % COLORS.length],
          borderRadius: 6,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: {
          y: { beginAtZero: true, grid: { color: "rgba(18,48,71,0.06)" } },
          x: { grid: { display: false } },
        },
      },
    });
    state.charts.push(chart);
  }

  function addScatter(grid, id, title, points) {
    grid.appendChild(makeChartCard(title, id));
    const chart = new Chart($(id), {
      type: "scatter",
      data: {
        datasets: [
          {
            label: "Students / rows",
            data: points,
            backgroundColor: "rgba(31, 143, 216, 0.55)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: "Attendance %" }, grid: { color: "rgba(18,48,71,0.06)" } },
          y: { title: { display: true, text: "Score" }, grid: { color: "rgba(18,48,71,0.06)" } },
        },
      },
    });
    state.charts.push(chart);
  }

  function termSubjectComparison(rows, subjectCol, termCol, scoreCol) {
    const terms = unique(rows.map((r) => r[termCol])).slice(0, 4);
    const subjects = unique(rows.map((r) => r[subjectCol]));
    const topSubjects = subjects.slice(0, MAX_CATS);
    const datasets = terms.map((term) => {
      const data = topSubjects.map((subj) => {
        const vals = rows
          .filter((r) => String(r[termCol]) === String(term) && String(r[subjectCol]) === String(subj))
          .map((r) => toNumber(r[scoreCol]))
          .filter((n) => n != null);
        return avg(vals);
      });
      return { label: String(term), data };
    });
    return { labels: topSubjects.map(String), datasets };
  }

  function renderCharts(rows, school, profile) {
    destroyCharts();
    const grid = $("chartsGrid");
    grid.innerHTML = "";

    const catOverride = $("catOverride").value;
    const numOverride = $("numOverride").value;

    let chartCount = 0;

    if (school) {
      const scoreCol = numOverride || school.score;
      const catCol = catOverride || school.subject;

      if (scoreCol && catCol) {
        const g = groupAverage(rows, catCol, scoreCol);
        if (g.length) {
          addBarChart(
            grid,
            "chart-subj",
            `Average ${scoreCol} by ${catCol}`,
            g.map((x) => x.label),
            g.map((x) => x.value),
            `Avg ${scoreCol}`
          );
          chartCount++;
        }
      }

      if (school.subject && school.term && school.score) {
        const cmp = termSubjectComparison(rows, school.subject, school.term, school.score);
        if (cmp.labels.length && cmp.datasets.length > 1) {
          addGroupedBar(grid, "chart-term", "Average Score by Subject & Term", cmp.labels, cmp.datasets);
          chartCount++;
        }
      }

      if (school.attendance && school.score) {
        const points = rows
          .map((r) => {
            const x = toNumber(r[school.attendance]);
            const y = toNumber(r[school.score]);
            return x != null && y != null ? { x, y } : null;
          })
          .filter(Boolean)
          .slice(0, 500);
        if (points.length >= 5) {
          addScatter(grid, "chart-scatter", "Attendance % vs Score", points);
          chartCount++;
        }
      }

      if (school.learningSupport && school.score) {
        const g = groupAverage(rows, school.learningSupport, school.score);
        if (g.length) {
          addBarChart(
            grid,
            "chart-support",
            "Average Score by Learning Support",
            g.map((x) => x.label),
            g.map((x) => x.value)
          );
          chartCount++;
        }
      }

      if (school.gradeLevel && school.score) {
        const g = groupAverage(rows, school.gradeLevel, school.score);
        if (g.length) {
          addBarChart(
            grid,
            "chart-grade",
            "Average Score by Grade Level",
            g.map((x) => x.label),
            g.map((x) => x.value)
          );
          chartCount++;
        }
      }
    }

    // Generic / fill-in charts
    if (chartCount < 2) {
      const cats = profile.filter((p) => p.isCategorical);
      const nums = profile.filter((p) => p.isNumeric);
      const catCol = catOverride || cats[0]?.name;
      const numCol = numOverride || nums[0]?.name;
      if (catCol && numCol) {
        const g = groupAverage(rows, catCol, numCol);
        if (g.length) {
          addBarChart(
            grid,
            "chart-generic",
            `Average ${numCol} by ${catCol}`,
            g.map((x) => x.label),
            g.map((x) => x.value)
          );
          chartCount++;
        }
      }
      if (nums.length >= 2 && chartCount < 2) {
        const a = nums[0].name;
        const b = nums[1].name;
        const points = rows
          .map((r) => {
            const x = toNumber(r[a]);
            const y = toNumber(r[b]);
            return x != null && y != null ? { x, y } : null;
          })
          .filter(Boolean)
          .slice(0, 400);
        if (points.length >= 5) {
          grid.appendChild(makeChartCard(`${a} vs ${b}`, "chart-gen-scatter"));
          const chart = new Chart($("chart-gen-scatter"), {
            type: "scatter",
            data: {
              datasets: [{ label: "Points", data: points, backgroundColor: "rgba(15,159,138,0.5)" }],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { title: { display: true, text: a } },
                y: { title: { display: true, text: b } },
              },
            },
          });
          state.charts.push(chart);
          chartCount++;
        }
      }
    }

    if (!chartCount) {
      grid.innerHTML = `<p class="empty-note">Could not build charts from this file. Try a sheet with clear headers and numeric columns.</p>`;
    }
  }

  function renderPreview(rows, headers) {
    const slice = rows.slice(0, 8);
    if (!slice.length) {
      $("tablePreview").innerHTML = "<p class='empty-note'>No rows</p>";
      return;
    }
    const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
    const body = slice
      .map((r) => `<tr>${headers.map((h) => `<td>${escapeHtml(r[h] ?? "")}</td>`).join("")}</tr>`)
      .join("");
    $("tablePreview").innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function fillSelect(el, options, includeAuto) {
    const cur = el.value;
    el.innerHTML = includeAuto ? `<option value="">Auto</option>` : "";
    if (!includeAuto && el.id === "filterCol") {
      el.innerHTML = `<option value="">None</option>`;
    }
    options.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o;
      opt.textContent = o;
      el.appendChild(opt);
    });
    if ([...el.options].some((o) => o.value === cur)) el.value = cur;
  }

  function populateControls(headers, profile) {
    fillSelect($("sheetSelect"), state.sheetNames, false);
    const cats = profile.filter((p) => p.isCategorical).map((p) => p.name);
    const nums = profile.filter((p) => p.isNumeric).map((p) => p.name);
    fillSelect($("filterCol"), cats, false);
    fillSelect($("catOverride"), cats, true);
    fillSelect($("numOverride"), nums, true);
    $("filterVal").innerHTML = `<option value="">All</option>`;
    $("filterVal").disabled = true;
  }

  function refreshFilterValues() {
    const col = $("filterCol").value;
    const sel = $("filterVal");
    if (!col) {
      sel.innerHTML = `<option value="">All</option>`;
      sel.disabled = true;
      return;
    }
    const vals = unique(state.rows.map((r) => r[col])).sort((a, b) => String(a).localeCompare(String(b)));
    sel.innerHTML = `<option value="">All</option>` + vals.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
    sel.disabled = false;
  }

  function refreshDashboard() {
    const rows = filteredRows();
    const school = state.school;
    const profile = state.profile;
    const pill = $("modePill");
    if (school) {
      pill.textContent = "School markbook mode";
      pill.classList.remove("generic");
    } else {
      pill.textContent = "Generic mode";
      pill.classList.add("generic");
    }
    renderKpis(buildKpis(rows, school, profile));
    renderCharts(rows, school, profile);
    renderPreview(rows, state.headers);
    dashboard.classList.remove("hidden");
  }

  function rowsFromSheet(workbook, sheetName) {
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    if (!json.length) return { rows: [], headers: [] };
    const headers = Object.keys(json[0]);
    return { rows: json, headers };
  }

  function loadWorkbook(workbook, label) {
    state.workbook = workbook;
    state.sheetNames = workbook.SheetNames || [];
    state.fileLabel = label || "";
    $("fileName").textContent = label ? `Loaded: ${label}` : "";
    if (!state.sheetNames.length) {
      alert("No sheets found in this file.");
      return;
    }
    const first = state.sheetNames[0];
    applySheet(first);
    populateControls(state.headers, state.profile);
    $("sheetSelect").value = first;
    refreshDashboard();
  }

  function applySheet(sheetName) {
    const { rows, headers } = rowsFromSheet(state.workbook, sheetName);
    state.rows = rows;
    state.headers = headers;
    state.profile = profileColumns(rows, headers);
    state.school = detectSchoolMap(state.profile);
  }

  function parseArrayBuffer(buf, fileName) {
    const workbook = XLSX.read(buf, { type: "array" });
    loadWorkbook(workbook, fileName);
  }

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        parseArrayBuffer(new Uint8Array(e.target.result), file.name);
      } catch (err) {
        console.error(err);
        alert("Could not read that file. Try CSV or a simple Excel table with a header row.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function loadSample() {
    try {
      const res = await fetch("../dataset/ahliyyah-mutran-learning.csv");
      if (!res.ok) throw new Error("fetch failed");
      const text = await res.text();
      const workbook = XLSX.read(text, { type: "string" });
      loadWorkbook(workbook, "ahliyyah-mutran-learning.csv (sample)");
    } catch (err) {
      console.error(err);
      alert("Could not load the sample file. Check that dataset/ahliyyah-mutran-learning.csv is available.");
    }
  }

  // ——— events ———
  $("browseBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  $("sampleBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    loadSample();
  });
  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    if (fileInput.files?.[0]) handleFile(fileInput.files[0]);
  });

  ["dragenter", "dragover"].forEach((ev) => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((ev) => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });
  dropzone.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  });

  $("sheetSelect").addEventListener("change", () => {
    applySheet($("sheetSelect").value);
    populateControls(state.headers, state.profile);
    refreshFilterValues();
    refreshDashboard();
  });
  $("filterCol").addEventListener("change", () => {
    refreshFilterValues();
    refreshDashboard();
  });
  $("filterVal").addEventListener("change", refreshDashboard);
  $("catOverride").addEventListener("change", refreshDashboard);
  $("numOverride").addEventListener("change", refreshDashboard);
})();
