import { el, formatSpeed, getUnitLabel, log, lang, currentUnit } from './utils.js';
import { fetchHistory, deleteItems } from './data_sync.js';
import { translations } from './config.js';

let currentPage = 1;
let itemsPerPage = 10;
let totalItems = 0;
let sortBy = 'date';
let sortOrder = 'desc';

let selectedIds = new Set();
let currentData = []; 

function renderHistoryTable(data) {
    currentData = data;
    const tbody = el('history-table').querySelector('tbody');
    tbody.innerHTML = '';
    
    // Resetuj oba checkboxy główne (desktop i mobile)
    const masterCheckbox = el('select-all-checkbox');
    const mobileMasterCheckbox = el('mobile-select-all-checkbox');
    
    if(masterCheckbox) { masterCheckbox.checked = false; masterCheckbox.indeterminate = false; }
    if(mobileMasterCheckbox) { mobileMasterCheckbox.checked = false; }

    // FIX: Pobieramy aktualne tłumaczenia, aby wstawić je przy renderowaniu
    const tPing = (translations[lang] && translations[lang]['table_ping']) || 'Ping';
    const tDown = (translations[lang] && translations[lang]['table_down']) || 'Download';
    const tUp = (translations[lang] && translations[lang]['table_up']) || 'Upload';

    data.forEach(row => {
        const isSelected = selectedIds.has(row.id);
        const tr = document.createElement('tr');
        if (isSelected) tr.classList.add('selected');

        let modeIcon = 'hub'; 
        let modeKey = 'mode_multi';
        let modeTitle = translations[lang]['mode_multi'] || 'Multi'; 
        
        const rowMode = row.mode || 'Multi'; 
        
        if (rowMode === 'Single') {
            modeIcon = 'device_hub';
            modeKey = 'mode_single';
            modeTitle = translations[lang]['mode_single'] || 'Single';
        }

        // ZMIANA: Wstawiamy przetłumaczone etykiety do <span>
        tr.innerHTML = `
            <td class="checkbox-col">
                <input type="checkbox" class="row-checkbox" data-id="${row.id}" ${isSelected ? 'checked' : ''}>
            </td>
            <td>${row.date.split(' ')[0]}<br><small>${row.date.split(' ')[1]}</small></td>
            
            <td>
                <div class="mode-cell">
                    <span class="material-icons">${modeIcon}</span>
                    <span data-key="${modeKey}">${modeTitle}</span>
                </div>
            </td>

            <td>
                <span class="mobile-label" data-key="table_ping">${tPing}</span>
                <span class="history-value">${row.ping.toFixed(1)}</span><span class="mobile-unit">ms</span>
            </td>
            
            <td>
                <span class="mobile-label" data-key="table_down">${tDown}</span>
                <span class="history-value">${formatSpeed(row.download)}</span><span class="mobile-unit">${getUnitLabel()}</span>
            </td>
            <td>
                <span class="mobile-label" data-key="table_up">${tUp}</span>
                <span class="history-value">${formatSpeed(row.upload)}</span><span class="mobile-unit">${getUnitLabel()}</span>
            </td>
        `;
        
        const checkbox = tr.querySelector('.row-checkbox');
        checkbox.addEventListener('change', (e) => {
            toggleSelection(row.id, e.target.checked);
        });

        tbody.appendChild(tr);
    });
    
    updateDeleteButton();
    updateMasterCheckboxState();
}

function toggleSelection(id, isChecked) {
    if (isChecked) {
        selectedIds.add(id);
    } else {
        selectedIds.delete(id);
    }
    
    const checkbox = document.querySelector(`.row-checkbox[data-id="${id}"]`);
    if (checkbox) {
        checkbox.checked = isChecked; 
        const tr = checkbox.closest('tr');
        if (isChecked) tr.classList.add('selected');
        else tr.classList.remove('selected');
    }

    updateDeleteButton();
    updateMasterCheckboxState();
}

function updateDeleteButton() {
    const btn = el('delete-selected-btn');
    const countSpan = el('selected-count');
    
    if (selectedIds.size > 0) {
        btn.classList.remove('hidden');
        countSpan.innerText = `(${selectedIds.size})`;
    } else {
        btn.classList.add('hidden');
    }
}

function updateMasterCheckboxState() {
    const masterCheckbox = el('select-all-checkbox');
    const mobileMasterCheckbox = el('mobile-select-all-checkbox');
    
    if (currentData.length === 0) {
        if(masterCheckbox) { masterCheckbox.checked = false; masterCheckbox.indeterminate = false; }
        if(mobileMasterCheckbox) { mobileMasterCheckbox.checked = false; }
        return;
    }

    const allSelected = currentData.every(row => selectedIds.has(row.id));
    const someSelected = currentData.some(row => selectedIds.has(row.id));

    if(masterCheckbox) {
        if (allSelected) {
            masterCheckbox.checked = true;
            masterCheckbox.indeterminate = false;
        } else if (someSelected) {
            masterCheckbox.checked = false;
            masterCheckbox.indeterminate = true;
        } else {
            masterCheckbox.checked = false;
            masterCheckbox.indeterminate = false;
        }
    }

    if(mobileMasterCheckbox) {
        mobileMasterCheckbox.checked = allSelected;
    }
}

function toggleSelectAll(isChecked) {
    currentData.forEach(row => {
        if (isChecked) selectedIds.add(row.id);
        else selectedIds.delete(row.id);
    });
    
    document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.checked = isChecked;
        const tr = cb.closest('tr');
        if (isChecked) tr.classList.add('selected');
        else tr.classList.remove('selected');
    });

    updateDeleteButton();
    updateMasterCheckboxState(); 
}

function showDeleteModal() {
    const modal = el('delete-modal');
    modal.classList.remove('hidden');
}

function hideDeleteModal() {
    const modal = el('delete-modal');
    modal.classList.add('hidden');
}

async function executeDelete() {
    if (selectedIds.size === 0) return;

    const idsToDelete = Array.from(selectedIds);
    hideDeleteModal();
    
    const success = await deleteItems(idsToDelete);
    if (success) {
        selectedIds.clear();
        updateDeleteButton();
        loadHistory(currentPage); 
        log(translations[lang].msg_deleted || "Usunięto wpisy.");
    }
}

function updatePaginationControls() {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const displayPage = totalItems > 0 ? currentPage : 1;
    const displayTotal = totalItems > 0 ? totalPages : 1;
    el('page-info').innerText = `${displayPage} / ${displayTotal}`;
    el('prev-page').disabled = currentPage <= 1;
    el('next-page').disabled = currentPage >= totalPages;
}

function updateSortIcons() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sort-active');
        const icon = th.querySelector('.sort-icon');
        
        if (th.getAttribute('data-sort') === sortBy) {
            th.classList.add('sort-active');
            icon.innerText = sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward';
        } else {
            icon.innerText = 'unfold_more';
        }
    });
}

export async function loadHistory(page = currentPage, sort_by = sortBy, order = sortOrder) {
    currentPage = page;
    sortBy = sort_by;
    sortOrder = order;

    const responseData = await fetchHistory(currentPage, itemsPerPage, sortBy, sortOrder);
    
    const data = responseData.data; 
    totalItems = responseData.total;
    
    renderHistoryTable(data);
    updatePaginationControls();
    updateSortIcons();
}

export function initHistoryEvents() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.onclick = () => {
            const column = th.getAttribute('data-sort');
            if (sortBy === column) {
                sortOrder = (sortOrder === 'asc') ? 'desc' : 'asc';
            } else {
                sortBy = column;
                sortOrder = 'desc';
            }
            loadHistory(1, sortBy, sortOrder); 
        };
    });

    el('prev-page').onclick = () => { if (currentPage > 1) { loadHistory(currentPage - 1); } };
    el('next-page').onclick = () => { if (currentPage < Math.ceil(totalItems / itemsPerPage)) { loadHistory(currentPage + 1); } };
    
    el('rows-per-page').onchange = (e) => { 
        itemsPerPage = parseInt(e.target.value); 
        loadHistory(1); 
    };

    const masterCheckbox = el('select-all-checkbox');
    if(masterCheckbox) {
        masterCheckbox.onchange = (e) => {
            toggleSelectAll(e.target.checked);
        };
    }

    const mobileCheckbox = el('mobile-select-all-checkbox');
    if(mobileCheckbox) {
        mobileCheckbox.onchange = (e) => {
            toggleSelectAll(e.target.checked);
        };
    }

    el('delete-selected-btn').onclick = showDeleteModal;

    el('export-csv-btn').onclick = () => {
        const t = translations[lang];
        const params = new URLSearchParams({
            unit: currentUnit,
            h_date: t.table_date,
            h_mode: t.table_mode || 'Mode',
            h_ping: t.table_ping,
            h_down: t.table_down, 
            h_up: t.table_up
        });
        window.location.href = `/api/history/export?${params.toString()}`;
    };

    el('modal-cancel-btn').onclick = hideDeleteModal;
    el('modal-confirm-btn').onclick = executeDelete;
    
    el('delete-modal').onclick = (e) => {
        if (e.target.id === 'delete-modal') hideDeleteModal();
    };
}

export function updateStatTiles(downMbps, upMbps) {
    if(downMbps > 0) el('down-val').textContent = formatSpeed(downMbps);
    if(upMbps > 0) el('up-val').textContent = formatSpeed(upMbps);
}