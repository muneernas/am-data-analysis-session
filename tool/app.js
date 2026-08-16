/* Teacher Data Analyzer — client-side only */
(() => {
  const COLORS = ["#1f8fd8", "#0f9f8a", "#e8910f", "#e85a3c", "#6b5ce0", "#2aa5a0", "#f0a202"];
  const MAX_CATS = 12;

  const state = {
    workbook: null,
    sheetNames: [],
    rawRows: [],
    rawHeaders: [],
    rows: [],
    headers: [],
    profile: null,
    school: null,
    mode: "generic", // school | wide | criteria | roster | generic
    notice: "",
    charts: [],
    fileLabel: "",
    subjectHint: "",
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
    if (!s || s === "-" || s === "–" || s === "—" || /^n\/?a$/i.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function subjectFromFileName(label) {
    const s = String(label || "");
    const m = s.match(/-\s*([^-]+?)\s*-\s*Grade\s*\d/i);
    return m ? m[1].trim() : "";
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

  function isEmptyHeader(h) {
    const s = String(h ?? "").trim();
    return !s || /^__empty/i.test(s) || /^empty$/i.test(s);
  }

  function isSensitiveKey(key) {
    return /\b(password|passwd|pwd)\b/.test(key);
  }

  function isIdentityKey(key) {
    return (
      /^(index|student name|student|name|first name|last name|full name)$/.test(key) ||
      /\b(student name|first name|last name|full name|login name|username|user name)\b/.test(key) ||
      /\b(id number|student id|district student id|national id)\b/.test(key) ||
      key === "id" ||
      key === "index"
    );
  }

  function isMetaKey(key) {
    return (
      isSensitiveKey(key) ||
      isIdentityKey(key) ||
      /\b(nationality|birth country|birth|dob|day|month|year|email|phone|class(es)?|homeroom)\b/.test(key) ||
      /\b(optional)\b/.test(key)
    );
  }

  function looksLikeScoreColumn(name, profileCol, rows) {
    const key = normalizeHeader(name);
    if (isMetaKey(key) || isSensitiveKey(key)) return false;
    if (!profileCol?.isNumeric) return false;
    if (/\b(term|semester|score|mark|percent|assessment|exam|quiz|test|total|average|avg)\b/.test(key)) {
      return true;
    }
    // School subject-style headers: "Math - Second Term"
    if (/\s-\s/.test(String(name)) && profileCol.isNumeric) return true;
    // Values mostly in common mark scales (0–100 or MYP 0–8)
    const vals = rows.map((r) => toNumber(r[name])).filter((n) => n != null);
    if (vals.length < Math.max(3, Math.floor(rows.length * 0.3))) return false;
    const in100 = vals.filter((n) => n >= 0 && n <= 100).length;
    const in8 = vals.filter((n) => n >= 0 && n <= 8).length;
    return in100 / vals.length >= 0.75 || in8 / vals.length >= 0.75;
  }

  function forwardFillUnits(row) {
    let last = "";
    return (row || []).map((cell, idx) => {
      if (idx === 0) return "";
      const t = String(cell ?? "").trim();
      if (t) {
        last = t;
        return t;
      }
      return last;
    });
  }

  function detectCriteriaGradebook(aoa) {
    if (!aoa || aoa.length < 3) return false;
    const r0 = aoa[0] || [];
    const r1 = aoa[1] || [];
    if (!/student\s*name/i.test(String(r1[0] ?? ""))) return false;
    const crits = r1
      .slice(1)
      .map((c) => String(c ?? "").trim())
      .filter(Boolean);
    if (crits.length < 4) return false;
    const units = forwardFillUnits(r0);
    const unitLabels = unique(units.slice(1).filter(Boolean));
    const hasUnits = unitLabels.some((u) => /unit|progress|term|report|end of|summative/i.test(u));
    const uniqCrit = new Set(crits.map((c) => c.toLowerCase()));
    const hasRepeats = uniqCrit.size >= 2 && uniqCrit.size < crits.length;
    return hasUnits || hasRepeats;
  }

  function parseCriteriaGradebook(aoa) {
    const units = forwardFillUnits(aoa[0] || []);
    const criteria = aoa[1] || [];
    const longRows = [];
    let missing = 0;
    let filled = 0;

    for (let r = 2; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const student = String(row[0] ?? "").trim();
      if (!student) continue;
      for (let c = 1; c < criteria.length; c++) {
        const criterion = String(criteria[c] ?? "").trim();
        if (!criterion) continue;
        const unit = String(units[c] ?? "").trim() || "—";
        const raw = row[c];
        const blank = raw == null || String(raw).trim() === "" || String(raw).trim() === "-";
        const score = toNumber(raw);
        if (score == null) {
          if (blank || String(raw).trim() === "-") missing++;
          continue;
        }
        filled++;
        longRows.push({
          Student: student,
          Unit: unit,
          Criterion: criterion,
          Score: score,
        });
      }
    }

    const flatHeaders = criteria.map((crit, c) => {
      if (c === 0) return "Student Name";
      const criterion = String(crit ?? "").trim();
      const unit = String(units[c] ?? "").trim();
      return unit ? `${unit} · ${criterion}` : criterion;
    });

    const previewRows = [];
    for (let r = 2; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const student = String(row[0] ?? "").trim();
      if (!student) continue;
      const obj = {};
      flatHeaders.forEach((h, c) => {
        obj[h] = c === 0 ? student : row[c] ?? "";
      });
      previewRows.push(obj);
    }

    return {
      longRows,
      flatHeaders,
      previewRows,
      filled,
      missing,
      unitCount: unique(longRows.map((r) => r.Unit)).length,
      criterionCount: unique(longRows.map((r) => r.Criterion)).length,
      studentCount: unique(longRows.map((r) => r.Student)).length,
    };
  }

  function parseSubjectTerm(header) {
    const raw = String(header).trim();
    const parts = raw.split(/\s[-–—]\s/);
    if (parts.length >= 2) {
      return { subject: parts.slice(0, -1).join(" - ").trim(), term: parts[parts.length - 1].trim() };
    }
    return { subject: raw, term: "" };
  }

  function findStudentCol(headers) {
    const scored = headers.map((h) => {
      const k = normalizeHeader(h);
      let score = 0;
      if (k === "student name" || k.includes("student name")) score = 100;
      else if (k === "name" || k === "full name") score = 90;
      else if (k.includes("first name")) score = 70;
      else if (k.includes("login name") || k.includes("username")) score = 40;
      else if (k.includes("student") && !k.includes("id")) score = 60;
      return { h, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.score >= 40 ? scored[0].h : null;
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
      const key = normalizeHeader(h);
      const tooManyUniques = uniq.length > Math.max(40, Math.floor(rows.length * 0.6));
      const isCategorical =
        !isNumeric && !isSensitiveKey(key) && uniq.length >= 2 && !tooManyUniques;
      return {
        name: h,
        key,
        isNumeric,
        isCategorical,
        uniqueCount: uniq.length,
        uniques: uniq.slice(0, 200),
        nonEmpty,
      };
    });
  }

  function detectSchoolMap(profile) {
    const find = (...needles) => {
      for (const p of profile) {
        const k = p.key;
        if (isSensitiveKey(k)) continue;
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
      learningSupport: find("learningsupport", "learning support", "intervention"),
      studentId: find("studentid", "student id", "id number"),
      studentName: find("student name", "full name"),
      homework: find("homework"),
    };

    const schoolish = Boolean(map.score || (map.subject && map.term) || map.attendance);
    return schoolish ? map : null;
  }

  function findExactGrade(profile) {
    const hit = profile.find((p) => (p.key === "grade" || p.key === "grade (optional)") && p.isCategorical);
    return hit ? hit.name : null;
  }

  function detectWideMarkbook(rows, headers, profile) {
    const scoreCols = headers.filter((h) => {
      const p = profile.find((x) => x.name === h);
      return looksLikeScoreColumn(h, p, rows);
    });
    if (scoreCols.length < 3) return null;
    const studentCol = findStudentCol(headers);
    return { scoreCols, studentCol };
  }

  function isRosterOnly(headers, profile, rows) {
    const keys = headers.map(normalizeHeader);
    const hasLoginish = keys.some((k) => /password|login name|username|user name/.test(k));
    const scoreish = profile.filter((p) => looksLikeScoreColumn(p.name, p, rows));
    const usefulNumeric = profile.filter(
      (p) => p.isNumeric && !isMetaKey(p.key) && !isSensitiveKey(p.key) && p.nonEmpty >= 3
    );
    return hasLoginish && scoreish.length === 0 && usefulNumeric.length === 0;
  }

  function unpivotWide(rows, scoreCols, studentCol) {
    const out = [];
    for (const r of rows) {
      const student = studentCol ? String(r[studentCol] ?? "").trim() : "";
      for (const col of scoreCols) {
        const score = toNumber(r[col]);
        if (score == null) continue;
        const { subject, term } = parseSubjectTerm(col);
        out.push({
          Student: student,
          Subject: subject,
          Term: term || "—",
          Score: score,
          Assessment: col,
        });
      }
    }
    return out;
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

  function groupCount(rows, catCol) {
    const buckets = new Map();
    for (const r of rows) {
      const cat = r[catCol];
      if (cat == null || String(cat).trim() === "") continue;
      const key = String(cat);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    let entries = [...buckets.entries()].map(([label, value]) => ({ label, value }));
    entries.sort((a, b) => b.value - a.value);
    if (entries.length > MAX_CATS) entries = entries.slice(0, MAX_CATS);
    return entries;
  }

  // ——— KPIs ———
  function buildKpis(rows, school, profile) {
    if (state.mode === "roster") {
      return [
        { label: "Students", value: String(state.rawRows.length) },
        { label: "Score columns", value: "0" },
        { label: "Charts", value: "N/A" },
      ];
    }

    const kpis = [];

    if (state.mode === "criteria") {
      kpis.push({ label: "Students", value: String(unique(rows.map((r) => r.Student)).length) });
      if (state.subjectHint) kpis.push({ label: "Subject", value: state.subjectHint });
      kpis.push({ label: "Units / periods", value: String(unique(rows.map((r) => r.Unit)).filter((u) => u && u !== "—").length) });
      kpis.push({ label: "Criteria", value: String(unique(rows.map((r) => r.Criterion)).length) });
      const scores = rows.map((r) => toNumber(r.Score)).filter((n) => n != null);
      kpis.push({ label: "Avg mark", value: formatNum(avg(scores)) });
      kpis.push({ label: "Marks entered", value: String(scores.length) });
      return kpis;
    }

    if (state.mode === "wide") {
      kpis.push({ label: "Students", value: String(state.rawRows.length) });
      kpis.push({ label: "Score cells", value: String(rows.length) });
    } else {
      kpis.push({ label: "Rows", value: String(rows.length) });
    }

    if (school?.score) {
      const scores = rows.map((r) => toNumber(r[school.score])).filter((n) => n != null);
      kpis.push({ label: "Avg score", value: formatNum(avg(scores)) });
      if (scores.length) {
        kpis.push({ label: "Min score", value: formatNum(Math.min(...scores), 0) });
        kpis.push({ label: "Max score", value: formatNum(Math.max(...scores), 0) });
      }
    }
    if (school?.attendance) {
      const a = rows.map((r) => toNumber(r[school.attendance])).filter((n) => n != null);
      kpis.push({ label: "Avg attendance", value: formatNum(avg(a)) + (a.length ? "%" : "") });
    }
    if (school?.studentId) {
      kpis.push({ label: "Students", value: String(unique(rows.map((r) => r[school.studentId])).length) });
    } else if (school?.studentName && state.mode !== "wide") {
      kpis.push({ label: "Students", value: String(unique(rows.map((r) => r[school.studentName])).length) });
    }
    if (school?.subject) {
      kpis.push({ label: "Subjects", value: String(unique(rows.map((r) => r[school.subject])).length) });
    }
    if (school?.term) {
      const terms = unique(rows.map((r) => r[school.term])).filter((t) => t && t !== "—");
      if (terms.length) kpis.push({ label: "Terms", value: String(terms.length) });
    }
    if (school?.homework) {
      const h = rows.map((r) => toNumber(r[school.homework])).filter((n) => n != null);
      if (h.length) kpis.push({ label: "Avg homework", value: formatNum(avg(h)) + "%" });
    }

    if (!school) {
      const nums = profile.filter((p) => p.isNumeric && !isSensitiveKey(p.key) && !isMetaKey(p.key));
      nums.slice(0, 3).forEach((p) => {
        const vals = rows.map((r) => toNumber(r[p.name])).filter((n) => n != null);
        kpis.push({ label: `Avg ${shortLabel(p.name)}`, value: formatNum(avg(vals)) });
      });
      const cats = profile.filter((p) => p.isCategorical);
      if (cats[0]) {
        kpis.push({
          label: `Unique ${shortLabel(cats[0].name)}`,
          value: String(unique(rows.map((r) => r[cats[0].name])).length),
        });
      }
    }

    return kpis;
  }

  function shortLabel(s) {
    const t = String(s);
    return t.length > 22 ? t.slice(0, 20) + "…" : t;
  }

  function renderKpis(kpis) {
    $("kpiStrip").innerHTML = kpis
      .map(
        (k) =>
          `<div class="kpi"><div class="label">${escapeHtml(k.label)}</div><div class="value">${escapeHtml(k.value)}</div></div>`
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

  function addScatter(grid, id, title, points, xTitle, yTitle) {
    grid.appendChild(makeChartCard(title, id));
    const chart = new Chart($(id), {
      type: "scatter",
      data: {
        datasets: [
          {
            label: "Points",
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
          x: { title: { display: true, text: xTitle || "X" }, grid: { color: "rgba(18,48,71,0.06)" } },
          y: { title: { display: true, text: yTitle || "Y" }, grid: { color: "rgba(18,48,71,0.06)" } },
        },
      },
    });
    state.charts.push(chart);
  }

  function termSubjectComparison(rows, subjectCol, termCol, scoreCol) {
    const terms = unique(rows.map((r) => r[termCol]))
      .filter((t) => t && t !== "—")
      .slice(0, 4);
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

  function studentAverages(rows, studentCol, scoreCol, limit = 10) {
    const buckets = new Map();
    for (const r of rows) {
      const s = String(r[studentCol] ?? "").trim();
      if (!s) continue;
      const n = toNumber(r[scoreCol]);
      if (n == null) continue;
      if (!buckets.has(s)) buckets.set(s, []);
      buckets.get(s).push(n);
    }
    return [...buckets.entries()]
      .map(([label, vals]) => ({ label: shortLabel(label), value: avg(vals), full: label }))
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  }

  function renderCharts(rows, school, profile) {
    destroyCharts();
    const grid = $("chartsGrid");
    grid.innerHTML = "";

    if (state.mode === "roster") {
      grid.innerHTML = `<div class="notice-box">
        <strong>This looks like a login / roster export</strong>, not a markbook with scores.
        <p>Columns like login name and password can’t produce useful grade charts. Upload a file with subject or assessment scores (for example an Excel export with Math, English, Science columns), or use <em>Load sample dataset</em>.</p>
      </div>`;
      return;
    }

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
            state.mode === "criteria" ? "Average mark by criterion" : `Average ${shortLabel(scoreCol)} by ${shortLabel(catCol)}`,
            g.map((x) => x.label),
            g.map((x) => x.value),
            `Avg ${scoreCol}`
          );
          chartCount++;
        }
      }

      if (state.mode === "criteria" && school.term) {
        const g = groupAverage(rows, school.term, school.score);
        if (g.length) {
          addBarChart(
            grid,
            "chart-unit",
            "Average mark by unit / period",
            g.map((x) => x.label),
            g.map((x) => x.value)
          );
          chartCount++;
        }
      }

      if (school.subject && school.term && school.score) {
        const cmp = termSubjectComparison(rows, school.subject, school.term, school.score);
        if (cmp.labels.length && cmp.datasets.length >= 1 && cmp.datasets.some((d) => d.label !== "—")) {
          if (cmp.datasets.length > 1) {
            addGroupedBar(
              grid,
              "chart-term",
              state.mode === "criteria" ? "Average mark by criterion & unit" : "Average Score by Subject & Term",
              cmp.labels,
              cmp.datasets
            );
            chartCount++;
          }
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
          addScatter(grid, "chart-scatter", "Attendance % vs Score", points, "Attendance %", "Score");
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

      // Student averages for criteria / wide markbooks
      if ((state.mode === "wide" || state.mode === "criteria") && school.score && (school.studentName || "Student")) {
        const studentCol = school.studentName || "Student";
        const top = studentAverages(rows, studentCol, school.score, 8);
        if (top.length >= 3) {
          addBarChart(
            grid,
            "chart-students-top",
            "Highest overall averages",
            top.map((x) => x.label),
            top.map((x) => x.value)
          );
          chartCount++;
        }
      }
    }

    // Generic / fill-in charts
    if (chartCount < 2) {
      const cats = profile.filter((p) => p.isCategorical);
      const nums = profile.filter((p) => p.isNumeric && !isSensitiveKey(p.key));
      const catCol = catOverride || cats[0]?.name;
      const numCol = numOverride || nums[0]?.name;
      if (catCol && numCol) {
        const g = groupAverage(rows, catCol, numCol);
        if (g.length) {
          addBarChart(
            grid,
            "chart-generic",
            `Average ${shortLabel(numCol)} by ${shortLabel(catCol)}`,
            g.map((x) => x.label),
            g.map((x) => x.value)
          );
          chartCount++;
        }
      } else if (catCol && !numCol) {
        const g = groupCount(rows, catCol);
        if (g.length) {
          addBarChart(grid, "chart-counts", `Count by ${shortLabel(catCol)}`, g.map((x) => x.label), g.map((x) => x.value), "Count");
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
          addScatter(grid, "chart-gen-scatter", `${shortLabel(a)} vs ${shortLabel(b)}`, points, a, b);
          chartCount++;
        }
      }
    }

    if (!chartCount) {
      grid.innerHTML = `<p class="empty-note">Could not build charts from this file. Try a markbook with subject score columns, or the sample dataset.</p>`;
    }
  }

  function renderPreview(rows, headers) {
    const safeHeaders = headers.filter((h) => !isSensitiveKey(normalizeHeader(h)));
    const slice = rows.slice(0, 8);
    if (!slice.length) {
      $("tablePreview").innerHTML = "<p class='empty-note'>No rows</p>";
      return;
    }
    const head = safeHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
    const body = slice
      .map((r) => `<tr>${safeHeaders.map((h) => `<td>${escapeHtml(r[h] ?? "")}</td>`).join("")}</tr>`)
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
    const nums = profile.filter((p) => p.isNumeric && !isSensitiveKey(p.key)).map((p) => p.name);
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
    sel.innerHTML =
      `<option value="">All</option>` +
      vals.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
    sel.disabled = false;
  }

  function refreshDashboard() {
    const rows = filteredRows();
    const school = state.school;
    const profile = state.profile;
    const pill = $("modePill");
    const notice = $("fileNotice");

    if (state.mode === "wide") {
      pill.textContent = "Wide markbook mode";
      pill.classList.remove("generic");
    } else if (state.mode === "criteria") {
      pill.textContent = state.subjectHint
        ? `Subject gradebook · ${state.subjectHint}`
        : "Subject gradebook (units + criteria)";
      pill.classList.remove("generic");
    } else if (state.mode === "school") {
      pill.textContent = "School markbook mode";
      pill.classList.remove("generic");
    } else if (state.mode === "roster") {
      pill.textContent = "Roster / login file";
      pill.classList.add("generic");
    } else {
      pill.textContent = "Generic mode";
      pill.classList.add("generic");
    }

    if (notice) {
      if (state.notice) {
        notice.textContent = state.notice;
        notice.classList.remove("hidden");
      } else {
        notice.textContent = "";
        notice.classList.add("hidden");
      }
    }

    renderKpis(buildKpis(rows, school, profile));
    renderCharts(rows, school, profile);
    // Preview original upload shape (more familiar for teachers)
    renderPreview(state.rawRows.length ? state.rawRows : rows, state.rawHeaders.length ? state.rawHeaders : state.headers);
    dashboard.classList.remove("hidden");
  }

  function cleanSheetRows(json) {
    if (!json.length) return { rows: [], headers: [] };
    let headers = Object.keys(json[0]).filter((h) => !isEmptyHeader(h));
    // Drop columns that are entirely empty
    headers = headers.filter((h) => json.some((r) => r[h] != null && String(r[h]).trim() !== ""));
    const rows = json.map((r) => {
      const o = {};
      headers.forEach((h) => {
        o[h] = r[h];
      });
      return o;
    });
    return { rows, headers };
  }

  function rowsFromSheet(workbook, sheetName) {
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    return cleanSheetRows(json);
  }

  function sheetToAoa(workbook, sheetName) {
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  }

  function loadWorkbook(workbook, label) {
    state.workbook = workbook;
    state.sheetNames = workbook.SheetNames || [];
    state.fileLabel = label || "";
    state.subjectHint = subjectFromFileName(label);
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
    state.notice = "";
    const aoa = sheetToAoa(state.workbook, sheetName);

    // Per-subject gradebooks: row 1 = units, row 2 = criteria (Analysing, Organizing, …)
    if (detectCriteriaGradebook(aoa)) {
      const parsed = parseCriteriaGradebook(aoa);
      state.rawRows = parsed.previewRows;
      state.rawHeaders = parsed.flatHeaders;
      state.rows = parsed.longRows;
      state.headers = ["Student", "Unit", "Criterion", "Score"];
      state.profile = profileColumns(parsed.longRows, state.headers);
      state.school = {
        score: "Score",
        subject: "Criterion",
        term: "Unit",
        studentName: "Student",
        attendance: null,
        gradeLevel: null,
        learningSupport: null,
        studentId: null,
        homework: null,
      };
      state.mode = "criteria";
      const subj = state.subjectHint ? ` (${state.subjectHint})` : "";
      state.notice = `Subject gradebook${subj}: unit row + criteria row detected. ${parsed.filled} marks charted across ${parsed.unitCount} units and ${parsed.criterionCount} criteria (dashes skipped).`;
      return;
    }

    const { rows, headers } = rowsFromSheet(state.workbook, sheetName);
    state.rawRows = rows;
    state.rawHeaders = headers;

    const rawProfile = profileColumns(rows, headers);

    if (isRosterOnly(headers, rawProfile, rows)) {
      state.rows = rows;
      state.headers = headers;
      state.profile = rawProfile;
      state.school = null;
      state.mode = "roster";
      state.notice =
        "Detected a student login/roster file (names + passwords). Charts need score columns — try a markbook export instead.";
      return;
    }

    const wide = detectWideMarkbook(rows, headers, rawProfile);
    if (wide) {
      const longRows = unpivotWide(rows, wide.scoreCols, wide.studentCol);
      state.rows = longRows;
      state.headers = ["Student", "Subject", "Term", "Score", "Assessment"];
      state.profile = profileColumns(longRows, state.headers);
      state.school = {
        score: "Score",
        subject: "Subject",
        term: "Term",
        studentName: "Student",
        attendance: null,
        gradeLevel: null,
        learningSupport: null,
        studentId: null,
        homework: null,
      };
      state.mode = "wide";
      state.notice = `Wide markbook detected: ${wide.scoreCols.length} score columns reshaped into Subject / Score for charts.`;
      return;
    }

    state.rows = rows;
    state.headers = headers;
    state.profile = rawProfile;
    state.school = detectSchoolMap(rawProfile);
    state.mode = state.school ? "school" : "generic";
    state.notice = "";
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

  async function loadSampleFile(path, label) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error("fetch failed");
      const text = await res.text();
      const workbook = XLSX.read(text, { type: "string" });
      loadWorkbook(workbook, label);
    } catch (err) {
      console.error(err);
      alert(`Could not load ${label}. Check that the sample file is available.`);
    }
  }

  // ——— events ———
  $("browseBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  $("sampleBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    loadSampleFile("../dataset/ahliyyah-mutran-learning.csv", "ahliyyah-mutran-learning.csv (sample)");
  });
  $("sampleWideBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    loadSampleFile(
      "../dataset/sample-subject-gradebook.csv",
      "sample-subject-gradebook.csv (Math-style units + criteria)"
    );
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
