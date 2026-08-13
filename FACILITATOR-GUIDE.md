# From Numbers to Narratives
## Facilitator guide · 90-minute data analysis & Power BI session

**Audience:** Teachers (mixed Power BI experience)  
**Materials:** This deck (`index.html`), dataset CSV/XLSX, projector, Power BI Desktop (or Excel as fallback)  
**File to distribute:** `dataset/ahliyyah-mutran-learning.csv` (or `.xlsx`)  
**Live site:** https://muneernas.github.io/am-data-analysis-session/

---

## Timing at a glance

| Block | Minutes | Clock | What happens |
|------:|--------:|------:|--------------|
| Open & hook | 6 | 0:00–0:06 | Title, agenda, two teachers, autopsy→biopsy |
| Analysis engine | 18 | 0:06–0:24 | 4-step engine, questions, beyond average, traps, root cause, actions |
| Power BI | 14 | 0:24–0:38 | Meet Power BI → insight formula → bridge |
| Lab setup | 5 | 0:38–0:43 | Lab brief + file share |
| Challenge 1 | 12 | 0:43–0:55 | Patterns by subject/term |
| Challenge 2 | 12 | 0:55–1:07 | Attendance vs score |
| Challenge 3 | 12 | 1:07–1:19 | Support growth + diagnose |
| 2-2-2 share-out | 12 | 1:19–1:31 | Strengths / gaps / actions |
| Barriers + close | 9 | 1:31–1:40 | Culture + takeaways |

*Buffer: if share-out runs long, trim Challenge 3.*

---

## How to present the deck

1. Open `index.html` in Chrome or Edge (or use the GitHub Pages link).
2. Press **F** for fullscreen.
3. Navigate with **→ / ←**, spacebar, or click right/left half of the screen.
4. Lean-in moments: autopsy/biopsy, beyond the average, root-cause matrix, 2-2-2.

---

## Talking points

### Hook + autopsy/biopsy
Read Teacher A flat. Pause. Read Teacher B. Then flip to autopsy vs biopsy — ask: “Which column describes how we usually treat end-of-unit data?”

### 4-step engine
Chant once: **Look · Patterns · Why · Action.** Stress that stopping after Look is autopsy.

### Beyond the average
“75% means almost nothing until you see distribution, highs, and lows.”

### Root cause + actions
Force a diagnosis before solutions. Then pick one lever: reteach / differentiate / adjust.

### Power BI
2-minute live demo: Get Data → CSV → bar chart → slicer.

### Share-out
Only accept a full **2-2-2**. Incomplete = incomplete.

---

## Lab facilitation tips

### Before the session
- Pre-download Power BI Desktop on a few loaner laptops.
- Share CSV/XLSX via drive, USB, or https://muneernas.github.io/am-data-analysis-session/dataset/ahliyyah-mutran-learning.csv
- Pair novices with someone who has opened Power BI once.

### During challenges
- Circulate; don’t lecture from the front.
- If stuck on import: Score/Attendance must be Decimal Number.
- Prompt: “Is this instructional, design, or readiness?”

### Suggested answer keys (don’t hand these out)

**Challenge 1** — Science/English often above Math early; Term 2 trends up.  
**Challenge 2** — Higher attendance ↔ higher scores; outliers exist.  
**Challenge 3** — Support groups often start lower and show Term 1→2 gains; sample is small — recommend monitoring.

---

## Closing line

> “Leave with a 2-2-2 — not a folder of screenshots.”

---

## Dataset field dictionary

| Field | Meaning |
|-------|---------|
| StudentID | Unique student |
| GradeLevel | 6 / 7 / 8 |
| Homeroom | Class section |
| Subject | Math, Science, English |
| Term | Term 1 or Term 2 |
| Score | Assessment score (0–100) |
| AttendancePct | Attendance percentage |
| LearningSupport | None / Reading Support / Math Intervention |
| Extracurricular | Activity or None |
| HomeworkCompletionPct | Homework completion % |
| Teacher | Subject teacher name |

Each student has 6 rows (3 subjects × 2 terms).
