// --------------------------------------------------------------
// 1. DEFINE CATEGORY MAPPING (all 55 columns)
//    Based on the provided column list up to TFL.Yds
// --------------------------------------------------------------
const categoryMap = {
    "General": ["Player", "Team", "Season", "Yr", "Pos", "GP", "FR"],
    "Passing": ["Pass.Att", "Pass.Comp", "Int.Thrown", "Pass.Yds", "Pass.TD"],
    "Rushing": ["Rush.Att", "Rush.Yds", "Rush.Yds.Gn", "Rush.Yds.Ls", "Rush.TD"],
    "Receiving": ["Rec", "Rec.Yds", "Rec.TD"],
    "Defense": ["Blocks", "FF", "FGs.Blocked", "PBU", "Int", "Sack", "Sack.Yds", "Safeties", "Solo.Tackles", "Asst.Tackles", "TFL", "TFL.Yds"],
    "Kicking": ["KO", "KO.Yds", "KO.TB", "Punts", "Punt.Yds", "Punt.TB", "Punts.I20"],
    "Returns": ["KO.Ret", "Kick.Ret.TD", "KO.Ret.Yds", "Punt.Ret", "Punt.Ret.TD", "Punt.Ret.Yds"],
    "Field Goals / Distance": ["FGM.18.19", "FGA.18.19", "FGM.20.29", "FGA.20.29", "FGM.30.39", "FGA.30.39", "FGM.40.49", "FGA.40.49", "FGM.50.59", "FGA.50.59"]
};

// Collect all available column names (for safety)
const allColumns = Object.values(categoryMap).flat();

// --------------------------------------------------------------
// 2. GLOBAL VARIABLES
// --------------------------------------------------------------
let fullRawData = [];           // original data from CSV
let currentData = [];           // current data (raw or grouped)
let isGrouped = false;          // flag
let groupedData = [];           // stored grouped data
let tableInstance = null;       // Grid.js instance
let chartInstance = null;       // Chart.js instance

// --------------------------------------------------------------
// 3. LOAD CSV WITH PAPAPARSE
// --------------------------------------------------------------
function loadData() {
    Papa.parse("LLData_final.csv", {
        download: true,
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: function(results) {
            console.log(`Loaded ${results.data.length} rows`);
            fullRawData = results.data;
            currentData = [...fullRawData];
            isGrouped = false;
            // Build category UI after we know data is loaded (but we don't need data to build UI)
            buildCategoryUI();
            // Populate chart metric dropdown with numeric columns from first row
            populateMetricSelect();
            // Render table with default selected columns (all visible initially)
            const initialVisible = getSelectedColumns();
            renderTable(currentData, initialVisible);
        },
        error: function(err) {
            console.error("CSV Load Error:", err);
            document.getElementById("table-container").innerHTML = "<p style='color:red'>Error loading CSV. Make sure LLData_final.csv is in the same folder.</p>";
        }
    });
}

// --------------------------------------------------------------
// 4. BUILD CATEGORY UI WITH COLLAPSIBLE SUB-CHECKBOXES
// --------------------------------------------------------------
function buildCategoryUI() {
    const panel = document.getElementById("categoryPanel");
    panel.innerHTML = "";

    for (const [category, cols] of Object.entries(categoryMap)) {
        // Category container
        const catDiv = document.createElement("div");
        catDiv.className = "category";

        // Header with main checkbox + toggle icon
        const header = document.createElement("div");
        header.className = "category-header";

        const catCheck = document.createElement("input");
        catCheck.type = "checkbox";
        catCheck.checked = true;   // all columns visible by default
        catCheck.dataset.category = category;
        catCheck.addEventListener("change", (e) => {
            // toggle all sub-checkboxes in this category
            const subDiv = catDiv.querySelector(".sub-checkboxes");
            const subBoxes = subDiv.querySelectorAll("input[type='checkbox']");
            subBoxes.forEach(cb => cb.checked = e.target.checked);
            refreshTableFromUI();
        });

        const catLabel = document.createElement("span");
        catLabel.textContent = category;

        const toggleBtn = document.createElement("span");
        toggleBtn.textContent = "▼";
        toggleBtn.className = "toggle-icon";
        toggleBtn.style.cursor = "pointer";
        toggleBtn.addEventListener("click", () => {
            const subDiv = catDiv.querySelector(".sub-checkboxes");
            const isVisible = subDiv.style.display === "block";
            subDiv.style.display = isVisible ? "none" : "block";
            toggleBtn.textContent = isVisible ? "▼" : "▲";
        });

        header.appendChild(catCheck);
        header.appendChild(catLabel);
        header.appendChild(toggleBtn);

        // Sub-checkboxes container
        const subDiv = document.createElement("div");
        subDiv.className = "sub-checkboxes";
        subDiv.style.display = "none";  // start collapsed

        cols.forEach(col => {
            const label = document.createElement("label");
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.dataset.col = col;
            cb.checked = true;   // visible by default
            cb.addEventListener("change", () => refreshTableFromUI());
            label.appendChild(cb);
            label.appendChild(document.createTextNode(` ${col}`));
            subDiv.appendChild(label);
        });

        catDiv.appendChild(header);
        catDiv.appendChild(subDiv);
        panel.appendChild(catDiv);
    }
}

// Get currently selected columns from all sub-checkboxes
function getSelectedColumns() {
    const selected = [];
    document.querySelectorAll('.sub-checkboxes input[type="checkbox"]:checked').forEach(cb => {
        selected.push(cb.dataset.col);
    });
    // Ensure "Player" is always shown (useful for identification)
    if (!selected.includes("Player") && allColumns.includes("Player")) {
        selected.unshift("Player");
    }
    return selected;
}

// Refresh table based on current data and selected columns
function refreshTableFromUI() {
    const cols = getSelectedColumns();
    renderTable(currentData, cols);
}

// --------------------------------------------------------------
// 5. RENDER TABLE WITH GRID.JS (supports search, sort, pagination)
// --------------------------------------------------------------
function renderTable(data, visibleColumns) {
    const container = document.getElementById("table-container");
    if (!container) return;

    if (tableInstance) {
        tableInstance.destroy();
        container.innerHTML = "";
    }

    if (!data || data.length === 0) {
        container.innerHTML = "<p>No data available.</p>";
        return;
    }

    // Convert data to array of arrays for Grid.js
    const rows = data.map(row => {
        return visibleColumns.map(col => {
            let val = row[col];
            if (val === undefined || val === null) return "";
            // If it's a number, format nicely (optional)
            if (typeof val === "number") return val.toLocaleString();
            return val;
        });
    });

    tableInstance = new gridjs.Grid({
        columns: visibleColumns,
        data: rows,
        search: true,
        sort: true,
        pagination: {
            enabled: true,
            limit: 25,
            summary: true
        },
        fixedHeader: true,
        height: "500px",
        language: {
            search: "🔍 Search all columns:",
            pagination: {
                previous: "←",
                next: "→",
                showing: "Showing",
                of: "of",
                to: "to",
                results: "results"
            }
        }
    }).render(container);
}

// --------------------------------------------------------------
// 6. GROUP BY PLAYER (aggregate numeric stats, keep first non-numeric)
// --------------------------------------------------------------
function groupByPlayer() {
    if (!fullRawData.length) return;

    const playerMap = new Map();
    
    fullRawData.forEach(row => {
        const playerName = row.Player;
        if (!playerName) return;
        
        if (!playerMap.has(playerName)) {
            // Clone first occurrence
            const newEntry = { ...row };
            playerMap.set(playerName, newEntry);
        } else {
            const existing = playerMap.get(playerName);
            // Sum all numeric fields
            for (let [key, value] of Object.entries(row)) {
                if (typeof value === "number" && key !== "Yr" && key !== "Season") {
                    // Avoid summing year/season identifiers
                    existing[key] = (existing[key] || 0) + value;
                } else if (key === "GP" && typeof value === "number") {
                    existing.GP = (existing.GP || 0) + value;
                }
                // For strings, we keep the first value (Team, Pos, etc.)
            }
        }
    });
    
    groupedData = Array.from(playerMap.values());
    currentData = groupedData;
    isGrouped = true;
    
    // Refresh table with currently selected columns
    const visibleCols = getSelectedColumns();
    renderTable(currentData, visibleCols);
    
    // Update metric dropdown based on grouped data
    populateMetricSelect();
    
    alert(`Grouped into ${groupedData.length} unique players. Now you can draw a chart.`);
}

// Reset to raw data
function resetToRaw() {
    if (!fullRawData.length) return;
    currentData = [...fullRawData];
    isGrouped = false;
    const visibleCols = getSelectedColumns();
    renderTable(currentData, visibleCols);
    populateMetricSelect();   // refresh dropdown based on raw data
}

// --------------------------------------------------------------
// 7. CHART FUNCTIONALITY
// --------------------------------------------------------------
function populateMetricSelect() {
    const select = document.getElementById("chartMetricSelect");
    if (!select) return;
    select.innerHTML = '<option value="">-- Select a numeric stat --</option>';
    
    // Use current data (raw or grouped) to find numeric columns
    if (!currentData.length) return;
    const sample = currentData[0];
    for (let key in sample) {
        if (typeof sample[key] === "number") {
            const option = document.createElement("option");
            option.value = key;
            option.textContent = key;
            select.appendChild(option);
        }
    }
}

function drawChartFromCurrentData() {
    const select = document.getElementById("chartMetricSelect");
    const metric = select.value;
    if (!metric) {
        alert("Please select a numeric statistic from the dropdown.");
        return;
    }
    if (!currentData.length) {
        alert("No data available to chart.");
        return;
    }
    
    // For chart, we need labels (Player names) and values
    const labels = [];
    const values = [];
    for (let row of currentData) {
        let val = row[metric];
        if (typeof val === "number" && !isNaN(val)) {
            labels.push(row.Player || "Unknown");
            values.push(val);
        }
    }
    
    if (labels.length === 0) {
        alert("No valid numeric data for this metric in current view.");
        return;
    }
    
    const ctx = document.getElementById("statsChart").getContext("2d");
    if (chartInstance) chartInstance.destroy();
    
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: metric,
                data: values,
                backgroundColor: 'rgba(30, 70, 110, 0.6)',
                borderColor: '#1e466e',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'top' },
                tooltip: { callbacks: { label: (ctx) => `${ctx.raw.toLocaleString()}` } }
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: metric } },
                x: { ticks: { autoSkip: true, maxTicksLimit: 20 } }
            }
        }
    });
}

// --------------------------------------------------------------
// 8. EXPORT VISIBLE TABLE AS CSV (using current grid data)
// --------------------------------------------------------------
function exportVisibleCSV() {
    if (!currentData.length) return;
    const visibleCols = getSelectedColumns();
    // create CSV string
    const header = visibleCols.join(",");
    const rows = currentData.map(row => {
        return visibleCols.map(col => {
            let val = row[col];
            if (val === undefined || val === null) return "";
            if (typeof val === "string" && (val.includes(",") || val.includes('"'))) {
                return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        }).join(",");
    });
    const csvContent = [header, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "exported_sports_data.csv";
    link.click();
    URL.revokeObjectURL(link.href);
}

// --------------------------------------------------------------
// 9. INITIALISE EVENT LISTENERS & LOAD DATA
// --------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    loadData();
    
    document.getElementById("groupByPlayerBtn").addEventListener("click", groupByPlayer);
    document.getElementById("resetDataBtn").addEventListener("click", resetToRaw);
    document.getElementById("exportCsvBtn").addEventListener("click", exportVisibleCSV);
    document.getElementById("drawChartBtn").addEventListener("click", drawChartFromCurrentData);
});