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
    "Custom": []  // will hold user‑created columns
};

// Build a flat list of all known columns (including custom later)
let allColumns = Object.values(categoryMap).flat();

// --------------------------------------------------------------
// 2. GLOBAL STATE
// --------------------------------------------------------------
let fullRawData = [];
let currentData = [];          // data after filters/grouping + computed columns
let filteredData = [];
let isGrouped = false;
let groupedData = [];
let tableInstance = null;
let chartInstance = null;
let activeFilters = [];
let currentPageSize = 50;

// Store custom column definitions so we can reapply them after filter/group
let customColumnDefinitions = [];

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
            applyCustomColumns(currentData);   // if any custom columns were defined before load (none initially)
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
// 4. BUILD CATEGORY UI – DEFAULT UNCHECKED (except Player)
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
        // Start General expanded
        subDiv.style.display = (category === "General") ? "block" : "none";
        toggleBtn.textContent = (category === "General") ? "▲" : "▼";
        cols.forEach(col => {
            const label = document.createElement("label");
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.dataset.col = col;
            // Default checked: only a few key columns
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
    const checked = Array.from(subBoxes).filter(cb => cb.checked);
    catCheck.checked = (checked.length === subBoxes.length);
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
// 5. RENDER TABLE – array-of-arrays with numeric sorting
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
    if (!visibleColumns) visibleColumns = getSelectedColumns();

    // Convert data (array of objects) to array of arrays in the correct column order
    const rows = data.map(row => {
        return visibleColumns.map(col => {
            let val = row[col];
            if (val === undefined || val === null) return "";
            return val;   // keep raw value (number or string) for sorting
        });
    });

    // Build column definitions with custom sort functions
    const columnDefs = visibleColumns.map((col, idx) => ({
        name: col,
        sort: {
            compare: (a, b) => {
                // a and b are the cell values for this column (from two rows)
                const numA = parseFloat(a);
                const numB = parseFloat(b);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return numA - numB;   // numeric sort
                }
                // fallback to string comparison
                return String(a).localeCompare(String(b));
            }
        }
    }));

    // Pagination
    let limit = currentPageSize;
    let pagination = { enabled: true, limit: 25, summary: true };
    if (limit === -1) {
        pagination = { enabled: false };
    } else {
        pagination = { enabled: true, limit: limit, summary: true };
    }

    tableInstance = new gridjs.Grid({
        columns: columnDefs,       // with sort functions
        data: rows,                // array of arrays
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
// 6. FILTER LOGIC – with autofill for Team/Pos
// --------------------------------------------------------------
function populateFilterColumns() {
    const selects = document.querySelectorAll('.filter-column');
    selects.forEach(sel => {
        if (sel.options.length > 1) return;
        sel.innerHTML = '<option value="">-- Column --</option>';
        allColumns.forEach(col => {
            const opt = document.createElement('option');
            opt.value = col;
            opt.textContent = col;
            sel.appendChild(opt);
        });
        sel.addEventListener('change', function() {
            const row = this.closest('.filter-row');
            const colName = this.value;
            const input = row.querySelector('.filter-value');
            if (colName === 'Team' || colName === 'Pos') {
                // Build unique values
                const values = new Set();
                fullRawData.forEach(rowData => {
                    const val = rowData[colName];
                    if (val !== undefined && val !== null && val !== '') {
                        values.add(val);
                    }
                });
                if (input.tagName === 'SELECT') {
                    const selEl = input;
                    selEl.innerHTML = '<option value="">-- Select --</option>';
                    values.forEach(v => {
                        const opt = document.createElement('option');
                        opt.value = v;
                        opt.textContent = v;
                        selEl.appendChild(opt);
                    });
                } else {
                    const select = document.createElement('select');
                    select.className = 'filter-value';
                    select.innerHTML = '<option value="">-- Select --</option>';
                    values.forEach(v => {
                        const opt = document.createElement('option');
                        opt.value = v;
                        opt.textContent = v;
                        select.appendChild(opt);
                    });
                    input.parentNode.replaceChild(select, input);
                }
            } else {
                const existingSelect = row.querySelector('.filter-value');
                if (existingSelect && existingSelect.tagName === 'SELECT') {
                    const input = document.createElement('input');
                    input.className = 'filter-value';
                    input.type = 'text';
                    input.placeholder = 'Value';
                    input.value = existingSelect.value;
                    existingSelect.parentNode.replaceChild(input, existingSelect);
                }
            }
        });
    });
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

    // Attach change listener for categorical autofill
    colSelect.addEventListener('change', function() {
        const colName = this.value;
        const input = row.querySelector('.filter-value');
        if (colName === 'Team' || colName === 'Pos') {
            const values = new Set();
            fullRawData.forEach(rowData => {
                const val = rowData[colName];
                if (val !== undefined && val !== null && val !== '') {
                    values.add(val);
                }
            });
            if (input.tagName === 'SELECT') {
                const sel = input;
                sel.innerHTML = '<option value="">-- Select --</option>';
                values.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v;
                    opt.textContent = v;
                    sel.appendChild(opt);
                });
            } else {
                const select = document.createElement('select');
                select.className = 'filter-value';
                select.innerHTML = '<option value="">-- Select --</option>';
                values.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v;
                    opt.textContent = v;
                    select.appendChild(opt);
                });
                input.parentNode.replaceChild(select, input);
            }
        } else {
            const existingSelect = row.querySelector('.filter-value');
            if (existingSelect && existingSelect.tagName === 'SELECT') {
                const input = document.createElement('input');
                input.className = 'filter-value';
                input.type = 'text';
                input.placeholder = 'Value';
                input.value = existingSelect.value;
                existingSelect.parentNode.replaceChild(input, existingSelect);
            }
        }
    });

    if (column === 'Team' || column === 'Pos') {
        colSelect.dispatchEvent(new Event('change'));
    }

    populateFilterColumns();
    updateFilterStatus();
}

function getFilterConfigs() {
    const configs = [];
    document.querySelectorAll('.filter-row').forEach(row => {
        const col = row.querySelector('.filter-column')?.value;
        const op = row.querySelector('.filter-operator')?.value;
        const valEl = row.querySelector('.filter-value');
        let val = valEl ? (valEl.value || '').trim() : '';
        const val2 = row.querySelector('.filter-value2')?.value?.trim() || '';
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
                case '=': ok = (String(cell).toLowerCase() === String(val).toLowerCase()); break;
                case '!=': ok = (String(cell).toLowerCase() !== String(val).toLowerCase()); break;
                case '>': ok = (parseFloat(cell) > parseFloat(val)); break;
                case '<': ok = (parseFloat(cell) < parseFloat(val)); break;
                case '>=': ok = (parseFloat(cell) >= parseFloat(val)); break;
                case '<=': ok = (parseFloat(cell) <= parseFloat(val)); break;
                case 'contains': ok = String(cell).toLowerCase().includes(String(val).toLowerCase()); break;
                case 'between':
                    if (val2 !== '') ok = (parseFloat(cell) >= parseFloat(val) && parseFloat(cell) <= parseFloat(val2));
                    else ok = false;
                    break;
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
    applyCustomColumns(currentData);
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
            const valEl = row.querySelector('.filter-value');
            if (valEl) {
                if (valEl.tagName === 'SELECT') {
                    valEl.innerHTML = '<option value="">-- Select --</option>';
                } else {
                    valEl.value = '';
                }
            }
            const val2 = row.querySelector('.filter-value2');
            if (val2) { val2.value = ''; val2.style.display = 'none'; }
        }
    });
    activeFilters = [];
    const baseData = isGrouped ? groupedData : fullRawData;
    filteredData = [...baseData];
    currentData = filteredData;
    applyCustomColumns(currentData);
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
// 7. GROUPING, RESET, EXPORT – with custom column reapplication
// --------------------------------------------------------------
function groupByPlayer() {
    if (!fullRawData.length) return;
    const baseData = fullRawData;
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
    filteredData = applyFiltersToData(groupedData, activeFilters);
    currentData = filteredData;
    applyCustomColumns(currentData);
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
    applyCustomColumns(currentData);
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
// 9. CHART (unchanged)
// --------------------------------------------------------------
function toggleChartVisibility() {
    const section = document.getElementById('chartSection');
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
}

function populateMetricSelect() {
    const select = document.getElementById("chartMetricSelect");
    const selectX = document.getElementById("chartMetricX");
    if (!select) return;
    const emptyY = '<option value="">-- Y Axis stat --</option>';
    const emptyX = '<option value="">-- X Axis stat (optional label) --</option>';
    select.innerHTML = emptyY;
    if (selectX) selectX.innerHTML = emptyX;
    if (!currentData.length) return;
    const sample = currentData[0];
    for (let key in sample) {
        if (typeof sample[key] === "number") {
            const optY = document.createElement("option");
            optY.value = key; optY.textContent = key;
            select.appendChild(optY);
            if (selectX) {
                const optX = document.createElement("option");
                optX.value = key; optX.textContent = key;
                selectX.appendChild(optX);
            }
        }
    }
}

function drawChartFromCurrentData() {
    const metricY = document.getElementById("chartMetricSelect").value;
    const metricX = document.getElementById("chartMetricX")?.value;
    const chartType = document.getElementById("chartTypeSelect").value;
    if (!metricY) { alert("Please select a Y Axis stat."); return; }
    if (!currentData.length) { alert("No data available."); return; }
    if (chartType === 'scatter' && !metricX) {
        alert("Scatter plot needs an X Axis stat too. Please select one."); return;
    }
    const labels = [], valuesY = [], valuesX = [];
    for (let row of currentData) {
        const y = row[metricY];
        if (typeof y !== "number" || isNaN(y)) continue;
        if (chartType === 'scatter') {
            const x = row[metricX];
            if (typeof x !== "number" || isNaN(x)) continue;
            valuesX.push(x);
        }
        labels.push(row.Player || "Unknown");
        valuesY.push(y);
    }
    if (labels.length === 0) { alert("No valid numeric data."); return; }
    let finalLabels = labels, finalY = valuesY, finalX = valuesX;
    if (chartType === 'radar' && labels.length > 10) {
        const indexed = valuesY.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, 10);
        finalLabels = indexed.map(o => labels[o.i]);
        finalY = indexed.map(o => o.v);
    }
    document.getElementById('chartSection').style.display = 'block';
    const ctx = document.getElementById("statsChart").getContext("2d");
    if (chartInstance) chartInstance.destroy();
    const baseColor = 'rgba(30, 70, 110, 0.6)';
    const borderColor = '#1e466e';
    let config;
    if (chartType === 'scatter') {
        const scatterData = valuesY.map((y, i) => ({ x: valuesX[i], y }));
        config = {
            type: 'scatter',
            data: {
                datasets: [{
                    label: `${metricX} vs ${metricY}`,
                    data: scatterData,
                    backgroundColor: baseColor,
                    borderColor: borderColor,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const idx = ctx.dataIndex;
                                return `${labels[idx]}: (${ctx.raw.x.toLocaleString()}, ${ctx.raw.y.toLocaleString()})`;
                            }
                        }
                    },
                    legend: { position: 'top' }
                },
                scales: {
                    x: { title: { display: true, text: metricX } },
                    y: { beginAtZero: false, title: { display: true, text: metricY } }
                }
            }
        };
    } else if (chartType === 'radar') {
        config = {
            type: 'radar',
            data: {
                labels: finalLabels,
                datasets: [{
                    label: metricY,
                    data: finalY,
                    backgroundColor: 'rgba(30, 70, 110, 0.25)',
                    borderColor: borderColor,
                    borderWidth: 2,
                    pointBackgroundColor: borderColor
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { position: 'top' } },
                scales: { r: { beginAtZero: true } }
            }
        };
    } else {
        config = {
            type: chartType,
            data: {
                labels: finalLabels,
                datasets: [{
                    label: metricY,
                    data: finalY,
                    backgroundColor: baseColor,
                    borderColor: borderColor,
                    borderWidth: chartType === 'line' ? 2 : 1,
                    fill: chartType === 'line' ? false : undefined,
                    tension: chartType === 'line' ? 0.3 : undefined,
                    pointRadius: chartType === 'line' ? 3 : undefined
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { callbacks: { label: (ctx) => ctx.raw.toLocaleString() } }
                },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: metricY } },
                    x: { ticks: { autoSkip: true, maxTicksLimit: 30 } }
                }
            }
        };
    }
    chartInstance = new Chart(ctx, config);
}

// --------------------------------------------------------------
// 10. COMPUTED COLUMN LOGIC – store definitions and reapply
// --------------------------------------------------------------
function applyCustomColumns(data) {
    if (!customColumnDefinitions.length) return;
    for (let row of data) {
        for (let def of customColumnDefinitions) {
            const { name, formula, condition } = def;
            let shouldCompute = true;
            if (condition) {
                try {
                    const condFn = new Function('row', `return (${condition});`);
                    shouldCompute = !!condFn(row);
                } catch (e) {
                    shouldCompute = false;
                }
            }
            if (shouldCompute) {
                try {
                    const fn = new Function('row', `return (${formula});`);
                    let result = fn(row);
                    if (typeof result === 'number' && !isFinite(result)) {
                        result = null;
                    }
                    row[name] = result;
                } catch (e) {
                    row[name] = null;
                }
            } else {
                row[name] = null;
            }
        }
    }
}

function addComputedColumn() {
    const nameInput = document.getElementById("compName");
    const formulaInput = document.getElementById("compFormula");
    const conditionInput = document.getElementById("compCondition");
    const name = nameInput.value.trim();
    const formula = formulaInput.value.trim();
    const condition = conditionInput.value.trim();

    if (!name) { alert("Please enter a column name."); return; }
    if (!formula) { alert("Please enter a formula (e.g., Rush.Yds / GP)."); return; }
    if (allColumns.includes(name)) {
        alert(`Column "${name}" already exists. Please choose another name.`);
        return;
    }

    // Validate with a test row
    let testRow = fullRawData[0] || {};
    try {
        const fn = new Function('row', `return (${formula});`);
        fn(testRow);
    } catch (e) {
        alert(`Invalid formula: ${e.message}`);
        return;
    }
    if (condition) {
        try {
            const condFn = new Function('row', `return (${condition});`);
            condFn(testRow);
        } catch (e) {
            alert(`Invalid condition: ${e.message}`);
            return;
        }
    }

    // Store definition
    const def = { name, formula, condition };
    customColumnDefinitions.push(def);

    // Add to categoryMap and allColumns
    if (!categoryMap["Custom"]) categoryMap["Custom"] = [];
    categoryMap["Custom"].push(name);
    allColumns.push(name);

    // Add checkbox to UI (append to Custom category)
    let customCatDiv = null;
    document.querySelectorAll('.category').forEach(div => {
        const label = div.querySelector('.category-header span');
        if (label && label.textContent === "Custom") {
            customCatDiv = div;
        }
    });
    if (customCatDiv) {
        const subDiv = customCatDiv.querySelector('.sub-checkboxes');
        const labelEl = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.dataset.col = name;
        cb.checked = true;
        cb.addEventListener("change", () => refreshTableFromUI());
        labelEl.appendChild(cb);
        labelEl.appendChild(document.createTextNode(` ${name}`));
        subDiv.appendChild(labelEl);
        const catCheck = customCatDiv.querySelector('.category-header input[type="checkbox"]');
        updateCategoryHeaderState(customCatDiv, catCheck);
    } else {
        // Rebuild UI if Custom category missing
        buildCategoryUI();
    }

    populateFilterColumns();

    // Apply to current data and re-render
    applyCustomColumns(currentData);
    refreshTableFromUI();

    // Clear inputs
    nameInput.value = "";
    formulaInput.value = "";
    conditionInput.value = "";

    alert(`Added column "${name}" for ${currentData.length} rows.`);
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

    document.getElementById("pageSizeSelect").addEventListener("change", (e) => {
        setPageSize(e.target.value);
    });

    document.getElementById("chartTypeSelect").addEventListener("change", (e) => {
        const xSel = document.getElementById("chartMetricX");
        if (xSel) xSel.style.display = e.target.value === 'scatter' ? 'inline-block' : 'none';
    });

    document.getElementById("drawChartBtn").addEventListener("click", drawChartFromCurrentData);

    document.getElementById("addCompColBtn").addEventListener("click", addComputedColumn);
    document.getElementById("compName").addEventListener("keydown", (e) => { if (e.key === "Enter") addComputedColumn(); });
    document.getElementById("compFormula").addEventListener("keydown", (e) => { if (e.key === "Enter") addComputedColumn(); });
    document.getElementById("compCondition").addEventListener("keydown", (e) => { if (e.key === "Enter") addComputedColumn(); });
});
