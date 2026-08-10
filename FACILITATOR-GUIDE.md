# From Numbers to Narratives
## Facilitator guide · 90-minute data analysis & Power BI session

**Audience:** Teachers (mixed Power BI experience)  
**Materials:** This deck (`index.html`), dataset CSV, projector, Power BI Desktop (or Excel as fallback)  
**File to distribute:** `dataset/ahliyyah-mutran-learning.csv`

---

## Timing at a glance

| Block | Minutes | Clock | What happens |
|------:|--------:|------:|--------------|
| Open & hook | 5 | 0:00–0:05 | Slides 1–3 |
| Concepts | 20 | 0:05–0:25 | Slides 4–10 |
| Power BI | 15 | 0:25–0:40 | Slides 11–15 |
| Lab setup | 5 | 0:40–0:45 | Slide 16 + file share |
| Challenge 1 | 12 | 0:45–0:57 | Slide 17 |
| Challenge 2 | 12 | 0:57–1:09 | Slide 18 |
| Challenge 3 | 15 | 1:09–1:24 | Slide 19 |
| Share-out | 10 | 1:24–1:34 | Slide 20 |
| Close | 6 | 1:34–1:40 | Slide 21 |

*Buffer: if share-out runs long, trim Challenge 3 “bonus” asks.*

---

## How to present the deck

1. Open `session-data-analysis/index.html` in Chrome or Edge.
2. Press **F** for fullscreen.
3. Navigate with **→ / ←**, spacebar, or click right/left half of the screen.
4. Keep energy high on slides 3, 7, and 14 — those are the “lean in” moments.

---

## Talking points (slides 1–15)

### Hook (slide 3)
Read Teacher A flat. Pause. Read Teacher B with emphasis on the *slice*. Ask: “Which teacher would you want on your grade-level team?” Hands up.

### What analysis is (slides 5–6)
Stress: analysis is a habit, not a software license. The loop ends in **Act** — if there’s no Monday move, you stopped too early.

### Questions (slide 7)
Invite 2 teachers to rewrite a weak question from their subject. Capture on a whiteboard if you have one.

### Visuals & traps (slides 9–10)
Don’t over-teach chart types. One line: “Bars compare, lines show change, pies are almost never the hero.”  
On traps: teachers love “average addiction” — lean into that.

### Power BI (slides 11–13)
Demo live if possible (2 minutes): Get Data → CSV → one bar chart → one slicer. Seeing it once beats five screenshots.

### Insight formula (slide 14)
Have the room chant once: *Who · What · How much · So what.*

---

## Lab facilitation tips

### Before the session
- Pre-download Power BI Desktop on a few loaner laptops.
- Put the CSV in a shared drive / USB / QR link.
- Pair novices with someone who has opened Power BI once.
- Excel fallback: PivotTables + charts work for Challenges 1 and 3; scatter for Challenge 2 still works in Excel.

### During challenges
- Circulate; don’t lecture from the front.
- If someone is stuck on import: Data type of Score/Attendance must be Decimal Number.
- Celebrate partial wins: “One good slicer beats a busy dashboard.”

### Suggested answer keys (don’t hand these out)

**Challenge 1 patterns**
- Science and English often sit above Math in early terms for several grades.
- Term 2 generally trends upward — growth story is real in this dataset.

**Challenge 2 patterns**
- Positive relationship: higher attendance ↔ higher scores.
- Outliers exist (e.g. strong scores with mid attendance, or weak scores despite decent attendance) — perfect “investigate further” talk.

**Challenge 3 patterns**
- Math Intervention / Reading Support students often start lower and show Term 1→2 gains.
- Insight angle: support appears associated with growth, but sample is small — recommend monitoring, not celebrating victory forever.

---

## Share-out protocol

- 4–5 volunteers max (60 seconds each).
- Rule: must include a **Monday move** (“I’d pull these 3 students for…”) or it doesn’t count as an insight.
- Clap once after each — keep pace.

---

## Closing line

> “Leave with one chart and one action — not a folder of screenshots.”

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
