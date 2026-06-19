// --------------------------------------------------------------
// 1. CATEGORY MAPPING (all 55 columns) + Custom category
// --------------------------------------------------------------
const categoryMap = {
    "General": ["Player", "Team", "Season", "Yr", "Pos", "GP", "FR"],
    "Passing": ["Pass.Att", "Pass.Comp", "Int.Thrown", "Pass.Yds", "Pass.TD"],
    "Rushing": ["Rush.Att", "Rush.Yds", "Rush.Yds.Gn", "Rush.Yds.Ls", "Rush.TD"],
    "Receiving": ["Rec", "Rec.Yds", "Rec.TD"],
    "Defense": ["Blocks", "FF", "FGs.Blocked", "PBU", "Int", "Sack", "Sack.Yds", "Safeties", "Solo.Tackles", "Asst.Tackles", "TFL", "TFL.Yds"],
    "Kicking": ["KO", "KO.Yds", "KO.TB", "Punts", "Punt.Yds", "Punt.TB", "Punts.I20"],
    "Returns": ["KO.Ret", "Kick.Ret.TD", "KO.Ret.Yds", "Punt.Ret", "Punt.Ret.TD", "Punt.Ret.Yds"],
    "Field Goals / Distance": ["FGM.18.19", "FGA.18.19", "FGM.20.29", "FGA.20.29", "FGM.30.39", "FGA.30.39", "FGM.40.49", "FGA.40.49", "FGM.50.59", "FGA.50.59"],
    "Custom": []
};

let allColumns = Object.values(categoryMap).flat();

// --------------------------------------------------------------
// 2. GLOBAL STATE
// --------------------------------------------------------------
let fullRawData = [];
let currentData = [];
let filteredData = [];
let isGrouped = false;
let groupedData = [];
let tableInstance = null;
let chartInstance = null;
let activeFilters = [];
let currentPageSize = 50;
let uniqueTeams = [];
let uniquePositions = [];
// Track sort state per column for consistent cycling
let sortState = {}; // { colName: 'asc' | 'desc' | 'none' }

// Team color palette (Liberty League teams — extend as needed)
const TEAM_COLORS = {
    "Bard":        { bg: "rgba(0,56,101,0.7)",   border: "#003865" },
    "Clarkson":    { bg: "rgba(0,114,198,0.7)",  border: "#0072C6" },
    "Hobart":      { bg: "rgba(149,0,31,0.7)",   border: "#95001F" },
    "Ithaca":      { bg: "rgba(0,102,51,0.7)",   border: "#006633" },
    "RPI":         { bg: "rgba(209,0,24,0.7)",   border: "#D10018" },
    "Rochester":   { bg: "rgba(253,185,19,0.7)", border: "#FDB913" },
    "SLU":         { bg: "rgba(0,68,124,0.7)",   border: "#00447C" },
    "Skidmore":    { bg: "rgba(0,101,65,0.7)",   border: "#006541" },
    "Union":       { bg: "rgba(129,0,21,0.7)",   border: "#810015" },
    "Utica":       { bg: "rgba(0,83,155,0.7)",   border: "#00539B" },
    "DEFAULT":     { bg: "rgba(30,70,110,0.7)",  border: "#1e466e" }
};

function getTeamColor(teamName) {
    if (!teamName) return TEAM_COLORS.DEFAULT;
    // Try exact match first, then partial
    if (TEAM_COLORS[teamName]) return TEAM_COLORS[teamName];
    for (const key of Object.keys(TEAM_COLORS)) {
        if (key !== "DEFAULT" && teamName.toLowerCase().includes(key.toLowerCase())) {
            return TEAM_COLORS[key];
        }
    }
    return TEAM_COLORS.DEFAULT;
}

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
            // Extract unique teams and positions for autocomplete
            uniqueTeams = [...new Set(fullRawData.map(r => r.Team).filter(Boolean))].sort();
            uniquePositions = [...new Set(fullRawData.map(r => r.Pos).filter(Boolean))].sort();
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
// 4. BUILD CATEGORY UI – DEFAULT UNCHECKED (except General defaults)
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
        catCheck.checked = false;
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
        subDiv.style.display = (category === "General") ? "block" : "none";
        toggleBtn.textContent = (category === "General") ? "▲" : "▼";
        cols.forEach(col => {
            const label = document.createElement("label");
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.dataset.col = col;
            const defaultCols = ["Player", "Team", "Season", "Yr", "Pos", "GP"];
            cb.checked = defaultCols.includes(col);
            cb.addEventListener("change", () => {
                refreshTableFromUI();
                updateCategoryHeaderState(catDiv, catCheck);
            });
            label.appendChild(cb);
            label.appendChild(document.createTextNode(` ${col}`));
            subDiv.appendChild(label);
        });
        catDiv.appendChild(header);
        catDiv.appendChild(subDiv);
        panel.appendChild(catDiv);
        updateCategoryHeaderState(catDiv, catCheck);
    }
}

function updateCategoryHeaderState(catDiv, catCheck) {
    const subBoxes = catDiv.querySelectorAll('.sub-checkboxes input[type="checkbox"]');
    if (subBoxes.length === 0) { catCheck.checked = false; return; }
    const checked = Array.from(subBoxes).filter(cb => cb.checked);
    catCheck.checked = (checked.length === subBoxes.length);
    catCheck.indeterminate = checked.length > 0 && checked.length < subBoxes.length;
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
// 5. RENDER TABLE – auto width + resizable columns
//    FIX: columns prop uses objects with 'name' so Grid.js
//    actually renders them, and sort is numeric-aware.
// --------------------------------------------------------------
function renderTable(data, visibleColumns) {
    const container = document.getElementById("table-container");
    if (!container) return;
    if (tableInstance) {
        try { tableInstance.destroy(); } catch(e) {}
        container.innerHTML = "";
    }
    if (!data || data.length === 0) {
        container.innerHTML = "<p>No data available.</p>";
        return;
    }
    if (!visibleColumns) visibleColumns = getSelectedColumns();

    // Build rows as arrays — values stay native (number or string) so sort works
    const rows = data.map(row => {
        return visibleColumns.map(col => {
            let val = row[col];
            if (val === undefined || val === null) return "";
            return val;
        });
    });

    // Build column defs with consistent numeric comparator
    const columnDefs = visibleColumns.map((col, idx) => {
        // Determine if column is mostly numeric
        let numericCount = 0;
        const sample = rows.slice(0, Math.min(50, rows.length));
        sample.forEach(r => { if (typeof r[idx] === 'number') numericCount++; });
        const isNumeric = numericCount > sample.length * 0.5;

        return {
            name: col,
            sort: {
                compare: (a, b) => {
                    // Handle empty strings
                    const aEmpty = (a === "" || a === null || a === undefined);
                    const bEmpty = (b === "" || b === null || b === undefined);
                    if (aEmpty && bEmpty) return 0;
                    if (aEmpty) return 1;  // empties always last
                    if (bEmpty) return -1;
                    if (isNumeric) {
                        const na = typeof a === 'number' ? a : parseFloat(a);
                        const nb = typeof b === 'number' ? b : parseFloat(b);
                        if (!isNaN(na) && !isNaN(nb)) return na - nb;
                    }
                    return String(a).localeCompare(String(b));
                }
            },
            // Format numbers for display via formatter
            formatter: (cell) => {
                if (cell === "" || cell === null || cell === undefined) return "";
                if (typeof cell === 'number') return cell.toLocaleString();
                return cell;
            }
        };
    });

    let pagination;
    if (currentPageSize === -1) {
        pagination = { enabled: false };
    } else {
        pagination = { enabled: true, limit: currentPageSize, summary: true };
    }

    tableInstance = new gridjs.Grid({
        columns: columnDefs,
        data: rows,
        search: true,
        sort: true,
        pagination: pagination,
        fixedHeader: true,
        height: "550px",
        autoWidth: true,
        resizable: true,
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
// 6. FILTER LOGIC – with autocomplete dropdown for Team/Pos
// --------------------------------------------------------------
function populateFilterColumns() {
    const selects = document.querySelectorAll('.filter-column');
    selects.forEach(sel => {
        const current = sel.value;
        sel.innerHTML = '<option value="">-- Column --</option>';
        allColumns.forEach(col => {
            const opt = document.createElement('option');
            opt.value = col;
            opt.textContent = col;
            sel.appendChild(opt);
        });
        if (current) sel.value = current;
    });
}

// Build a datalist element for a given column.
// For custom (computed) columns we scan currentData since they don't exist in fullRawData.
function buildDatalist(col) {
    const id = `dl_${col.replace(/[^a-zA-Z0-9]/g, '_')}`;
    // Always rebuild for custom columns so values stay fresh; cache others
    const isCustom = categoryMap["Custom"] && categoryMap["Custom"].includes(col);
    let dl = document.getElementById(id);
    if (dl && !isCustom) return id;
    if (dl) dl.remove(); // rebuild custom datalist fresh

    dl = document.createElement('datalist');
    dl.id = id;
    let values = [];

    if (col === 'Team') {
        values = uniqueTeams;
    } else if (col === 'Pos') {
        values = uniquePositions;
    } else {
        // Search both fullRawData and currentData (catches computed columns)
        const sources = isCustom ? currentData : [...fullRawData, ...currentData];
        const set = new Set();
        for (const row of sources) {
            const v = row[col];
            if (v !== null && v !== undefined && v !== "") {
                set.add(String(v));
                if (set.size >= 300) break;
            }
        }
        // Sort: numeric if values look numeric, else lexicographic
        const arr = [...set];
        const allNumeric = arr.every(s => !isNaN(parseFloat(s)) && isFinite(s));
        values = allNumeric
            ? arr.sort((a, b) => parseFloat(a) - parseFloat(b))
            : arr.sort((a, b) => a.localeCompare(b));
    }

    values.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        dl.appendChild(opt);
    });
    document.body.appendChild(dl);
    return id;
}

function wireAutocomplete(row) {
    const colSel = row.querySelector('.filter-column');
    const valInput = row.querySelector('.filter-value');
    if (!colSel || !valInput) return;

    colSel.addEventListener('change', () => {
        const col = colSel.value;
        hideCheckboxDropdown(row);
        valInput.removeAttribute('list');
        if (!col) return;

        // Always build and attach a datalist (works for any column)
        const dlId = buildDatalist(col);
        valInput.setAttribute('list', dlId);

        // For Team / Pos also show checkbox multi-select panel
        if (col === 'Team' || col === 'Pos') {
            showCheckboxDropdown(row, col);
        }
    });
}

function showCheckboxDropdown(filterRow, col) {
    hideCheckboxDropdown(filterRow); // remove old
    const values = col === 'Team' ? uniqueTeams : uniquePositions;
    const wrap = document.createElement('div');
    wrap.className = 'checkbox-dropdown';
    wrap.innerHTML = `<div class="cbd-title">Select ${col}(s):</div>`;
    const list = document.createElement('div');
    list.className = 'cbd-list';
    values.forEach(v => {
        const lbl = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = v;
        cb.addEventListener('change', () => {
            const checked = [...wrap.querySelectorAll('input:checked')].map(c => c.value);
            const valInput = filterRow.querySelector('.filter-value');
            // Put comma-separated into value field, switch operator to 'in'
            valInput.value = checked.join(',');
            const opSel = filterRow.querySelector('.filter-operator');
            if (checked.length > 1) opSel.value = 'in';
            else if (checked.length === 1) opSel.value = '=';
        });
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(' ' + v));
        list.appendChild(lbl);
    });
    wrap.appendChild(list);
    filterRow.appendChild(wrap);
}

function hideCheckboxDropdown(filterRow) {
    const existing = filterRow.querySelector('.checkbox-dropdown');
    if (existing) existing.remove();
}

function addFilterRow(column = "", operator = "=", value = "", value2 = "") {
    const container = document.getElementById("filterContainer");
    const row = document.createElement("div");
    row.className = "filter-row";

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

    const opSelect = document.createElement("select");
    opSelect.className = "filter-operator";
    const ops = ["=", "!=", ">", "<", ">=", "<=", "contains", "between", "in"];
    ops.forEach(op => {
        const opt = document.createElement('option');
        opt.value = op;
        // nicer labels
        const labels = {"=":"=","!=":"≠",">":">","<":"<",">=":"≥","<=":"≤","contains":"contains","between":"between","in":"in (comma-sep)"};
        opt.textContent = labels[op] || op;
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

    const valInput = document.createElement("input");
    valInput.className = "filter-value";
    valInput.type = "text";
    valInput.placeholder = "Value";
    valInput.value = value;

    const val2Input = document.createElement("input");
    val2Input.className = "filter-value2";
    val2Input.type = "text";
    val2Input.placeholder = "Upper value";
    val2Input.style.display = operator === 'between' ? 'inline-block' : 'none';
    val2Input.value = value2;

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
        }
    });

    row.appendChild(colSelect);
    row.appendChild(opSelect);
    row.appendChild(valInput);
    row.appendChild(val2Input);
    row.appendChild(addBtn);
    row.appendChild(removeBtn);
    container.appendChild(row);

    // Wire autocomplete
    wireAutocomplete(row);
    if (column) {
        const dlId = buildDatalist(column);
        valInput.setAttribute('list', dlId);
        if (column === 'Team' || column === 'Pos') showCheckboxDropdown(row, column);
    }

    populateFilterColumns();
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
                case '=':  ok = (String(cell).toLowerCase() === String(val).toLowerCase()); break;
                case '!=': ok = (String(cell).toLowerCase() !== String(val).toLowerCase()); break;
                case '>':  ok = (parseFloat(cell) > parseFloat(val)); break;
                case '<':  ok = (parseFloat(cell) < parseFloat(val)); break;
                case '>=': ok = (parseFloat(cell) >= parseFloat(val)); break;
                case '<=': ok = (parseFloat(cell) <= parseFloat(val)); break;
                case 'contains': ok = String(cell).toLowerCase().includes(String(val).toLowerCase()); break;
                case 'between':
                    if (val2 !== '') ok = (parseFloat(cell) >= parseFloat(val) && parseFloat(cell) <= parseFloat(val2));
                    break;
                case 'in': {
                    const vals = val.split(',').map(s => s.trim().toLowerCase());
                    ok = vals.includes(String(cell).toLowerCase());
                    break;
                }
                default: ok = false;
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
    populateMetricSelect();
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
            row.querySelector('.filter-value').removeAttribute('list');
            hideCheckboxDropdown(row);
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
    if (count === 0) status.textContent = `Showing all ${currentData.length} rows.`;
    else status.textContent = `Filtered by ${count} condition(s). Showing ${currentData.length} rows.`;
}

// --------------------------------------------------------------
// 7. GROUPING, RESET, EXPORT
// --------------------------------------------------------------
function groupByPlayer() {
    if (!fullRawData.length) return;
    const playerMap = new Map();
    fullRawData.forEach(row => {
        const name = row.Player;
        if (!name) return;
        if (!playerMap.has(name)) {
            playerMap.set(name, { ...row });
        } else {
            const existing = playerMap.get(name);
            for (let [key, value] of Object.entries(row)) {
                if (typeof value === "number" && key !== "Yr" && key !== "Season") {
                    existing[key] = (existing[key] || 0) + value;
                }
            }
        }
    });
    groupedData = Array.from(playerMap.values());
    isGrouped = true;
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
    renderTable(currentData);
}

// --------------------------------------------------------------
// 9. CHART – full rewrite with all new features
// --------------------------------------------------------------
function toggleChartVisibility() {
    const section = document.getElementById('chartSection');
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
}

function populateMetricSelect() {
    const select = document.getElementById("chartMetricSelect");
    const selectX = document.getElementById("chartMetricX");
    if (!select) return;
    select.innerHTML = '<option value="">-- Y Axis stat --</option>';
    selectX.innerHTML = '<option value="">-- X Axis stat --</option>';
    if (!currentData.length) return;
    const sample = currentData[0];
    for (let key in sample) {
        if (typeof sample[key] === "number") {
            [select, selectX].forEach(s => {
                const opt = document.createElement("option");
                opt.value = key; opt.textContent = key;
                s.appendChild(opt);
            });
        }
    }
}

function drawChartFromCurrentData() {
    const metricY    = document.getElementById("chartMetricSelect").value;
    const metricX    = document.getElementById("chartMetricX").value;
    const chartType  = document.getElementById("chartTypeSelect").value;
    const colorByTeam = document.getElementById("colorByTeamCheck").checked;
    const showLogos   = document.getElementById("showLogosCheck").checked;
    const showLabels  = document.getElementById("showPointLabels").checked;
    const showMeanX   = document.getElementById("showMeanX").checked;
    const showMeanY   = document.getElementById("showMeanY").checked;
    const showLinReg  = document.getElementById("showLinReg").checked;
    const customTitle = document.getElementById("chartTitleInput").value.trim();
    const customAxisX = document.getElementById("chartAxisXInput").value.trim();
    const customAxisY = document.getElementById("chartAxisYInput").value.trim();
    const chartSize   = document.getElementById("chartSizeSelect").value; // small/medium/large

    if (!metricY) { alert("Please select a Y Axis stat."); return; }
    if (!currentData.length) { alert("No data available."); return; }
    if (chartType === 'scatter' && !metricX) { alert("Scatter plot needs an X Axis stat."); return; }

    // Collect data
    const points = [];
    for (const row of currentData) {
        const y = row[metricY];
        if (typeof y !== 'number' || isNaN(y)) continue;
        if (chartType === 'scatter') {
            const x = row[metricX];
            if (typeof x !== 'number' || isNaN(x)) continue;
            points.push({ x, y, label: row.Player || 'Unknown', team: row.Team || '' });
        } else {
            points.push({ y, label: row.Player || 'Unknown', team: row.Team || '' });
        }
    }
    if (!points.length) { alert("No valid numeric data for selected metrics."); return; }

    // Limit radar to top-10
    let finalPoints = points;
    if (chartType === 'radar' && points.length > 10) {
        finalPoints = [...points].sort((a,b) => b.y - a.y).slice(0, 10);
    }

    // Resize canvas
    const canvas = document.getElementById("statsChart");
    const sizes = { small: 280, medium: 420, large: 580 };
    canvas.height = sizes[chartSize] ?? 420;

    document.getElementById('chartSection').style.display = 'block';
    const ctx = canvas.getContext("2d");
    if (chartInstance) chartInstance.destroy();

    // Build per-point colors
    const bgColors  = finalPoints.map(p => colorByTeam ? getTeamColor(p.team).bg     : 'rgba(30,70,110,0.7)');
    const bdColors  = finalPoints.map(p => colorByTeam ? getTeamColor(p.team).border  : '#1e466e');

    const titleText = customTitle || (chartType === 'scatter' ? `${customAxisX || metricX} vs ${customAxisY || metricY}` : `${customAxisY || metricY} by Player`);
    const xAxisLabel = customAxisX || (chartType === 'scatter' ? metricX : 'Player');
    const yAxisLabel = customAxisY || metricY;

    // ---- Annotation plugin lines (mean + linreg) ----
    const annotations = {};

    if ((showMeanX || showMeanY || showLinReg) && chartType === 'scatter') {
        const xs = finalPoints.map(p => p.x);
        const ys = finalPoints.map(p => p.y);
        const n  = xs.length;
        const meanX = xs.reduce((a,b)=>a+b,0)/n;
        const meanY = ys.reduce((a,b)=>a+b,0)/n;

        if (showMeanX) {
            annotations['meanXLine'] = {
                type: 'line',
                scaleID: 'x',
                value: meanX,
                borderColor: 'rgba(200,50,50,0.7)',
                borderWidth: 2,
                borderDash: [6,4],
                label: { display: true, content: `Mean ${xAxisLabel}: ${meanX.toFixed(1)}`, position: 'end', backgroundColor: 'rgba(200,50,50,0.8)', color: '#fff', font: { size: 11 } }
            };
        }
        if (showMeanY) {
            annotations['meanYLine'] = {
                type: 'line',
                scaleID: 'y',
                value: meanY,
                borderColor: 'rgba(50,150,50,0.7)',
                borderWidth: 2,
                borderDash: [6,4],
                label: { display: true, content: `Mean ${yAxisLabel}: ${meanY.toFixed(1)}`, position: 'end', backgroundColor: 'rgba(50,150,50,0.8)', color: '#fff', font: { size: 11 } }
            };
        }
        if (showLinReg) {
            // Compute slope & intercept
            const sumX  = xs.reduce((a,b)=>a+b,0);
            const sumY  = ys.reduce((a,b)=>a+b,0);
            const sumXY = xs.reduce((a,x,i)=>a+x*ys[i],0);
            const sumX2 = xs.reduce((a,x)=>a+x*x,0);
            const denom = n*sumX2 - sumX*sumX;
            if (denom !== 0) {
                const slope = (n*sumXY - sumX*sumY)/denom;
                const intercept = (sumY - slope*sumX)/n;
                const minX = Math.min(...xs);
                const maxX = Math.max(...xs);
                annotations['linRegLine'] = {
                    type: 'line',
                    xMin: minX, xMax: maxX,
                    yMin: slope*minX+intercept, yMax: slope*maxX+intercept,
                    borderColor: 'rgba(150,50,200,0.85)',
                    borderWidth: 2.5,
                    label: {
                        display: true,
                        content: `y = ${slope.toFixed(3)}x + ${intercept.toFixed(2)}`,
                        position: 'center',
                        backgroundColor: 'rgba(150,50,200,0.8)',
                        color: '#fff',
                        font: { size: 11 }
                    }
                };
            }
        }
    } else if (chartType !== 'scatter') {
        // For bar/line, mean is a horizontal annotation on Y
        if (showMeanY) {
            const ys = finalPoints.map(p => p.y);
            const meanY = ys.reduce((a,b)=>a+b,0)/ys.length;
            annotations['meanYLine'] = {
                type: 'line', scaleID: 'y', value: meanY,
                borderColor: 'rgba(50,150,50,0.7)', borderWidth: 2, borderDash: [6,4],
                label: { display: true, content: `Mean: ${meanY.toFixed(1)}`, position: 'end', backgroundColor: 'rgba(50,150,50,0.8)', color: '#fff', font: { size: 11 } }
            };
        }
    }

    // Point label plugin config
    const datalabelsPlugin = showLabels ? {
        anchor: 'end', align: 'top', offset: 3,
        font: { size: 10 },
        color: '#333',
        formatter: (val, ctx2) => finalPoints[ctx2.dataIndex]?.label ?? ''
    } : false;

    let config;

    if (chartType === 'scatter') {
        const scatterData = finalPoints.map(p => ({ x: p.x, y: p.y }));
        // If color by team, split into per-team datasets so legend shows teams
        let datasets;
        if (colorByTeam) {
            const teamMap = new Map();
            finalPoints.forEach((p,i) => {
                if (!teamMap.has(p.team)) teamMap.set(p.team, { pts: [], idxs: [] });
                teamMap.get(p.team).pts.push({ x: p.x, y: p.y });
                teamMap.get(p.team).idxs.push(i);
            });
            datasets = [...teamMap.entries()].map(([team, info]) => {
                const c = getTeamColor(team);
                return {
                    label: team || 'Unknown',
                    data: info.pts,
                    backgroundColor: c.bg,
                    borderColor: c.border,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    datalabels: showLabels ? {
                        anchor: 'end', align: 'top', offset: 3, font: { size: 10 }, color: '#333',
                        formatter: (val, ctx2) => {
                            // find the global index for this point
                            return info.idxs[ctx2.dataIndex] !== undefined
                                ? finalPoints[info.idxs[ctx2.dataIndex]]?.label : '';
                        }
                    } : { display: false }
                };
            });
        } else {
            datasets = [{
                label: `${xAxisLabel} vs ${yAxisLabel}`,
                data: scatterData,
                backgroundColor: bgColors,
                borderColor: bdColors,
                pointRadius: 5, pointHoverRadius: 8,
                datalabels: datalabelsPlugin || { display: false }
            }];
        }

        config = {
            type: 'scatter',
            data: { datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: titleText, font: { size: 16 } },
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: (ctx2) => {
                                const i = ctx2.dataIndex;
                                const ds = ctx2.dataset;
                                // Try to find original label
                                let lbl = '';
                                if (!colorByTeam) lbl = finalPoints[i]?.label ?? '';
                                else {
                                    // Walk team datasets to find player
                                    const dsLabel = ds.label;
                                    const teamPts = finalPoints.filter(p => p.team === dsLabel);
                                    lbl = teamPts[i]?.label ?? '';
                                }
                                return `${lbl}: (${ctx2.raw.x.toLocaleString()}, ${ctx2.raw.y.toLocaleString()})`;
                            }
                        }
                    },
                    annotation: { annotations }
                },
                scales: {
                    x: { title: { display: true, text: xAxisLabel, font: { size: 13 } } },
                    y: { beginAtZero: false, title: { display: true, text: yAxisLabel, font: { size: 13 } } }
                }
            },
            plugins: [ChartDataLabels]
        };

    } else if (chartType === 'radar') {
        config = {
            type: 'radar',
            data: {
                labels: finalPoints.map(p => p.label),
                datasets: [{
                    label: yAxisLabel,
                    data: finalPoints.map(p => p.y),
                    backgroundColor: 'rgba(30,70,110,0.25)',
                    borderColor: '#1e466e', borderWidth: 2,
                    pointBackgroundColor: bdColors
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: titleText, font: { size: 16 } },
                    legend: { position: 'top' },
                    annotation: {}
                },
                scales: { r: { beginAtZero: true } }
            },
            plugins: [ChartDataLabels]
        };

    } else {
        // bar or line
        config = {
            type: chartType,
            data: {
                labels: finalPoints.map(p => p.label),
                datasets: [{
                    label: yAxisLabel,
                    data: finalPoints.map(p => p.y),
                    backgroundColor: bgColors,
                    borderColor: bdColors,
                    borderWidth: chartType === 'line' ? 2 : 1,
                    fill: chartType === 'line' ? false : undefined,
                    tension: chartType === 'line' ? 0.3 : undefined,
                    pointRadius: chartType === 'line' ? 3 : undefined,
                    datalabels: datalabelsPlugin || { display: false }
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: titleText, font: { size: 16 } },
                    legend: { position: 'top' },
                    tooltip: { callbacks: { label: (ctx2) => ctx2.raw.toLocaleString() } },
                    annotation: { annotations }
                },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: yAxisLabel, font: { size: 13 } } },
                    x: { title: { display: true, text: xAxisLabel, font: { size: 13 } }, ticks: { autoSkip: true, maxTicksLimit: 30 } }
                }
            },
            plugins: [ChartDataLabels]
        };
    }

    chartInstance = new Chart(ctx, config);
}

// Build a checkbox row with a ✕ remove button for a custom column
function addCustomColumnCheckbox(subDiv, catDiv, name) {
    const wrapper = document.createElement("div");
    wrapper.className = "custom-col-row";
    wrapper.dataset.customCol = name;
    wrapper.style.cssText = "display:flex; align-items:center; gap:6px; margin:4px 0;";

    const labelEl = document.createElement("label");
    labelEl.style.cssText = "display:flex; align-items:center; gap:4px; font-size:13px; flex:1;";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.dataset.col = name; cb.checked = true;
    cb.addEventListener("change", () => {
        refreshTableFromUI();
        const catCheck = catDiv.querySelector('.category-header input[type="checkbox"]');
        updateCategoryHeaderState(catDiv, catCheck);
    });
    labelEl.appendChild(cb);
    labelEl.appendChild(document.createTextNode(` ${name}`));

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.title = `Remove column "${name}"`;
    removeBtn.style.cssText = "padding:1px 6px; font-size:11px; background:#b02a37; border-radius:5px; cursor:pointer; flex-shrink:0;";
    removeBtn.addEventListener("click", () => removeComputedColumn(name));

    wrapper.appendChild(labelEl);
    wrapper.appendChild(removeBtn);
    subDiv.appendChild(wrapper);

    const catCheck = catDiv.querySelector('.category-header input[type="checkbox"]');
    updateCategoryHeaderState(catDiv, catCheck);
}

// Remove a computed column entirely
function removeComputedColumn(name) {
    if (!confirm(`Remove computed column "${name}"? This cannot be undone.`)) return;

    // Strip from all data rows
    for (const row of fullRawData)  delete row[name];
    for (const row of groupedData)  delete row[name];
    for (const row of currentData)  delete row[name];
    for (const row of filteredData) delete row[name];

    // Strip from tracking arrays / map
    categoryMap["Custom"] = categoryMap["Custom"].filter(c => c !== name);
    allColumns = allColumns.filter(c => c !== name);

    // Remove datalist if it exists
    const dl = document.getElementById(`dl_${name.replace(/[^a-zA-Z0-9]/g, '_')}`);
    if (dl) dl.remove();

    // Remove checkbox row from UI
    document.querySelectorAll(`.custom-col-row[data-custom-col="${name}"]`).forEach(el => el.remove());

    // Update category header state
    document.querySelectorAll('.category').forEach(div => {
        const label = div.querySelector('.category-header span');
        if (label && label.textContent === "Custom") {
            const catCheck = div.querySelector('.category-header input[type="checkbox"]');
            updateCategoryHeaderState(div, catCheck);
        }
    });

    // Rebuild filter column dropdowns and re-render
    populateFilterColumns();
    populateMetricSelect();
    refreshTableFromUI();
}

// --------------------------------------------------------------
// 10. COMPUTED COLUMN LOGIC
// --------------------------------------------------------------
function addComputedColumn() {
    const nameInput = document.getElementById("compName");
    const formulaInput = document.getElementById("compFormula");
    const conditionInput = document.getElementById("compCondition");
    const name = nameInput.value.trim();
    const formula = formulaInput.value.trim();
    const condition = conditionInput.value.trim();

    if (!name) { alert("Please enter a column name."); return; }
    if (!formula) { alert("Please enter a formula."); return; }
    if (allColumns.includes(name)) { alert(`Column "${name}" already exists.`); return; }

    // Build function from formula – use `with` so column names resolve
    const colNames = allColumns;
    let fn;
    try {
        fn = new Function('row', `with(row){return (${formula});}`);
    } catch (e) {
        alert(`Invalid formula: ${e.message}`); return;
    }
    let condFn = null;
    if (condition) {
        try {
            condFn = new Function('row', `with(row){return (${condition});}`);
        } catch (e) {
            alert(`Invalid condition: ${e.message}`); return;
        }
    }

    let count = 0;
    for (let row of currentData) {
        let shouldCompute = true;
        if (condFn) {
            try { shouldCompute = !!condFn(row); } catch(e) { shouldCompute = false; }
        }
        if (shouldCompute) {
            try {
                let result = fn(row);
                if (typeof result === 'number' && !isFinite(result)) result = null;
                row[name] = result;
                count++;
            } catch(e) { row[name] = null; }
        } else {
            row[name] = null;
        }
    }

    if (!categoryMap["Custom"]) categoryMap["Custom"] = [];
    categoryMap["Custom"].push(name);
    allColumns.push(name);

    // Add checkbox + remove button to Custom category
    document.querySelectorAll('.category').forEach(div => {
        const label = div.querySelector('.category-header span');
        if (label && label.textContent === "Custom") {
            const subDiv = div.querySelector('.sub-checkboxes');
            addCustomColumnCheckbox(subDiv, div, name);
        }
    });

    populateFilterColumns();
    refreshTableFromUI();
    nameInput.value = ""; formulaInput.value = ""; conditionInput.value = "";
    alert(`Added column "${name}" for ${count} rows.`);
}

// --------------------------------------------------------------
// 11. INITIALISE EVENTS
// --------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    loadData();

    document.getElementById("groupByPlayerBtn").addEventListener("click", groupByPlayer);
    document.getElementById("resetDataBtn").addEventListener("click", resetToRaw);
    document.getElementById("exportCsvBtn").addEventListener("click", exportVisibleCSV);
    document.getElementById("toggleChartBtn").addEventListener("click", toggleChartVisibility);
    document.getElementById("closeChartBtn")?.addEventListener("click", () => {
        document.getElementById('chartSection').style.display = 'none';
    });

    document.getElementById("applyFiltersBtn").addEventListener("click", applyFilters);
    document.getElementById("clearFiltersBtn").addEventListener("click", clearFilters);
    addFilterRow();

    document.getElementById("pageSizeSelect").addEventListener("change", (e) => setPageSize(e.target.value));

    document.getElementById("chartTypeSelect").addEventListener("change", (e) => {
        const isScatter = e.target.value === 'scatter';
        document.getElementById("chartMetricX").style.display = isScatter ? 'inline-block' : 'none';
        document.getElementById("showMeanX").parentElement.style.display = isScatter ? 'inline-flex' : 'none';
        document.getElementById("showLinReg").parentElement.style.display = isScatter ? 'inline-flex' : 'none';
    });

    document.getElementById("drawChartBtn").addEventListener("click", drawChartFromCurrentData);
    document.getElementById("addCompColBtn").addEventListener("click", addComputedColumn);
    ["compName","compFormula","compCondition"].forEach(id => {
        document.getElementById(id).addEventListener("keydown", (e) => { if (e.key === "Enter") addComputedColumn(); });
    });
});
