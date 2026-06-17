// --------------------------------------------------------------
// 1. CATEGORY MAPPING (all 55 columns)
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

const allColumns = Object.values(categoryMap).flat();

// --------------------------------------------------------------
// 2. GLOBAL STATE
// --------------------------------------------------------------
let fullRawData = [];
let currentData = [];          // data after filters/grouping (to be rendered)
let filteredData = [];         // data after applying filters (before pagination)
let isGrouped = false;
let groupedData = [];
let tableInstance = null;
let chartInstance = null;
let activeFilters = [];        // array of filter objects
let currentPageSize = 50;      // default

// --------------------------------------------------------------
// 3. LOAD CSV
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
            filteredData = [...fullRawData];
            isGrouped = false;
            buildCategoryUI();
            populateFilterColumns();
            populateMetricSelect();
            renderTable(currentData);
        },
        error: function(err) {
            console.error("CSV Load Error:", err);
            document.getElementById("table-container").innerHTML = "<p style='color:red'>Error loading CSV. Make sure LLData_final.csv is in the same folder.</p>";
        }
    });
}

// --------------------------------------------------------------
// 4. BUILD CATEGORY UI (unchanged)
// --------------------------------------------------------------
function buildCategoryUI() {
    const panel = document.getElementById("categoryPanel");
    panel.innerHTML = "";
    for (const [category, cols] of Object.entries(categoryMap)) {
        const catDiv = document.createElement("div");
        catDiv.className = "category";
        const header = document.createElement("div");
        header.className = "category-header";
        const catCheck = document.createElement("input");
        catCheck.type = "checkbox";
        catCheck.checked = true;
        catCheck.dataset.category = category;
        catCheck.addEventListener("change", (e) => {
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
        toggleBtn.addEventListener("click", () => {
            const subDiv = catDiv.querySelector(".sub-checkboxes");
            const isVisible = subDiv.style.display === "block";
            subDiv.style.display = isVisible ? "none" : "block";
            toggleBtn.textContent = isVisible ? "▼" : "▲";
        });
        header.appendChild(catCheck);
        header.appendChild(catLabel);
        header.appendChild(toggleBtn);
        const subDiv = document.createElement("div");
        subDiv.className = "sub-checkboxes";
        subDiv.style.display = "none";
        cols.forEach(col => {
            const label = document.createElement("label");
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.dataset.col = col;
            cb.checked = true;
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

function getSelectedColumns() {
    const selected = [];
    document.querySelectorAll('.sub-checkboxes input[type="checkbox"]:checked').forEach(cb => {
        selected.push(cb.dataset.col);
    });
    if (!selected.includes("Player") && allColumns.includes("Player")) {
        selected.unshift("Player");
    }
    return selected;
}

function refreshTableFromUI() {
    const cols = getSelectedColumns();
    renderTable(currentData, cols);
}

// --------------------------------------------------------------
// 5. RENDER TABLE (with horizontal scroll, pagination size)
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

    // If visibleColumns not provided, get from UI
    if (!visibleColumns) visibleColumns = getSelectedColumns();

    // Build rows
    const rows = data.map(row => {
        return visibleColumns.map(col => {
            let val = row[col];
            if (val === undefined || val === null) return "";
            if (typeof val === "number") return val.toLocaleString();
            return val;
        });
    });

    // Determine pagination limit
    let limit = currentPageSize;
    let pagination = { enabled: true, limit: 25, summary: true };
    if (limit === -1) {
        pagination = { enabled: false };
    } else {
        pagination = { enabled: true, limit: limit, summary: true };
    }

    tableInstance = new gridjs.Grid({
        columns: visibleColumns,
        data: rows,
        search: true,
        sort: true,
        pagination: pagination,
        fixedHeader: true,
        height: "550px",
        autoWidth: false,        // prevents auto-shrinking, enables horizontal scroll
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
// 6. ADVANCED FILTER LOGIC
// --------------------------------------------------------------
function populateFilterColumns() {
    const selects = document.querySelectorAll('.filter-column');
    selects.forEach(sel => {
        // Only populate if empty
        if (sel.options.length > 1) return;
        sel.innerHTML = '<option value="">-- Column --</option>';
        allColumns.forEach(col => {
            const opt = document.createElement('option');
            opt.value = col;
            opt.textContent = col;
            sel.appendChild(opt);
        });
    });
}

// Add a new filter row
function addFilterRow(column = "", operator = "=", value = "", value2 = "") {
    const container = document.getElementById("filterContainer");
    const row = document.createElement("div");
    row.className = "filter-row";

    // Column select
    const colSelect = document.createElement("select");
    colSelect.className = "filter-column";
    colSelect.innerHTML = '<option value="">-- Column --</option>';
    allColumns.forEach(col => {
        const opt = document.createElement('option');
        opt.value = col;
        opt.textContent = col;
        colSelect.appendChild(opt);
    });
    colSelect.value = column;

    // Operator select
    const opSelect = document.createElement("select");
    opSelect.className = "filter-operator";
    const ops = ["=", "!=", ">", "<", ">=", "<=", "contains", "between"];
    ops.forEach(op => {
        const opt = document.createElement('option');
        opt.value = op;
        opt.textContent = op;
        opSelect.appendChild(opt);
    });
    opSelect.value = operator;
    opSelect.addEventListener('change', (e) => {
        const val2 = row.querySelector('.filter-value2');
        if (e.target.value === 'between') {
            val2.style.display = 'inline-block';
            val2.placeholder = 'Upper value';
        } else {
            val2.style.display = 'none';
            val2.value = '';
        }
    });

    // Value 1 input
    const valInput = document.createElement("input");
    valInput.className = "filter-value";
    valInput.type = "text";
    valInput.placeholder = "Value";
    valInput.value = value;

    // Value 2 input (for between)
    const val2Input = document.createElement("input");
    val2Input.className = "filter-value2";
    val2Input.type = "text";
    val2Input.placeholder = "Upper value";
    val2Input.style.display = operator === 'between' ? 'inline-block' : 'none';
    val2Input.value = value2;

    // Add button (only first row gets +, others get remove)
    const addBtn = document.createElement("button");
    addBtn.textContent = "+ Add";
    addBtn.className = "filter-add-btn";
    addBtn.addEventListener('click', () => addFilterRow());

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.className = "filter-remove-btn";
    removeBtn.style.display = "inline-block";
    removeBtn.style.background = "#b02a37";
    removeBtn.addEventListener('click', () => {
        if (document.querySelectorAll('.filter-row').length > 1) {
            row.remove();
        } else {
            alert("Keep at least one filter row.");
        }
    });

    row.appendChild(colSelect);
    row.appendChild(opSelect);
    row.appendChild(valInput);
    row.appendChild(val2Input);
    row.appendChild(addBtn);
    row.appendChild(removeBtn);
    container.appendChild(row);

    // Re-populate column dropdowns for new row
    populateFilterColumns();
    // Apply filter status message
    updateFilterStatus();
}

function getFilterConfigs() {
    const configs = [];
    document.querySelectorAll('.filter-row').forEach(row => {
        const col = row.querySelector('.filter-column')?.value;
        const op = row.querySelector('.filter-operator')?.value;
        const val = row.querySelector('.filter-value')?.value.trim();
        const val2 = row.querySelector('.filter-value2')?.value.trim();
        if (col && val) {
            configs.push({ column: col, operator: op, value: val, value2: val2 });
        }
    });
    return configs;
}

function applyFiltersToData(data, filters) {
    if (!filters || filters.length === 0) return data;
    return data.filter(row => {
        for (let f of filters) {
            const cell = row[f.column];
            if (cell === undefined || cell === null) return false;
            const val = f.value;
            const val2 = f.value2;
            let ok = false;
            switch (f.operator) {
                case '=':
                    ok = (String(cell).toLowerCase() === String(val).toLowerCase());
                    break;
                case '!=':
                    ok = (String(cell).toLowerCase() !== String(val).toLowerCase());
                    break;
                case '>':
                    ok = (parseFloat(cell) > parseFloat(val));
                    break;
                case '<':
                    ok = (parseFloat(cell) < parseFloat(val));
                    break;
                case '>=':
                    ok = (parseFloat(cell) >= parseFloat(val));
                    break;
                case '<=':
                    ok = (parseFloat(cell) <= parseFloat(val));
                    break;
                case 'contains':
                    ok = String(cell).toLowerCase().includes(String(val).toLowerCase());
                    break;
                case 'between':
                    if (val2 !== '') {
                        ok = (parseFloat(cell) >= parseFloat(val) && parseFloat(cell) <= parseFloat(val2));
                    } else {
                        ok = false;
                    }
                    break;
                default:
                    ok = false;
            }
            if (!ok) return false;
        }
        return true;
    });
}

function applyFilters() {
    const filters = getFilterConfigs();
    activeFilters = filters.filter(f => f.column && f.value);
    const baseData = isGrouped ? groupedData : fullRawData;
    filteredData = applyFiltersToData(baseData, activeFilters);
    currentData = filteredData;
    renderTable(currentData);
    updateFilterStatus();
    populateMetricSelect(); // refresh chart dropdown based on filtered data
}

function clearFilters() {
    document.querySelectorAll('.filter-row').forEach((row, idx) => {
        if (idx > 0) row.remove();
        else {
            row.querySelector('.filter-column').value = '';
            row.querySelector('.filter-operator').value = '=';
            row.querySelector('.filter-value').value = '';
            row.querySelector('.filter-value2').value = '';
            row.querySelector('.filter-value2').style.display = 'none';
        }
    });
    activeFilters = [];
    const baseData = isGrouped ? groupedData : fullRawData;
    filteredData = [...baseData];
    currentData = filteredData;
    renderTable(currentData);
    updateFilterStatus();
    populateMetricSelect();
}

function updateFilterStatus() {
    const status = document.getElementById('filterStatus');
    const count = activeFilters.length;
    if (count === 0) {
        status.textContent = `Showing all ${currentData.length} rows.`;
    } else {
        status.textContent = `Filtered by ${count} condition(s). Showing ${currentData.length} rows.`;
    }
}

// --------------------------------------------------------------
// 7. GROUPING, RESET, EXPORT (with filter awareness)
// --------------------------------------------------------------
function groupByPlayer() {
    if (!fullRawData.length) return;
    const baseData = fullRawData; // grouping always from raw, filters applied after
    const playerMap = new Map();
    baseData.forEach(row => {
        const name = row.Player;
        if (!name) return;
        if (!playerMap.has(name)) {
            playerMap.set(name, { ...row });
        } else {
            const existing = playerMap.get(name);
            for (let [key, value] of Object.entries(row)) {
                if (typeof value === "number" && key !== "Yr" && key !== "Season") {
                    existing[key] = (existing[key] || 0) + value;
                } else if (key === "GP" && typeof value === "number") {
                    existing.GP = (existing.GP || 0) + value;
                }
            }
        }
    });
    groupedData = Array.from(playerMap.values());
    isGrouped = true;
    // Apply existing filters on the grouped data
    filteredData = applyFiltersToData(groupedData, activeFilters);
    currentData = filteredData;
    renderTable(currentData);
    populateMetricSelect();
    alert(`Grouped into ${groupedData.length} unique players.`);
}

function resetToRaw() {
    if (!fullRawData.length) return;
    isGrouped = false;
    groupedData = [];
    filteredData = applyFiltersToData(fullRawData, activeFilters);
    currentData = filteredData;
    renderTable(currentData);
    populateMetricSelect();
}

function exportVisibleCSV() {
    if (!currentData.length) return;
    const visibleCols = getSelectedColumns();
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
// 8. PAGINATION SIZE CHANGE
// --------------------------------------------------------------
function setPageSize(size) {
    currentPageSize = parseInt(size);
    renderTable(currentData); // re-render with new limit
}

// --------------------------------------------------------------
// 9. CHART – HIDDEN BY DEFAULT, TOGGLE, AND DRAW
// --------------------------------------------------------------
function toggleChartVisibility() {
    const section = document.getElementById('chartSection');
    if (section.style.display === 'none') {
        section.style.display = 'block';
    } else {
        section.style.display = 'none';
    }
}

function populateMetricSelect() {
    const select = document.getElementById("chartMetricSelect");
    if (!select) return;
    select.innerHTML = '<option value="">-- Select a numeric stat --</option>';
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
    // Show chart section if hidden
    document.getElementById('chartSection').style.display = 'block';

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
// 10. INITIALISE EVENTS
// --------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    loadData();

    // Global actions
    document.getElementById("groupByPlayerBtn").addEventListener("click", groupByPlayer);
    document.getElementById("resetDataBtn").addEventListener("click", resetToRaw);
    document.getElementById("exportCsvBtn").addEventListener("click", exportVisibleCSV);
    document.getElementById("toggleChartBtn").addEventListener("click", toggleChartVisibility);
    document.getElementById("closeChartBtn")?.addEventListener("click", () => {
        document.getElementById('chartSection').style.display = 'none';
    });

    // Filter actions
    document.getElementById("applyFiltersBtn").addEventListener("click", applyFilters);
    document.getElementById("clearFiltersBtn").addEventListener("click", clearFilters);

    // Add initial filter row
    addFilterRow();

    // Pagination size change
    document.getElementById("pageSizeSelect").addEventListener("change", (e) => {
        setPageSize(e.target.value);
    });

    // Draw chart
    document.getElementById("drawChartBtn").addEventListener("click", drawChartFromCurrentData);
});
