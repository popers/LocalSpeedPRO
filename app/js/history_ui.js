import { el, formatSpeed, getUnitLabel, log, lang, currentUnit } from './utils.js';
import { fetchHistory, deleteItems } from './data_sync.js';
import { translations } from './config.js';

// --- ZMIENNE PAGINACJI I SORTOWANIA ---
let currentPage = 1;
let itemsPerPage = 10;
let totalItems = 0;
let sortBy = 'date';
let sortOrder = 'desc';

// --- ZMIENNE DO ZAZNACZANIA ---
let selectedIds = new Set();
let currentData = []; // Przechowuje aktualnie wyświetlane dane

// --- RENDEROWANIE TABELI ---
function renderHistoryTable(data) {
    currentData = data;
    const tbody = el('history-table').querySelector('tbody');
    tbody.innerHTML = '';
    
    // Resetuj główny checkbox przy zmianie strony/danych
    const masterCheckbox = el('select-all-checkbox');
    masterCheckbox.checked = false;
    masterCheckbox.indeterminate = false;

    data.forEach(row => {
        const isSelected = selectedIds.has(row.id);
        const tr = document.createElement('tr');
        if (isSelected) tr.classList.add('selected');

        tr.innerHTML = `
            <td class="checkbox-col">
                <input type="checkbox" class="row-checkbox" data-id="${row.id}" ${isSelected ? 'checked' : ''}>
            </td>
            <td>${row.date.split(' ')[0]}<br><small>${row.date.split(' ')[1]}</small></td>
            <td>${row.ping.toFixed(1)} ms</td>
            <td>${formatSpeed(row.download)} ${getUnitLabel()}</td>
            <td>${formatSpeed(row.upload)} ${getUnitLabel()}</td>
        `;
        
        // Event listener dla checkboxa w wierszu
        const checkbox = tr.querySelector('.row-checkbox');
        checkbox.addEventListener('change', (e) => {
            toggleSelection(row.id, e.target.checked);
        });

        tbody.appendChild(tr);
    });
    
    updateDeleteButton();
    updateMasterCheckboxState();
}

// --- LOGIKA ZAZNACZANIA ---

function toggleSelection(id, isChecked) {
    if (isChecked) {
        selectedIds.add(id);
    } else {
        selectedIds.delete(id);
    }
    
    // Zaktualizuj styl wiersza
    const checkbox = document.querySelector(`.row-checkbox[data-id="${id}"]`);
    if (checkbox) {
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
    if (currentData.length === 0) {
        masterCheckbox.checked = false;
        masterCheckbox.indeterminate = false;
        return;
    }

    const allSelected = currentData.every(row => selectedIds.has(row.id));
    const someSelected = currentData.some(row => selectedIds.has(row.id));

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

function toggleSelectAll(isChecked) {
    currentData.forEach(row => {
        if (isChecked) selectedIds.add(row.id);
        else selectedIds.delete(row.id);
    });
    
    // Przerysuj tylko checkboxy, nie całą tabelę, żeby było szybciej
    document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.checked = isChecked;
        const tr = cb.closest('tr');
        if (isChecked) tr.classList.add('selected');
        else tr.classList.remove('selected');
    });

    updateDeleteButton();
}

// --- OBSŁUGA USUWANIA (MODAL I API) ---

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
        loadHistory(currentPage); // Odśwież tabelę
        log(translations[lang].msg_deleted || "Usunięto wpisy.");
    }
}


// --- AKTUALIZACJA KONTROLEK PAGINACJI ---
function updatePaginationControls() {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const displayPage = totalItems > 0 ? currentPage : 1;
    const displayTotal = totalItems > 0 ? totalPages : 1;
    el('page-info').innerText = `${displayPage} / ${displayTotal}`;
    el('prev-page').disabled = currentPage <= 1;
    el('next-page').disabled = currentPage >= totalPages;
}

// --- AKTUALIZACJA IKON SORTOWANIA ---
function updateSortIcons() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc'); 
        const icon = th.querySelector('.sort-icon');
        icon.innerText = 'unfold_more';
        
        if (th.getAttribute('data-sort') === sortBy) {
            th.classList.add(sortOrder === 'asc' ? 'sort-asc' : 'sort-desc');
            icon.innerText = sortOrder === 'asc' ? 'expand_less' : 'expand_more';
        }
    });
}

// --- GŁÓWNA FUNKCJA ŁADOWANIA HISTORII ---
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

// --- USTAWIENIE OBSŁUGI ZDARZEŃ ---
export function initHistoryEvents() {
    // Sortowanie
    document.querySelectorAll('th.sortable').forEach(th => {
        th.onclick = () => {
            const column = th.getAttribute('data-sort');
            
            if (sortBy === column) {
                sortOrder = (sortOrder === 'asc') ? 'desc' : 'asc';
            } else {
                sortBy = column;
                sortOrder = 'desc';
            }
            loadHistory(1, sortBy, sortOrder); // Zawsze wracaj na 1 stronę po zmianie sortowania
        };
    });

    // Paginacja
    el('prev-page').onclick = () => { if (currentPage > 1) { loadHistory(currentPage - 1); } };
    el('next-page').onclick = () => { if (currentPage < Math.ceil(totalItems / itemsPerPage)) { loadHistory(currentPage + 1); } };
    
    // Zmiana limitu
    el('rows-per-page').onchange = (e) => { 
        itemsPerPage = parseInt(e.target.value); 
        loadHistory(1); // Zawsze wracaj na 1 stronę po zmianie limitu
    };

    // Checkbox "Zaznacz wszystko"
    el('select-all-checkbox').onchange = (e) => {
        toggleSelectAll(e.target.checked);
    };

    // Przycisk "Usuń zaznaczone"
    el('delete-selected-btn').onclick = showDeleteModal;

    // Przycisk "Eksport CSV"
    el('export-csv-btn').onclick = () => {
        const t = translations[lang];
        // Budujemy URL z parametrami
        const params = new URLSearchParams({
            unit: currentUnit,
            h_date: t.table_date,  // "Data" lub "Date"
            h_ping: t.table_ping,  // "Ping" (dodano tłumaczenie)
            h_down: t.table_down,  // "Pobieranie" lub "Download"
            h_up: t.table_up       // "Wysyłanie" lub "Upload"
        });
        window.location.href = `/api/history/export?${params.toString()}`;
    };

    // Obsługa Modala
    el('modal-cancel-btn').onclick = hideDeleteModal;
    el('modal-confirm-btn').onclick = executeDelete;
    
    // Kliknięcie poza modalem zamyka go
    el('delete-modal').onclick = (e) => {
        if (e.target.id === 'delete-modal') hideDeleteModal();
    };
}

// --- Aktualizacja kafelków statystyk po zmianie jednostki (np. z main.js) ---
export function updateStatTiles(downMbps, upMbps) {
    if(downMbps > 0) el('down-val').textContent = formatSpeed(downMbps);
    if(upMbps > 0) el('up-val').textContent = formatSpeed(upMbps);
}