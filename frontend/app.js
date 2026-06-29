// API Configuration
const API_BASE = 'http://127.0.0.1:8000/api';

// Global Chart Instance Tracker
let usageTrendsChartInstance = null;

// DOM Elements
const inventoryTableBody = document.getElementById('inventory-table-body');
const expiredAlertsContainer = document.getElementById('expired-alerts-container');
const warningAlertsContainer = document.getElementById('warning-alerts-container');
const searchInput = document.getElementById('search-input');

// Navigation Tab Elements
const tabDashboardBtn = document.getElementById('tab-dashboard-btn');
const tabInventoryBtn = document.getElementById('tab-inventory-btn');
const dashboardView = document.getElementById('dashboard-view');
const inventoryView = document.getElementById('inventory-view');
const currentViewLabel = document.getElementById('current-view-label');

// Stat Counters Elements (Inventory View)
const statTotalItems = document.getElementById('stat-total-items');
const statExpired = document.getElementById('stat-expired');
const statNearExpiry = document.getElementById('stat-near-expiry');
const statLowStock = document.getElementById('stat-low-stock');

// Dashboard Summary Card Elements
const dashTotalItems = document.getElementById('dash-total-items');
const dashExpired = document.getElementById('dash-expired');
const dashNearExpiry = document.getElementById('dash-near-expiry');
const dashPreventedLoss = document.getElementById('dash-prevented-loss');

// Modal Elements
const addMedBtn = document.getElementById('add-med-btn');
const addMedModal = document.getElementById('add-med-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelModalBtn = document.getElementById('cancel-modal-btn');
const addMedForm = document.getElementById('add-med-form');

// ============================================================
// UTILITY HELPERS
// ============================================================

// Currency formatter – formats a number into Thai Baht (฿)
function formatBaht(value) {
    const num = Number(value) || 0;
    return '฿' + num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// Date validation helper (force YYYY-MM-DD string parsing correctly across timezones)
function parseLocalDate(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
}

// Calculate remaining days until expiry relative to today
function getDaysToExpiry(expiryDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = parseLocalDate(expiryDateStr);
    expiry.setHours(0, 0, 0, 0);

    const diffTime = expiry - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// ============================================================
// MODAL LOGIC
// ============================================================

// Open / Close Modal Logic
function openModal() {
    addMedModal.classList.remove('opacity-0', 'pointer-events-none');
    addMedModal.querySelector('div').classList.remove('scale-95');
    addMedModal.querySelector('div').classList.add('scale-100');
    // Set default date input value to today for ease of use
    document.getElementById('med-expiry').value = new Date().toISOString().split('T')[0];
}

// Close Modal Logic
function closeModal() {
    addMedModal.classList.add('opacity-0', 'pointer-events-none');
    addMedModal.querySelector('div').classList.remove('scale-100');
    addMedModal.querySelector('div').classList.add('scale-95');
    addMedForm.reset();
}

addMedBtn.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', closeModal);
cancelModalBtn.addEventListener('click', closeModal);

// Close modal if user clicks outside of it
addMedModal.addEventListener('click', (e) => {
    if (e.target === addMedModal) {
        closeModal();
    }
});

// ============================================================
// DASHBOARD SUMMARY
// ============================================================

// Fetch the aggregated dashboard summary from the API and update the 4 dashboard cards
async function fetchDashboardSummary() {
    try {
        const response = await fetch(`${API_BASE}/dashboard-summary`);
        if (!response.ok) throw new Error('Failed to fetch dashboard summary');
        const data = await response.json();

        // Animate values in
        if (dashTotalItems) dashTotalItems.textContent = data.total_items;
        if (dashExpired) dashExpired.textContent = data.critical_alerts;
        if (dashNearExpiry) dashNearExpiry.textContent = data.near_expiry;
        if (dashPreventedLoss) dashPreventedLoss.textContent = formatBaht(data.prevented_loss_value);
    } catch (error) {
        console.error('Error fetching dashboard summary:', error);
        if (dashTotalItems) dashTotalItems.textContent = '—';
        if (dashExpired) dashExpired.textContent = '—';
        if (dashNearExpiry) dashNearExpiry.textContent = '—';
        if (dashPreventedLoss) dashPreventedLoss.textContent = '—';
    }
}

// ============================================================
// ALERTS
// ============================================================

// Fetch and load alerts
async function fetchAlerts() {
    try {
        const response = await fetch(`${API_BASE}/alerts`);
        if (!response.ok) throw new Error('Failed to fetch alerts');
        const data = await response.json();

        renderAlerts(data);

        // Update stats counters
        statExpired.textContent = data.expired.length;
        statNearExpiry.textContent = data.near_expiry.length;
        statLowStock.textContent = data.low_stock.length;
    } catch (error) {
        console.error('Error fetching alerts:', error);
    }
}

// Render alerts inside the notifications panel
function renderAlerts(alerts) {
    // 1. Expired alerts
    expiredAlertsContainer.innerHTML = '';
    if (alerts.expired.length === 0) {
        expiredAlertsContainer.innerHTML = '<div class="text-slate-400 text-sm text-center py-6">No active critical alerts.</div>';
    } else {
        alerts.expired.forEach(med => {
            const card = document.createElement('div');
            card.className = 'flex items-center justify-between p-3.5 bg-red-50 border border-red-100 rounded-xl transition duration-200 hover:bg-red-100/50 shadow-sm';

            const daysAgo = Math.abs(getDaysToExpiry(med.expiry_date));
            const daysLabel = daysAgo === 0 ? "today" : `${daysAgo} day${daysAgo > 1 ? 's' : ''} ago`;

            card.innerHTML = `
                <div>
                    <h3 class="font-semibold text-red-900 text-sm">${med.name}</h3>
                    <p class="text-xs text-red-700/80">Batch: ${med.batch_number} • Qty: ${med.quantity}</p>
                </div>
                <div class="text-right">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-red-100 border border-red-200 text-red-700">
                        Expired ${daysLabel}
                    </span>
                    <p class="text-[10px] text-red-600/70 mt-1">${med.expiry_date}</p>
                </div>
            `;
            expiredAlertsContainer.appendChild(card);
        });
    }

    // 2. Warnings (Low stock + Near expiry)
    warningAlertsContainer.innerHTML = '';
    const warnings = [];

    // Process near expiry
    alerts.near_expiry.forEach(med => {
        const days = getDaysToExpiry(med.expiry_date);
        warnings.push({
            type: 'expiry',
            med: med,
            days: days,
            label: `Expires in ${days} days`
        });
    });

    // Process low stock
    alerts.low_stock.forEach(med => {
        // Avoid duplicate alerts for same item if it's already near expiry (keep it unified)
        const exists = warnings.find(w => w.med.id === med.id);
        if (!exists) {
            warnings.push({
                type: 'stock',
                med: med,
                label: `Low Stock: ${med.quantity} remaining`
            });
        }
    });

    if (warnings.length === 0) {
        warningAlertsContainer.innerHTML = '<div class="text-slate-400 text-sm text-center py-6">No warnings currently active.</div>';
    } else {
        warnings.forEach(warn => {
            const card = document.createElement('div');
            card.className = 'flex items-center justify-between p-3.5 bg-amber-50 border border-amber-100 rounded-xl transition duration-200 hover:bg-amber-100/50 shadow-sm';

            const badgeColor = warn.type === 'expiry' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-orange-100 text-orange-850 border-orange-200';

            card.innerHTML = `
                <div>
                    <h3 class="font-semibold text-amber-900 text-sm">${warn.med.name}</h3>
                    <p class="text-xs text-amber-700/80">Batch: ${warn.med.batch_number} • Qty: ${warn.med.quantity}</p>
                </div>
                <div class="text-right">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${badgeColor} border">
                        ${warn.label}
                    </span>
                    <p class="text-[10px] text-amber-600/70 mt-1">${warn.med.expiry_date}</p>
                </div>
            `;
            warningAlertsContainer.appendChild(card);
        });
    }
}

// ============================================================
// MEDICINES TABLE
// ============================================================

// Fetch and load medicines table
async function fetchMedicines(searchQuery = '') {
    try {
        let url = `${API_BASE}/medicines`;
        if (searchQuery) {
            url += `?search=${encodeURIComponent(searchQuery)}`;
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch medicines');
        const medicines = await response.json();

        renderMedicinesTable(medicines);

        // Update total items stat (only on general list load, not search)
        if (!searchQuery) {
            statTotalItems.textContent = medicines.length;
        }
    } catch (error) {
        console.error('Error fetching medicines:', error);
        inventoryTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-8 text-center text-rose-600">
                    Failed to fetch inventory data. Please verify the backend API server is running on port 8000.
                </td>
            </tr>
        `;
    }
}

// Render medicines table rows
function renderMedicinesTable(medicines) {
    inventoryTableBody.innerHTML = '';

    if (medicines.length === 0) {
        inventoryTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-12 text-center text-slate-400">
                    No medicine inventory records found.
                </td>
            </tr>
        `;
        return;
    }

    medicines.forEach(med => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/80 border-b border-slate-100 transition duration-150';

        const days = getDaysToExpiry(med.expiry_date);
        let statusBadge = '';
        let rowIndicator = '';

        if (days < 0) {
            // Expired
            statusBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 border border-red-200 text-red-700">Expired</span>`;
            rowIndicator = 'border-l-4 border-red-500';
        } else if (days <= 90 || med.quantity < 10) {
            // Low stock or Near Expiry
            statusBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-700">Attention Needed</span>`;
            rowIndicator = 'border-l-4 border-amber-500';
        } else {
            // Stable
            statusBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700">Stable</span>`;
            rowIndicator = 'border-l-4 border-transparent';
        }

        // Format storage location icon/color
        const isRefrig = med.storage_status === 'Refrigerator';
        const isFreezer = med.storage_status === 'Freezer';
        const storageColor = isRefrig ? 'text-cyan-700 bg-cyan-50 border border-cyan-200' : isFreezer ? 'text-blue-700 bg-blue-50 border border-blue-200' : 'text-emerald-700 bg-emerald-50 border border-emerald-200';

        // Low Stock quantity formatting
        const isLowStock = med.quantity < 10;
        const qtyDisplay = isLowStock
            ? `<span class="text-amber-600 font-semibold flex items-center justify-end space-x-1">
                 <i data-lucide="alert-triangle" class="w-3.5 h-3.5 mr-1"></i> ${med.quantity}
               </span>`
            : `<span class="text-slate-700">${med.quantity}</span>`;

        // Format price per unit in Thai Baht
        const priceDisplay = formatBaht(med.price_per_unit);

        tr.innerHTML = `
            <td class="px-6 py-4 font-semibold text-slate-800 ${rowIndicator}">${med.name}</td>
            <td class="px-6 py-4 text-slate-500 font-mono text-xs">${med.batch_number}</td>
            <td class="px-6 py-4 text-right">${qtyDisplay}</td>
            <td class="px-6 py-4 text-right text-slate-700 font-medium">${priceDisplay}</td>
            <td class="px-6 py-4 text-slate-700">
                <div>${med.expiry_date}</div>
                <div class="text-[10px] ${days < 0 ? 'text-red-600' : days <= 90 ? 'text-amber-600' : 'text-slate-400'} font-medium">
                    ${days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days} days left`}
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="px-2.5 py-1 rounded-lg text-xs font-medium ${storageColor}">
                    ${med.storage_status}
                </span>
            </td>
            <td class="px-6 py-4">${statusBadge}</td>
        `;

        inventoryTableBody.appendChild(tr);
    });

    // Trigger Lucide icons on newly created DOM elements
    lucide.createIcons();
}

// ============================================================
// SEARCH
// ============================================================

// Search bar listener (with debounce for keyboard entries)
let debounceTimeout;
searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        fetchMedicines(e.target.value.trim());
    }, 300);
});

// ============================================================
// FORM SUBMISSION
// ============================================================

// Form submission to create a new medicine
addMedForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const pricePerUnit = parseFloat(document.getElementById('med-price').value) || 0.0;

    const newMedicine = {
        name: document.getElementById('med-name').value.trim(),
        batch_number: document.getElementById('med-batch').value.trim(),
        quantity: parseInt(document.getElementById('med-qty').value),
        price_per_unit: pricePerUnit,
        expiry_date: document.getElementById('med-expiry').value,
        storage_status: document.getElementById('med-storage').value
    };

    try {
        const response = await fetch(`${API_BASE}/medicines`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(newMedicine)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || 'Failed to save medicine');
        }

        closeModal();

        // Refresh all views reactively
        await fetchMedicines(searchInput.value.trim());
        await fetchAlerts();
        await fetchDashboardSummary();
        await fetchAndRenderChart();
    } catch (error) {
        console.error('Error adding medicine:', error);
        alert(`Error: ${error.message}`);
    }
});

// ============================================================
// CHART GENERATION
// ============================================================

// Fetch analytics trends and render the line chart
async function fetchAndRenderChart() {
    try {
        const response = await fetch(`${API_BASE}/usage-trends`);
        if (!response.ok) throw new Error('Failed to fetch usage trends');
        const data = await response.json();

        const canvas = document.getElementById('usageTrendsChart');
        if (!canvas) return;

        // Prevent canvas re-use rendering crashes by destroying the previous chart instance
        if (usageTrendsChartInstance) {
            usageTrendsChartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(14, 165, 233, 0.3)'); // Sky Blue/Medical Blue theme
        gradient.addColorStop(1, 'rgba(14, 165, 233, 0.0)');

        usageTrendsChartInstance = new Chart(canvas, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Consumed Volume',
                    data: data.data,
                    borderColor: '#0284c7', // Professional Medical Blue
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointBackgroundColor: '#0284c7',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        titleColor: '#ffffff',
                        bodyColor: '#38bdf8',
                        borderColor: '#cbd5e1',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: '#e2e8f0',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#475569',
                            font: {
                                family: 'Inter',
                                size: 11
                            }
                        }
                    },
                    y: {
                        grid: {
                            color: '#e2e8f0',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#475569',
                            font: {
                                family: 'Inter',
                                size: 11
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error fetching or rendering chart:', error);
    }
}

// ============================================================
// TAB SWITCHER
// ============================================================

// Tab Switcher Logic
function switchTab(activeTab) {
    if (activeTab === 'dashboard') {
        // Toggle view visibility
        dashboardView.classList.remove('hidden');
        inventoryView.classList.add('hidden');

        // Update tab button styles for Light Mode
        tabDashboardBtn.className = 'flex items-center space-x-2 px-4 py-2 text-sm font-semibold bg-white text-sky-600 border border-slate-200 shadow-sm rounded-lg transition duration-200';
        tabInventoryBtn.className = 'flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded-lg transition duration-200 text-slate-500 hover:text-slate-800 hover:bg-white/50';

        // Update label
        if (currentViewLabel) {
            currentViewLabel.textContent = 'Dashboard Overview';
        }

        // Fetch live dashboard data when switching to this tab
        fetchDashboardSummary();
        fetchAndRenderChart();
    } else if (activeTab === 'inventory') {
        // Toggle view visibility
        inventoryView.classList.remove('hidden');
        dashboardView.classList.add('hidden');

        // Update tab button styles for Light Mode
        tabInventoryBtn.className = 'flex items-center space-x-2 px-4 py-2 text-sm font-semibold bg-white text-sky-600 border border-slate-200 shadow-sm rounded-lg transition duration-200';
        tabDashboardBtn.className = 'flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded-lg transition duration-200 text-slate-500 hover:text-slate-800 hover:bg-white/50';

        // Update label
        if (currentViewLabel) {
            currentViewLabel.textContent = 'Inventory Management';
        }
    }

    // Re-trigger Lucide icons to render inside the active tab
    lucide.createIcons();
}

// Add event listeners for tab switching
if (tabDashboardBtn && tabInventoryBtn) {
    tabDashboardBtn.addEventListener('click', () => switchTab('dashboard'));
    tabInventoryBtn.addEventListener('click', () => switchTab('inventory'));
}

// ============================================================
// PAGE INITIALIZATION
// ============================================================

// Page Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Initial fetch
    fetchMedicines();
    fetchAlerts();
    fetchDashboardSummary();
    fetchAndRenderChart();

    // Render initial static page lucide icons
    lucide.createIcons();
});
