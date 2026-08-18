/* Generate three anonymized MYP demo gradebooks with obvious patterns. */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const outDir = path.join(__dirname, "..", "templates");
const NAMES = [
  "Student 01",
  "Student 02",
  "Student 03",
  "Student 04",
  "Student 05",
  "Student 06",
  "Student 07",
  "Student 08",
  "Student 09",
  "Student 10",
  "Student 11",
  "Student 12",
  "Student 13",
  "Student 14",
  "Student 15",
  "Student 16",
];

const HEADER_UNITS = [
  "",
  "Unit 1",
  "",
  "",
  "",
  "Progress Report",
  "",
  "",
  "",
  "End of Term",
  "",
  "",
  "",
  "",
  "",
  "",
];
const HEADER_CRITS = [
  "Student Name",
  "A",
  "B",
  "C",
  "D",
  "A",
  "B",
  "C",
  "D",
  "A",
  "B",
  "C",
  "D",
  "Attendance %",
  "Homework %",
  "EAL",
];

function writeBook(filename, rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = HEADER_CRITS.map((_, i) => ({ wch: i === 0 ? 14 : 12 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Gradebook");
  const dest = path.join(outDir, filename);
  XLSX.writeFile(wb, dest);
  console.log("Wrote", dest);
}

function row(name, u1, pr, eot, att, hw, eal) {
  return [name, ...u1, ...pr, ...eot, att, hw, eal];
}

// Demo 1: class-wide Criterion B gap despite high engagement
function demoGap() {
  const b = [3, 2, 4, 3, 3, 4, 2, 3, 4, 3, 3, 2, 4, 3, 3, 4];
  const a = [6, 7, 5, 6, 6, 7, 5, 6, 8, 6, 5, 6, 7, 6, 6, 5];
  const c = [6, 6, 5, 7, 6, 6, 5, 6, 7, 6, 6, 5, 6, 7, 6, 6];
  const d = [5, 6, 5, 6, 5, 6, 4, 5, 7, 5, 5, 5, 6, 6, 5, 5];
  const att = [96, 98, 94, 91, 97, 99, 95, 93, 98, 96, 92, 97, 95, 94, 99, 96];
  const hw = [100, 92, 88, 96, 100, 94, 90, 100, 86, 98, 92, 100, 88, 94, 96, 90];
  const eal = NAMES.map((_, i) => (i === 3 || i === 10 ? "Yes" : "No"));
  const body = NAMES.map((name, i) =>
    row(
      name,
      [a[i], "—", c[i], "—"],
      [a[i], b[i], c[i], d[i]],
      [Math.min(8, a[i] + (i % 3 === 0 ? 1 : 0)), b[i], c[i], d[i]],
      att[i],
      hw[i],
      eal[i]
    )
  );
  writeBook("demo-criterion-gap.xlsx", [
    HEADER_UNITS,
    [...HEADER_CRITS.slice(0, 15), "EAL"],
    ...body,
  ]);
}

// Demo 2: four high scorers pull the average up; typical student is around 4
function demoUneven() {
  const headers = [
    ...HEADER_CRITS.slice(0, 15),
    "Learning support",
  ];
  const body = NAMES.map((name, i) => {
    const star = i < 4;
    const a = star ? 7 + (i % 2) : 3 + (i % 3 === 0 ? 1 : 0);
    const b = star ? 7 : 3 + (i % 2);
    const c = star ? 8 : 4;
    const d = star ? 7 : 3;
    const support = !star && (i === 7 || i === 9 || i === 13) ? "Yes" : "No";
    return row(
      name,
      [a, b, c, d],
      [a, b, c, d],
      [a, Math.max(1, b - (star ? 0 : 0)), c, d],
      94 + (i % 5),
      88 + (i % 6) * 2,
      support
    );
  });
  writeBook("demo-uneven-class.xlsx", [HEADER_UNITS, headers, ...body]);
}

// Demo 3: five students with low attendance also have lower levels across criteria
function demoAttendance() {
  const body = NAMES.map((name, i) => {
    const lowAtt = i >= 11;
    const base = lowAtt ? 3 : 6;
    const jitter = i % 2;
    const a = Math.min(8, Math.max(2, base + (lowAtt ? 0 : jitter)));
    const b = Math.min(8, Math.max(2, base));
    const c = Math.min(8, Math.max(2, base + (lowAtt ? 1 : 0)));
    const d = Math.min(8, Math.max(2, base));
    const att = lowAtt ? 68 + (i - 11) * 2 : 94 + (i % 5);
    const hw = lowAtt ? 55 + (i - 11) * 4 : 90 + (i % 5) * 2;
    return row(name, [a, b, c, d], [a, b, c, d], [a, b, c, d], att, hw, i === 12 ? "Yes" : "No");
  });
  writeBook("demo-attendance.xlsx", [
    HEADER_UNITS,
    [...HEADER_CRITS.slice(0, 15), "EAL"],
    ...body,
  ]);
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
demoGap();
demoUneven();
demoAttendance();
