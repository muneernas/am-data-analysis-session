# Teacher Data Analyzer

Browser-based gradebook analyzer for **Ahliyyah & Mutran** teachers (MYP · Grades 6–10 · all subjects).

Upload a subject summative export (row 1 = units, row 2 = criteria) and get KPIs, heatmaps, and charts — processed only on the device. Extra columns such as attendance, homework, or EAL are kept when present.

MYP levels 1–8 are treated as best-fit judgments. Averages and medians are for spotting patterns, not official grades.

## Live

**Vercel:** your deployment URL (root shows the tool)

**GitHub Pages (legacy):** https://muneernas.github.io/am-data-analysis-session/

## File layout

Row 1 = units / reporting points · Row 2 = criteria (A, B, C, D) · then student names and levels. Use a dash or blank if not assessed.

You can add columns after the criteria block, for example `Attendance %`, `Homework %`, `EAL`.

## Demo classes

| Button | Pattern to notice |
|--------|-------------------|
| Demo 1 · Criterion B gap | High homework/attendance; Criterion B stays low across reports |
| Demo 2 · Average hides the class | A few high levels pull the average up; the typical student is lower |
| Demo 3 · Attendance pattern | Lower attendance lines up with lower entered levels |

## Files

| File / folder | Purpose |
|---------------|---------|
| `index.html` | Analyzer app |
| `app.js` | Parse, detect gradebook shape, build charts |
| `styles.css` | UI styles |
| `assets/` | School logo |
| `templates/` | Blank template + three demo gradebooks |

## Privacy

All processing happens in the browser. Nothing is uploaded to a server. Do not paste identifiable student data into public AI tools.
