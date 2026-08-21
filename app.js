/* Teacher Data Analyzer — client-side only */
(() => {
  const COLORS = ["#207028", "#f2b334", "#67c04d", "#766e65", "#f32735", "#00188a", "#c2bdb7"];
  const MAX_CATS = 24;

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
    scatterX: "",
    scatterY: "",
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

  // Reporting snapshots (Progress Report, End of Term) are not independent "units".
  // End of Term often already includes Progress Report / is a converted best-fit grade.
  function isReportingPeriod(name) {
    const s = String(name ?? "").toLowerCase();
    return /progress\s*report|end of\s*(term|year|semester)|mid[\s-]?term|report\s*card|final\s*report|reporting\s*period|semester\s*report|term\s*report|overall\s*grade|final\s*grade|grade\s*boundary|out of\s*32|\/\s*7\b/.test(
      s
    );
  }

  function isLearningUnit(name) {
    const s = String(name ?? "").trim();
    if (!s || s === "—") return false;
    return !isReportingPeriod(s);
  }

  function splitByPeriodType(rows, unitCol) {
    const learning = [];
    const reporting = [];
    for (const r of rows) {
      const u = String(r[unitCol] ?? "").trim();
      if (!u || u === "—") continue;
      if (isReportingPeriod(u)) reporting.push(r);
      else learning.push(r);
    }
    return {
      learning,
      reporting,
      learningUnits: unique(learning.map((r) => r[unitCol])),
      reportingUnits: unique(reporting.map((r) => r[unitCol])),
    };
  }

  function rowsForPatternCharts(rows, school) {
    if (state.mode !== "criteria" || !school?.term) {
      return { rows, scopeNote: "", split: null };
    }
    const split = splitByPeriodType(rows, school.term);
    if (split.learning.length) {
      const note =
        split.reportingUnits.length
          ? `Pattern charts use learning units only (${split.learningUnits.join(", ")}). Reporting periods (${split.reportingUnits.join(", ")}) are shown separately — End of Term is not averaged against Progress Report.`
          : `Pattern charts use learning units: ${split.learningUnits.join(", ")}.`;
      return { rows: split.learning, scopeNote: note, split };
    }
    // No instructional units — use a single reporting snapshot (prefer End of Term)
    const endish =
      split.reportingUnits.find((u) => /end of/i.test(u)) ||
      split.reportingUnits[split.reportingUnits.length - 1];
    const scoped = endish ? split.reporting.filter((r) => String(r[school.term]) === String(endish)) : split.reporting;
    return {
      rows: scoped,
      scopeNote: endish
        ? `No instructional units found. Snapshot charts use “${endish}” only — reporting periods are not compared as growth.`
        : "",
      split,
    };
  }

  function avg(nums) {
    const a = nums.filter((n) => n != null && Number.isFinite(n));
    if (!a.length) return null;
    return a.reduce((s, n) => s + n, 0) / a.length;
  }

  function median(nums) {
    const a = nums.filter((n) => n != null && Number.isFinite(n)).sort((x, y) => x - y);
    if (!a.length) return null;
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }

  function stdev(nums) {
    const a = nums.filter((n) => n != null && Number.isFinite(n));
    if (a.length < 2) return null;
    const m = avg(a);
    if (m == null) return null;
    const variance = a.reduce((s, n) => s + (n - m) ** 2, 0) / (a.length - 1);
    return Math.sqrt(variance);
  }

  function quartileAt(sorted, q) {
    if (!sorted.length) return null;
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] == null) return sorted[base];
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }

  function boxStats(nums) {
    const a = nums.filter((n) => n != null && Number.isFinite(n)).sort((x, y) => x - y);
    if (!a.length) return null;
    const q1 = quartileAt(a, 0.25);
    const q2 = quartileAt(a, 0.5);
    const q3 = quartileAt(a, 0.75);
    const iqr = q3 - q1;
    const loFence = q1 - 1.5 * iqr;
    const hiFence = q3 + 1.5 * iqr;
    const whiskerMin = a.find((n) => n >= loFence) ?? a[0];
    const whiskerMax = [...a].reverse().find((n) => n <= hiFence) ?? a[a.length - 1];
    return {
      min: a[0],
      max: a[a.length - 1],
      q1,
      median: q2,
      q3,
      whiskerMin,
      whiskerMax,
      mean: avg(a),
      stdev: stdev(a),
      count: a.length,
      values: a,
    };
  }

  function pearsonR(points) {
    const pts = (points || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (pts.length < 3) return null;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const mx = avg(xs);
    const my = avg(ys);
    if (mx == null || my == null) return null;
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = xs[i] - mx;
      const b = ys[i] - my;
      num += a * b;
      dx += a * a;
      dy += b * b;
    }
    if (dx === 0 || dy === 0) return null;
    return num / Math.sqrt(dx * dy);
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

  function looksLikeCriterionName(name) {
    const s = String(name ?? "").trim();
    if (!s) return false;
    if (/^[A-Da-d]$/.test(s)) return true;
    if (/^criterion\s*[A-Da-d]\b/i.test(s)) return true;
    return /\b(knowing|understanding|analys|analyz|organiz|organis|produc|communicat|investigat|inquir|thinking|research|applying|application|pattern|language|design|perform|process|create|creating|responding|planning|reflect|develop|using|knowledge|conceptual|technical|artistic|physical|transfer|synthesis|evaluat)\b/i.test(
      s
    );
  }

  function isContextHeader(name) {
    const k = normalizeHeader(name);
    const raw = String(name ?? "");
    return (
      /attendance|homework|atl|eal|support|wellbeing|well-being|comment|notes|gender|punctual|best fit|final grade|overall|report grade|language support|learning support|iep|\bsen\b|behaviour|behavior|effort|participation/.test(
        k
      ) || /%/.test(raw)
    );
  }

  function looksLikeScoreColumn(name, profileCol, rows) {
    const key = normalizeHeader(name);
    if (isMetaKey(key) || isSensitiveKey(key) || isContextHeader(name)) return false;
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

  function columnLooksLikeLevels(aoa, colIndex) {
    const vals = [];
    for (let r = 2; r < aoa.length; r++) {
      const n = toNumber((aoa[r] || [])[colIndex]);
      if (n != null) vals.push(n);
    }
    if (!vals.length) return false;
    const in8 = vals.filter((n) => n >= 0 && n <= 8).length;
    return in8 / vals.length >= 0.6;
  }

  // Under a unit/reporting block, keep the column as a criterion unless it is clearly
  // context (attendance, EAL, …). Sparse criteria (mostly dashes) must still count.
  function isContextColumn(aoa, colIndex, header, unitLabel) {
    if (!header) return true;
    if (isContextHeader(header)) return true;
    if (unitLabel) return false;
    if (looksLikeCriterionName(header)) return false;
    if (columnLooksLikeLevels(aoa, colIndex)) return false;
    return true;
  }

  function parseCriteriaGradebook(aoa) {
    const units = forwardFillUnits(aoa[0] || []);
    const criteria = aoa[1] || [];
    const longRows = [];
    let missing = 0;
    let filled = 0;
    const extraHeaders = [];
    const extraCols = [];

    for (let c = 1; c < Math.max(criteria.length, (aoa[0] || []).length); c++) {
      const header = String(criteria[c] ?? "").trim();
      const unit = String(units[c] ?? "").trim();
      if (isContextColumn(aoa, c, header, unit)) {
        if (header && !extraHeaders.includes(header)) extraHeaders.push(header);
        extraCols.push({ c, header: header || `Column ${c}` });
      }
    }

    for (let r = 2; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const student = String(row[0] ?? "").trim();
      if (!student) continue;
      const extras = {};
      extraCols.forEach(({ c, header }) => {
        extras[header] = row[c];
      });
      for (let c = 1; c < criteria.length; c++) {
        const criterion = String(criteria[c] ?? "").trim();
        if (!criterion) continue;
        const unit = String(units[c] ?? "").trim() || "—";
        if (isContextColumn(aoa, c, criterion, String(units[c] ?? "").trim())) continue;
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
          ...extras,
        });
      }
    }

    const flatHeaders = criteria.map((crit, c) => {
      if (c === 0) return "Student Name";
      const criterion = String(crit ?? "").trim();
      const unit = String(units[c] ?? "").trim();
      if (isContextColumn(aoa, c, criterion, unit)) return criterion;
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
      extraHeaders,
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

  function sortCriterionEntries(entries) {
    const order = { A: 0, B: 1, C: 2, D: 3 };
    if (!entries.length || !entries.every((e) => /^[A-D]$/i.test(String(e.label).trim()))) {
      return entries;
    }
    return [...entries].sort(
      (a, b) =>
        (order[String(a.label).trim().toUpperCase()] ?? 99) -
        (order[String(b.label).trim().toUpperCase()] ?? 99)
    );
  }

  function groupStats(rows, catCol, numCol) {
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
    let entries = [...buckets.entries()].map(([label, vals]) => {
      const box = boxStats(vals);
      return {
        label,
        avg: avg(vals),
        median: median(vals),
        stdev: stdev(vals),
        count: vals.length,
        value: avg(vals),
        box,
        values: vals,
      };
    });
    entries.sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
    if (entries.length > MAX_CATS) entries = entries.slice(0, MAX_CATS);
    return entries;
  }

  function groupAverage(rows, catCol, numCol) {
    return groupStats(rows, catCol, numCol);
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
      kpis.push({ label: "Avg of entered levels", value: formatNum(avg(scores)) });
      kpis.push({ label: "Std Dev", value: formatNum(stdev(scores)) });
      kpis.push({ label: "Levels entered", value: String(scores.length) });
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
      kpis.push({ label: "Std Dev", value: formatNum(stdev(scores)) });
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
    return String(s ?? "");
  }

  function categoryAxis() {
    return {
      grid: { display: false },
      ticks: {
        autoSkip: false,
        maxRotation: 45,
        minRotation: 0,
        padding: 8,
        font: { size: 11 },
      },
    };
  }

  function valueAxis() {
    return {
      beginAtZero: true,
      grid: { color: "rgba(118,110,101,0.12)" },
      ticks: { padding: 6, font: { size: 11 } },
    };
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
  function chartKpiHtml(kpis) {
    if (!kpis?.length) return "";
    return `<div class="chart-kpis">${kpis
      .map(
        (k) =>
          `<div class="chart-kpi"><span class="chart-kpi-label">${escapeHtml(k.label)}</span><span class="chart-kpi-value">${escapeHtml(k.value)}</span></div>`
      )
      .join("")}</div>`;
  }

  function makeChartCard(title, canvasId, guide, kpis) {
    const card = document.createElement("div");
    card.className = "chart-card";
    const guideHtml = guide
      ? `<p class="chart-guide"><strong>What to notice:</strong> ${escapeHtml(guide)}</p>`
      : "";
    card.innerHTML = `<h3>${escapeHtml(title)}</h3>${chartKpiHtml(kpis)}<div class="chart-wrap tall"><canvas id="${canvasId}"></canvas></div>${guideHtml}`;
    return card;
  }

  function entriesChartKpis(entries) {
    const all = (entries || []).flatMap((e) => e.values || []);
    if (all.length < 2) {
      const n = (entries || []).reduce((s, e) => s + (e.count || 0), 0);
      return [{ label: "n", value: String(n) }];
    }
    return [
      { label: "Overall avg", value: formatNum(avg(all)) },
      { label: "Overall median", value: formatNum(median(all)) },
      { label: "Std Dev", value: formatNum(stdev(all)) },
      { label: "n", value: String(all.length) },
    ];
  }

  function addBarChart(grid, id, title, labels, data, label, guide) {
    grid.appendChild(makeChartCard(title, id, guide));
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
        layout: { padding: { bottom: 12, right: 8 } },
        scales: {
          y: valueAxis(),
          x: categoryAxis(),
        },
      },
    });
    state.charts.push(chart);
  }

  function addAvgMedianBar(grid, id, title, entries, guide) {
    if (!entries.length) return;
    grid.appendChild(makeChartCard(title, id, guide, entriesChartKpis(entries)));
    const chart = new Chart($(id), {
      type: "bar",
      data: {
        labels: entries.map((x) => x.label),
        datasets: [
          {
            label: "Average",
            data: entries.map((x) => x.avg),
            backgroundColor: "rgba(32, 112, 40, 0.9)",
            borderRadius: 6,
          },
          {
            label: "Median",
            data: entries.map((x) => x.median),
            backgroundColor: "rgba(242, 179, 52, 0.9)",
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { padding: 14, boxWidth: 12 } },
          tooltip: {
            callbacks: {
              afterBody(items) {
                const i = items?.[0]?.dataIndex;
                if (i == null || !entries[i]) return "";
                const e = entries[i];
                const lines = [`n = ${e.count}`];
                if (e.stdev != null) lines.push(`Std Dev (this group) = ${formatNum(e.stdev)}`);
                return lines;
              },
            },
          },
        },
        layout: { padding: { bottom: 12, right: 8 } },
        scales: {
          y: valueAxis(),
          x: categoryAxis(),
        },
      },
    });
    state.charts.push(chart);
  }

  function addAverageBar(grid, id, title, entries, guide) {
    addAvgMedianBar(grid, id, title, entries, guide);
  }

  function addBoxWhiskerChart(grid, id, title, entries, guide) {
    const usable = (entries || []).filter((e) => e.box && e.box.count >= 2);
    if (!usable.length) return;

    const padL = 110;
    const padR = 28;
    const padT = 16;
    const padB = 40;
    const rowH = 52;
    const width = 820;
    const height = padT + padB + usable.length * rowH;
    const plotW = width - padL - padR;
    const xMin = 0.5;
    const xMax = 8.5;
    const xScale = (v) => padL + ((v - xMin) / (xMax - xMin)) * plotW;

    let gridLines = "";
    for (let tick = 1; tick <= 8; tick++) {
      const x = xScale(tick);
      gridLines += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${height - padB}" stroke="rgba(118,110,101,0.15)" stroke-width="1"/>`;
      gridLines += `<text x="${x}" y="${height - 12}" text-anchor="middle" font-size="11" fill="#766e65">${tick}</text>`;
    }

    let plots = "";
    usable.forEach((e, i) => {
      const b = e.box;
      const cy = padT + i * rowH + rowH / 2;
      const yTop = cy - 14;
      const yBot = cy + 14;
      const xWhLo = xScale(b.whiskerMin);
      const xWhHi = xScale(b.whiskerMax);
      const xQ1 = xScale(b.q1);
      const xQ3 = xScale(b.q3);
      const xMed = xScale(b.median);
      const xMean = xScale(b.mean);
      plots += `
        <text x="${padL - 8}" y="${cy + 4}" text-anchor="end" font-size="12" font-weight="600" fill="#2a2622">${escapeHtml(e.label)}</text>
        <line x1="${xWhLo}" y1="${cy}" x2="${xWhHi}" y2="${cy}" stroke="#766e65" stroke-width="1.5"/>
        <line x1="${xWhLo}" y1="${cy - 8}" x2="${xWhLo}" y2="${cy + 8}" stroke="#766e65" stroke-width="1.5"/>
        <line x1="${xWhHi}" y1="${cy - 8}" x2="${xWhHi}" y2="${cy + 8}" stroke="#766e65" stroke-width="1.5"/>
        <rect x="${xQ1}" y="${yTop}" width="${Math.max(2, xQ3 - xQ1)}" height="${yBot - yTop}" fill="rgba(32,112,40,0.35)" stroke="#207028" stroke-width="1.5" rx="2"/>
        <line x1="${xMed}" y1="${yTop - 2}" x2="${xMed}" y2="${yBot + 2}" stroke="#f2b334" stroke-width="2.5"/>
        <polygon points="${xMean},${cy - 5} ${xMean + 5},${cy} ${xMean},${cy + 5} ${xMean - 5},${cy}" fill="#00188a"/>
        <title>${escapeHtml(e.label)}: Q1 ${formatNum(b.q1)}, Med ${formatNum(b.median)}, Q3 ${formatNum(b.q3)}, n=${b.count}</title>`;
    });

    const card = document.createElement("div");
    card.className = "chart-card wide boxplot-card";
    const guideHtml = guide
      ? `<p class="chart-guide"><strong>What to notice:</strong> ${escapeHtml(guide)}</p>`
      : "";
    card.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      <p class="boxplot-legend">
        <span><i class="lg-box"></i> Middle 50% (Q1–Q3)</span>
        <span><i class="lg-med"></i> Median</span>
        <span><i class="lg-mean"></i> Mean</span>
        <span><i class="lg-whisk"></i> Whiskers</span>
      </p>
      <div class="boxplot-wrap">
        <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${escapeHtml(title)}">
          ${gridLines}
          <text x="${padL + plotW / 2}" y="${height - 2}" text-anchor="middle" font-size="11" fill="#766e65">MYP level (1–8)</text>
          ${plots}
        </svg>
      </div>
      ${guideHtml}`;
    grid.appendChild(card);
  }

  function addGroupedBar(grid, id, title, labels, datasets, guide) {
    grid.appendChild(makeChartCard(title, id, guide));
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
        plugins: { legend: { position: "bottom", labels: { padding: 16, boxWidth: 12 } } },
        layout: { padding: { bottom: 12, right: 8 } },
        scales: {
          y: valueAxis(),
          x: categoryAxis(),
        },
      },
    });
    state.charts.push(chart);
  }

  function addScatter(grid, id, title, points, xTitle, yTitle, guide) {
    const r = pearsonR(points);
    const rBit = r == null ? "" : ` · Pearson r = ${formatNum(r, 2)}`;
    const cardTitle = `${title}${rBit}`;
    grid.appendChild(makeChartCard(cardTitle, id, guide));
    const chart = new Chart($(id), {
      type: "scatter",
      data: {
        datasets: [
          {
            label: "Points",
            data: points,
            backgroundColor: "rgba(32, 112, 40, 0.55)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        layout: { padding: { top: 8, right: 16, bottom: 8, left: 8 } },
        scales: {
          x: {
            title: { display: true, text: xTitle || "X", padding: { top: 10 }, font: { size: 12 } },
            grid: { color: "rgba(118,110,101,0.12)" },
            ticks: { padding: 8, font: { size: 11 } },
          },
          y: {
            title: { display: true, text: yTitle || "Y", padding: { bottom: 8 }, font: { size: 12 } },
            grid: { color: "rgba(118,110,101,0.12)" },
            ticks: { padding: 8, font: { size: 11 } },
          },
        },
      },
    });
    state.charts.push(chart);
  }

  function syncScatterPair(criteria) {
    const exact = (letter) =>
      criteria.find((c) => String(c).trim().toUpperCase() === letter) ||
      criteria.find((c) => new RegExp(`(^|\\s)${letter}(\\s|$|\\))`, "i").test(String(c)));
    const fallbackX = exact("A") || criteria[0] || "";
    const fallbackY = exact("B") || criteria.find((c) => c !== fallbackX) || criteria[1] || "";
    if (!criteria.includes(state.scatterX)) state.scatterX = fallbackX;
    if (!criteria.includes(state.scatterY) || state.scatterY === state.scatterX) {
      state.scatterY = criteria.find((c) => c !== state.scatterX) || fallbackY;
    }
  }

  function addCriterionScatter(grid, id, rows, school, guide) {
    const criteria = unique(rows.map((r) => r[school.subject]));
    if (criteria.length < 2) return false;
    syncScatterPair(criteria);
    const sc = criterionScatterPoints(
      rows,
      school.studentName,
      school.subject,
      school.score,
      state.scatterX,
      state.scatterY
    );
    if (!sc) return false;
    const r = pearsonR(sc.points);
    const rText = r == null ? "n/a (need ≥3 paired scores)" : formatNum(r, 2);
    const rMeaning =
      r == null
        ? ""
        : Math.abs(r) >= 0.7
          ? "strong"
          : Math.abs(r) >= 0.4
            ? "moderate"
            : "weak";
    const opts = criteria
      .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
      .join("");
    const card = document.createElement("div");
    card.className = "chart-card";
    card.innerHTML = `
      <div class="chart-head">
        <div>
          <h3>Compare two criteria</h3>
          <p class="chart-stat">Pearson r = <strong>${escapeHtml(rText)}</strong>${
            rMeaning ? ` <span class="muted">(${escapeHtml(rMeaning)} linear association)</span>` : ""
          } · n = ${sc.points.length} students</p>
        </div>
        <div class="scatter-picks">
          <label>X axis<select id="scatterX">${opts}</select></label>
          <label>Y axis<select id="scatterY">${opts}</select></label>
        </div>
      </div>
      <div class="chart-wrap tall"><canvas id="${id}"></canvas></div>
      <p class="chart-guide"><strong>What to notice:</strong> ${escapeHtml(guide)} r near +1 means students strong on one criterion tend to be strong on the other; near 0 means little linear link.</p>`;
    grid.appendChild(card);
    $("scatterX").value = sc.xCrit;
    $("scatterY").value = sc.yCrit;
    const onPick = () => {
      state.scatterX = $("scatterX").value;
      state.scatterY = $("scatterY").value;
      refreshDashboard();
    };
    $("scatterX").addEventListener("change", onPick);
    $("scatterY").addEventListener("change", onPick);
    const chart = new Chart($(id), {
      type: "scatter",
      data: {
        datasets: [
          {
            label: "Students",
            data: sc.points,
            backgroundColor: "rgba(32, 112, 40, 0.55)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        layout: { padding: { top: 8, right: 16, bottom: 8, left: 8 } },
        scales: {
          x: {
            title: { display: true, text: sc.xCrit, padding: { top: 10 }, font: { size: 12 } },
            grid: { color: "rgba(118,110,101,0.12)" },
            ticks: { padding: 8, font: { size: 11 } },
          },
          y: {
            title: { display: true, text: sc.yCrit, padding: { bottom: 8 }, font: { size: 12 } },
            grid: { color: "rgba(118,110,101,0.12)" },
            ticks: { padding: 8, font: { size: 11 } },
          },
        },
      },
    });
    state.charts.push(chart);
    return true;
  }

  function heatColor(score) {
    if (score == null || !Number.isFinite(score)) return null;
    const t = Math.max(0, Math.min(1, (score - 1) / 7));
    let r, g, b;
    if (t < 0.5) {
      const u = t / 0.5;
      r = Math.round(243 + (242 - 243) * u);
      g = Math.round(39 + (179 - 39) * u);
      b = Math.round(53 + (52 - 53) * u);
    } else {
      const u = (t - 0.5) / 0.5;
      r = Math.round(242 + (32 - 242) * u);
      g = Math.round(179 + (112 - 179) * u);
      b = Math.round(52 + (40 - 52) * u);
    }
    return `rgb(${r},${g},${b})`;
  }

  function tinyName(name, i) {
    const s = String(name || "").trim();
    if (!s) return `S${i + 1}`;
    const parts = s.split(/\s+/);
    if (parts.length === 1) return shortLabel(parts[0]);
    return shortLabel(`${parts[0]} ${parts[parts.length - 1].charAt(0)}.`);
  }

  function buildStudentCriterionMatrix(rows, studentCol, criterionCol, scoreCol, unitCol) {
    const students = unique(rows.map((r) => r[studentCol])).slice(0, 24);
    // Use every criterion seen in the file — not only ones scored in the selected unit
    const criteria = unique(rows.map((r) => r[criterionCol]));
    let unitFilter = null;
    if (unitCol) {
      const units = unique(rows.map((r) => r[unitCol])).filter((u) => u && u !== "—");
      const endish = units.find((u) => /end of/i.test(u));
      const progress = units.find((u) => /progress/i.test(u));
      unitFilter = endish || progress || units[units.length - 1] || null;
    }
    const scoped = unitFilter ? rows.filter((r) => String(r[unitCol]) === String(unitFilter)) : rows;
    const matrix = criteria.map((crit) =>
      students.map((stu) => {
        const vals = scoped
          .filter((r) => String(r[studentCol]) === String(stu) && String(r[criterionCol]) === String(crit))
          .map((r) => toNumber(r[scoreCol]))
          .filter((n) => n != null);
        return avg(vals);
      })
    );
    const rowAvgs = matrix.map((row) => avg(row.filter((n) => n != null)));
    return { students, criteria, matrix, rowAvgs, unitLabel: unitFilter };
  }

  function buildUnitCriterionMatrix(rows, unitCol, criterionCol, scoreCol, unitFilterFn) {
    let units = unique(rows.map((r) => r[unitCol])).filter((u) => u && u !== "—");
    if (typeof unitFilterFn === "function") units = units.filter(unitFilterFn);
    const criteria = unique(rows.map((r) => r[criterionCol]));
    const matrix = criteria.map((crit) =>
      units.map((unit) => {
        const vals = rows
          .filter((r) => String(r[unitCol]) === String(unit) && String(r[criterionCol]) === String(crit))
          .map((r) => toNumber(r[scoreCol]))
          .filter((n) => n != null);
        return avg(vals);
      })
    );
    return { units, criteria, matrix };
  }

  function addHeatmapCard(grid, title, colLabels, rowLabels, matrix, rowAvgs, guide, subtitle) {
    const card = document.createElement("div");
    card.className = "chart-card wide";
    const sub = subtitle ? `<p style="margin:0 0 0.55rem;color:var(--muted);font-size:0.88rem">${escapeHtml(subtitle)}</p>` : "";
    let head =
      `<th class="row-label"></th>` +
      colLabels.map((c) => `<th title="${escapeHtml(c)}">${escapeHtml(c)}</th>`).join("");
    if (rowAvgs) head += `<th>Avg</th>`;
    const body = rowLabels
      .map((rowLabel, ri) => {
        const cells = matrix[ri]
          .map((v) => {
            if (v == null) return `<td class="heat empty">·</td>`;
            return `<td class="heat" style="background:${heatColor(v)}" title="${escapeHtml(rowLabel)}: ${formatNum(v)}">${formatNum(v, 1)}</td>`;
          })
          .join("");
        const avgCell =
          rowAvgs && rowAvgs[ri] != null
            ? `<td class="heat" style="background:${heatColor(rowAvgs[ri])}">${formatNum(rowAvgs[ri], 1)}</td>`
            : "";
        return `<tr><td class="row-label" title="${escapeHtml(rowLabel)}">${escapeHtml(rowLabel)}</td>${cells}${avgCell}</tr>`;
      })
      .join("");
    card.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      ${sub}
      <div class="heatmap-wrap">
        <table class="heatmap"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
      </div>
      <div class="heatmap-legend">
        <span><i style="background:#f32735"></i> Needs support</span>
        <span><i style="background:#f2b334"></i> Developing</span>
        <span><i style="background:#207028"></i> Mastery</span>
      </div>
      <p class="chart-guide"><strong>What to notice:</strong> ${escapeHtml(guide)}</p>`;
    grid.appendChild(card);
  }

  function studentContextScatter(rows, studentCol, xCol, scoreCol) {
    const byStu = new Map();
    for (const r of rows) {
      const s = String(r[studentCol] ?? "").trim();
      if (!s) continue;
      if (!byStu.has(s)) byStu.set(s, { xs: [], scores: [] });
      const x = toNumber(r[xCol]);
      if (x != null) byStu.get(s).xs.push(x);
      const y = toNumber(r[scoreCol]);
      if (y != null) byStu.get(s).scores.push(y);
    }
    const points = [];
    for (const [, v] of byStu) {
      const x = avg(v.xs);
      const y = avg(v.scores);
      if (x != null && y != null) points.push({ x, y });
    }
    return points;
  }

  function criterionScatterPoints(rows, studentCol, criterionCol, scoreCol, xPick, yPick) {
    const criteria = unique(rows.map((r) => r[criterionCol]));
    if (criteria.length < 2) return null;
    const ranked = criteria
      .map((c) => ({
        c,
        n: rows.filter((r) => String(r[criterionCol]) === String(c) && toNumber(r[scoreCol]) != null).length,
      }))
      .sort((a, b) => b.n - a.n);
    const xCrit = xPick && criteria.includes(xPick) ? xPick : ranked[0].c;
    const yCrit =
      yPick && criteria.includes(yPick) && yPick !== xCrit
        ? yPick
        : ranked.find((r) => r.c !== xCrit)?.c;
    const points = [];
    unique(rows.map((r) => r[studentCol])).forEach((stu) => {
      const x = avg(
        rows
          .filter((r) => String(r[studentCol]) === String(stu) && String(r[criterionCol]) === String(xCrit))
          .map((r) => toNumber(r[scoreCol]))
          .filter((n) => n != null)
      );
      const y = avg(
        rows
          .filter((r) => String(r[studentCol]) === String(stu) && String(r[criterionCol]) === String(yCrit))
          .map((r) => toNumber(r[scoreCol]))
          .filter((n) => n != null)
      );
      if (x != null && y != null) points.push({ x, y });
    });
    if (points.length < 5) return null;
    return { points, xCrit, yCrit };
  }

  function scoreDistribution(rows, scoreCol) {
    const vals = rows.map((r) => toNumber(r[scoreCol])).filter((n) => n != null);
    if (vals.length < 5) return null;
    const max = Math.max(...vals);
    if (max <= 10) {
      const labels = [];
      const data = [];
      for (let i = 1; i <= 8; i++) {
        labels.push(String(i));
        data.push(vals.filter((v) => Math.round(v) === i).length);
      }
      return { labels, data, kind: "myp" };
    }
    const bins = [
      { label: "0-49", min: 0, max: 49.999 },
      { label: "50-59", min: 50, max: 59.999 },
      { label: "60-69", min: 60, max: 69.999 },
      { label: "70-79", min: 70, max: 79.999 },
      { label: "80-89", min: 80, max: 89.999 },
      { label: "90-100", min: 90, max: 100.001 },
    ];
    return {
      labels: bins.map((b) => b.label),
      data: bins.map((b) => vals.filter((v) => v >= b.min && v <= b.max).length),
      kind: "pct",
    };
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

  function studentStats(rows, studentCol, scoreCol) {
    const buckets = new Map();
    for (const r of rows) {
      const s = String(r[studentCol] ?? "").trim();
      if (!s) continue;
      const n = toNumber(r[scoreCol]);
      if (n == null) continue;
      if (!buckets.has(s)) buckets.set(s, []);
      buckets.get(s).push(n);
    }
    return [...buckets.entries()].map(([label, vals]) => ({
      label: shortLabel(label),
      avg: avg(vals),
      median: median(vals),
      stdev: stdev(vals),
      count: vals.length,
      values: vals,
      full: label,
    }));
  }

  function studentAverages(rows, studentCol, scoreCol, limit = 10) {
    return studentStats(rows, studentCol, scoreCol)
      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))
      .slice(0, limit)
      .map((x) => ({ ...x, value: x.avg }));
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

    const GUIDE = {
      criterion:
        "Bars show average and median per criterion within learning units only. The small KPIs above the chart show overall spread (Std Dev). Reporting periods are not mixed in.",
      unit:
        "Compares instructional units only (Unit 1, Unit 2, …). Progress Report and End of Term are reporting snapshots — they are not listed here because End of Term often already includes earlier work / uses a different conversion.",
      unitCrit:
        "Learning units only. Look for one criterion that dips across several units — that is often the best place to reteach.",
      reporting:
        "Reporting snapshots only. Do not read Progress Report → End of Term as a simple average rise/fall: End of Term may already include Progress Report and may be converted (e.g. /32 → /7).",
      dist:
        "Check where marks pile up within the chart scope. A cluster at the low end suggests reteaching; a cluster at the high end means many students are ready for extension.",
      top:
        "Highest averages within the chart scope — not an official MYP grade. Check whether they are strong on every criterion.",
      low:
        "Lowest averages within the chart scope — not MYP best-fit. Check which criterion is pulling them down.",
      support:
        "Compare groups carefully — small group sizes can swing averages. Use the Std Dev KPI above the chart when groups look uneven.",
      grade:
        "Use this to see if one grade band needs a different pitch or scaffold than another.",
      scatter:
        "Each point is one student within learning units (or a single reporting snapshot). Pearson r summarises the linear link.",
      generic:
        "Green = average, gold = median. Std Dev sits in the small KPIs above the chart so you can see spread without a third bar.",
      counts:
        "Counts show volume, not quality. Pair this with a score chart before deciding next steps.",
      heatStudent:
        "Dark green = mastery, gold = developing, red = needs support. Empty cells were not assessed. This heatmap uses one reporting snapshot (prefer End of Term), not a mix of periods.",
      heatUnit:
        "Learning units only. A red streak in one criterion across units is a reteach signal. Reporting periods are shown separately.",
      critScatter:
        "Each point is one student. Change the two menus to compare any pair of criteria.",
      box:
        "Horizontal box plot: green box = middle 50% (Q1–Q3), gold line = median, blue diamond = mean, grey whiskers = spread.",
    };

    if (school) {
      const scoreCol = numOverride || school.score;
      const catCol = catOverride || school.subject;
      const scoped = rowsForPatternCharts(rows, school);
      const patternRows = scoped.rows.length ? scoped.rows : rows;
      if (scoped.scopeNote) {
        const note = document.createElement("div");
        note.className = "scope-note";
        note.textContent = scoped.scopeNote;
        grid.appendChild(note);
      }

      if (state.mode === "criteria" && school.studentName && school.subject && school.score) {
        // Heatmaps + reporting snapshot first (full width)
        const hm = buildStudentCriterionMatrix(rows, school.studentName, school.subject, school.score, school.term);
        if (hm.criteria.length && hm.students.length) {
          addHeatmapCard(
            grid,
            "Criterion × student heatmap",
            hm.students,
            hm.criteria,
            hm.matrix,
            hm.rowAvgs,
            GUIDE.heatStudent,
            hm.unitLabel
              ? `Snapshot: ${hm.unitLabel} (one period only — not averaged with other periods)`
              : "Averaged across available marks in scope"
          );
          chartCount++;
        }
        const umLearn = buildUnitCriterionMatrix(
          rows,
          school.term,
          school.subject,
          school.score,
          isLearningUnit
        );
        if (umLearn.units.length >= 1 && umLearn.criteria.length) {
          addHeatmapCard(
            grid,
            "Criterion × learning unit heatmap",
            umLearn.units,
            umLearn.criteria,
            umLearn.matrix,
            null,
            GUIDE.heatUnit,
            "Instructional units only — safe to compare across units"
          );
          chartCount++;
        }

        // Row of paired summary charts after heatmaps
        let gCrit = null;
        if (scoreCol && catCol) {
          gCrit = sortCriterionEntries(groupStats(patternRows, catCol, scoreCol));
          if (gCrit.length) {
            addAvgMedianBar(
              grid,
              "chart-subj",
              "Average and median by criterion (learning units only)",
              gCrit,
              GUIDE.criterion
            );
            chartCount++;
          }
        }
        if (addCriterionScatter(grid, "chart-crit-scatter", patternRows, school, GUIDE.critScatter)) {
          chartCount++;
        }
        if (gCrit?.some((e) => e.box && e.box.count >= 3)) {
          addBoxWhiskerChart(
            grid,
            "chart-box-crit",
            "Box and whisker by criterion (learning units only)",
            gCrit,
            GUIDE.box
          );
          chartCount++;
        }
      } else if (scoreCol && catCol) {
        const g = groupStats(patternRows, catCol, scoreCol);
        if (g.length) {
          addAvgMedianBar(
            grid,
            "chart-subj",
            `${shortLabel(scoreCol)} by ${shortLabel(catCol)} (avg and median)`,
            g,
            GUIDE.generic
          );
          chartCount++;
        }
      }

      // By-unit averages: instructional units only — never Progress Report vs End of Term
      if (state.mode === "criteria" && school.term) {
        const learningRows = rows.filter((r) => isLearningUnit(r[school.term]));
        const g = groupStats(learningRows, school.term, school.score);
        if (g.length >= 2) {
          addAvgMedianBar(
            grid,
            "chart-unit",
            "Average and median by learning unit (not reporting periods)",
            g,
            GUIDE.unit
          );
          chartCount++;
        }
      } else if (state.mode !== "criteria" && school.term && school.score) {
        const g = groupStats(patternRows, school.term, school.score);
        if (g.length >= 2) {
          addAvgMedianBar(
            grid,
            "chart-unit",
            "Average and median by learning unit (not reporting periods)",
            g,
            GUIDE.unit
          );
          chartCount++;
        }
      }

      // Grouped criterion × period: learning units only
      if (school.subject && school.term && school.score) {
        const learningRows = state.mode === "criteria"
          ? rows.filter((r) => isLearningUnit(r[school.term]))
          : rows;
        const cmp = termSubjectComparison(learningRows, school.subject, school.term, school.score);
        if (cmp.labels.length && cmp.datasets.length >= 1 && cmp.datasets.some((d) => d.label !== "—")) {
          if (cmp.datasets.length > 1) {
            addGroupedBar(
              grid,
              "chart-term",
              state.mode === "criteria"
                ? "Average entered level by criterion and learning unit"
                : "Average score by subject and term",
              cmp.labels,
              cmp.datasets,
              GUIDE.unitCrit
            );
            chartCount++;
          }
        }
      }

      if (scoreCol) {
        const dist = scoreDistribution(patternRows, scoreCol);
        if (dist) {
          addBarChart(
            grid,
            "chart-dist",
            dist.kind === "myp" ? "How many entered levels at each 1–8 (chart scope)" : "Score distribution",
            dist.labels,
            dist.data,
            "Count",
            GUIDE.dist
          );
          chartCount++;
        }
      }

      if (school.attendance && school.score && (school.studentName || state.mode !== "criteria")) {
        const points =
          school.studentName
            ? studentContextScatter(patternRows, school.studentName, school.attendance, school.score)
            : patternRows
                .map((r) => {
                  const x = toNumber(r[school.attendance]);
                  const y = toNumber(r[school.score]);
                  return x != null && y != null ? { x, y } : null;
                })
                .filter(Boolean)
                .slice(0, 500);
        if (points.length >= 5) {
          addScatter(
            grid,
            "chart-scatter",
            "Attendance vs average entered level (one point per student)",
            points,
            school.attendance,
            school.studentName ? "Average entered level" : "Score",
            GUIDE.scatter
          );
          chartCount++;
        }
      } else if (school.homework && school.score && school.studentName) {
        const points = studentContextScatter(patternRows, school.studentName, school.homework, school.score);
        if (points.length >= 5) {
          addScatter(
            grid,
            "chart-hw-scatter",
            "Homework vs average entered level (one point per student)",
            points,
            school.homework,
            "Average entered level",
            GUIDE.scatter
          );
          chartCount++;
        }
      }

      if (school.learningSupport && school.score) {
        const g = groupStats(patternRows, school.learningSupport, school.score);
        if (g.length) {
          addAvgMedianBar(grid, "chart-support", "Average and median by learning support", g, GUIDE.support);
          chartCount++;
        }
      }

      if (school.gradeLevel && school.score) {
        const g = groupStats(patternRows, school.gradeLevel, school.score);
        if (g.length) {
          addAvgMedianBar(grid, "chart-grade", "Average and median by grade level", g, GUIDE.grade);
          chartCount++;
        }
      }

      if ((state.mode === "wide" || state.mode === "criteria") && school.score && (school.studentName || "Student")) {
        const studentCol = school.studentName || "Student";
        const all = studentStats(patternRows, studentCol, school.score).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
        const top = all.slice(0, 8);
        const low = [...all].sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0)).slice(0, 8);
        if (top.length >= 3) {
          addAvgMedianBar(
            grid,
            "chart-students-top",
            "Highest student averages (within chart scope — not MYP best-fit)",
            top,
            GUIDE.top
          );
          chartCount++;
        }
        if (low.length >= 3) {
          addAvgMedianBar(
            grid,
            "chart-students-low",
            "Lowest student averages (within chart scope — not MYP best-fit)",
            low,
            GUIDE.low
          );
          chartCount++;
        }
      }
    }

    if (chartCount < 2) {
      const cats = profile.filter((p) => p.isCategorical);
      const nums = profile.filter((p) => p.isNumeric && !isSensitiveKey(p.key));
      const catCol = catOverride || cats[0]?.name;
      const numCol = numOverride || nums[0]?.name;
      if (catCol && numCol) {
        const g = groupStats(rows, catCol, numCol);
        if (g.length) {
          addAvgMedianBar(
            grid,
            "chart-generic",
            `${shortLabel(numCol)} by ${shortLabel(catCol)} (avg and median)`,
            g,
            GUIDE.generic
          );
          chartCount++;
        }
      } else if (catCol && !numCol) {
        const g = groupCount(rows, catCol);
        if (g.length) {
          addBarChart(
            grid,
            "chart-counts",
            `Count by ${shortLabel(catCol)}`,
            g.map((x) => x.label),
            g.map((x) => x.value),
            "Count",
            GUIDE.counts
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
          addScatter(
            grid,
            "chart-gen-scatter",
            `${shortLabel(a)} vs ${shortLabel(b)}`,
            points,
            a,
            b,
            GUIDE.scatter
          );
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
    const ordinal = $("ordinalNote");
    if (ordinal) ordinal.classList.toggle("hidden", state.mode !== "criteria");
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
      const extra = parsed.extraHeaders || [];
      state.headers = ["Student", "Unit", "Criterion", "Score", ...extra];
      state.profile = profileColumns(parsed.longRows, state.headers);
      const extraKey = (needles) =>
        extra.find((h) => needles.some((n) => normalizeHeader(h).includes(n))) || null;
      state.school = {
        score: "Score",
        subject: "Criterion",
        term: "Unit",
        studentName: "Student",
        attendance: extraKey(["attendance"]),
        gradeLevel: extraKey(["grade level", "year group"]),
        learningSupport: extraKey(["eal", "learning support", "support"]),
        studentId: extraKey(["student id"]),
        homework: extraKey(["homework"]),
      };
      state.mode = "criteria";
      const subj = state.subjectHint ? ` (${state.subjectHint})` : "";
      const extraNote = extra.length ? ` Extra columns kept: ${extra.join(", ")}.` : "";
      state.notice = `Subject gradebook${subj}: unit row + criteria row detected. ${parsed.filled} levels charted across ${parsed.unitCount} units and ${parsed.criterionCount} criteria (dashes skipped).${extraNote} Pattern charts use learning units only; Progress Report / End of Term are shown as separate reporting snapshots (not averaged against each other).`;
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
      const buf = await res.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buf), { type: "array" });
      loadWorkbook(workbook, label);
    } catch (err) {
      console.error(err);
      alert(`Could not load ${label}. Check that the template file is available.`);
    }
  }

  // ——— events ———
  $("browseBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  $("downloadTemplate").addEventListener("click", (e) => {
    e.stopPropagation();
  });
  document.querySelectorAll("[data-demo]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-demo");
      const demos = {
        "1": ["templates/demo-criterion-gap.xlsx", "Demo class 1"],
        "2": ["templates/demo-uneven-class.xlsx", "Demo class 2"],
        "3": ["templates/demo-attendance.xlsx", "Demo class 3"],
      };
      const pick = demos[id];
      if (pick) loadSampleFile(pick[0], pick[1]);
    });
  });
  dropzone.addEventListener("click", (e) => {
    if (e.target.closest("a, button")) return;
    fileInput.click();
  });
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
