import { el, formatSpeed, getUnitLabel, currentUnit } from './utils.js';
import { fetchHistory } from './data_sync.js';

// --- ZMIENNE PAGINACJI I SORTOWANIA ---
let currentPage = 1;
let itemsPerPage = 10;
let totalItems = 0;
let sortBy = 'date';
let sortOrder = 'desc';

// --- RENDEROWANIE TABELI ---
function renderHistoryTable(data) {
    const tbody = el('history-table').querySelector('tbody');
    tbody.innerHTML = '';
    
    data.forEach(row => {
        const tr = `<tr>
            <td>${row.date.split(' ')[0]}<br><small>${row.date.split(' ')[1]}</small></td>
            <td>${row.ping.toFixed(1)} ms</td>
            <td>${formatSpeed(row.download)} ${getUnitLabel()}</td>
            <td>${formatSpeed(row.upload)} ${getUnitLabel()}</td>
        </tr>`;
        tbody.innerHTML += tr;
    });
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
}

// --- Aktualizacja kafelków statystyk po zmianie jednostki (np. z main.js) ---
export function updateStatTiles(downMbps, upMbps) {
    if(downMbps > 0) el('down-val').textContent = formatSpeed(downMbps);
    if(upMbps > 0) el('up-val').textContent = formatSpeed(upMbps);
}