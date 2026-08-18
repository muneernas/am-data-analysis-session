# Teacher Data Analyzer

Browser-based gradebook analyzer for **Ahliyyah & Mutran** teachers (MYP · Grades 6–10 · all subjects).

Upload a subject summative export (row 1 = units, row 2 = criteria) and get KPIs, heatmaps, and charts — processed only on the device.

## Live

**Vercel:** your deployment URL (root shows the tool)

**GitHub Pages (legacy):** https://muneernas.github.io/am-data-analysis-session/

## Files

| File / folder | Purpose |
|---------------|---------|
| `index.html` | Analyzer app |
| `app.js` | Parse, detect gradebook shape, build charts |
| `styles.css` | UI styles |
| `assets/` | School logo |
| `templates/` | Downloadable subject gradebook template |
| `dataset/` | Sample CSV files (optional reference) |

## Privacy

All processing happens in the browser. Nothing is uploaded to a server. Do not paste identifiable student data into public AI tools.
