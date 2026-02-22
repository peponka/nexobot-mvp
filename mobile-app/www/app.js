// =============================================
// NexoBot Mobile App — Logic
// =============================================

const API = 'http://localhost:3000';
let merchant = null;
let allTransactions = [];
let allDebtors = [];
let saleType = 'cash';

// ── UTILS ──
function fmtPYG(n) {
    if (!n) return 'Gs. 0';
    if (n >= 1e9) return `Gs. ${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `Gs. ${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `Gs. ${Math.round(n / 1e3)}K`;
    return `Gs. ${n}`;
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días ☀️';
    if (h < 19) return 'Buenas tardes 🌤️';
    return 'Buenas noches 🌙';
}

function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3000);
}

// ── DEMO DATA ──
const DEMO_MERCHANT = {
    id: 'demo-001',
    name: 'Carlos Benítez',
    business_name: 'Despensa Don Carlos',
    phone: '+595981555123',
    city: 'Luque',
    business_type: 'Despensa',
    nexo_score: 720,
    total_sales: 45800000,
    created_at: '2025-11-15T10:00:00Z'
};

const DEMO_TRANSACTIONS = [
    { type: 'SALE_CASH', amount: 850000, customer_name: 'María López', product: 'Yerba + Azúcar', created_at: new Date().toISOString() },
    { type: 'SALE_CREDIT', amount: 1200000, customer_name: 'Juan Pérez', product: 'Arroz 10kg + Aceite', created_at: new Date(Date.now() - 3600000).toISOString() },
    { type: 'PAYMENT', amount: 500000, customer_name: 'Rosa Martínez', product: 'Pago parcial', created_at: new Date(Date.now() - 7200000).toISOString() },
    { type: 'SALE_CASH', amount: 350000, customer_name: 'Pedro Gómez', product: 'Gaseosa + Galletas', created_at: new Date(Date.now() - 10800000).toISOString() },
    { type: 'SALE_CREDIT', amount: 2500000, customer_name: 'Ana Villalba', product: 'Compra grande semanal', created_at: new Date(Date.now() - 86400000).toISOString() },
    { type: 'PAYMENT', amount: 1500000, customer_name: 'Luis Acosta', product: 'Pago total', created_at: new Date(Date.now() - 86400000 * 2).toISOString() },
    { type: 'SALE_CASH', amount: 180000, customer_name: 'Carmen Rojas', product: 'Pan + Leche', created_at: new Date(Date.now() - 86400000 * 2).toISOString() },
    { type: 'EXPENSE', amount: 3200000, customer_name: 'Proveedor', product: 'Reposición stock', created_at: new Date(Date.now() - 86400000 * 3).toISOString() },
];

const DEMO_DEBTORS = [
    { name: 'Juan Pérez', phone: '0981 234 567', total_debt: 3700000 },
    { name: 'Ana Villalba', phone: '0971 888 999', total_debt: 2500000 },
    { name: 'Pedro Gómez', phone: '0991 111 222', total_debt: 800000 },
    { name: 'Rosa Martínez', phone: '0982 333 444', total_debt: 1200000 },
    { name: 'Luis Acosta', phone: '0961 555 666', total_debt: 450000 },
];

let isDemo = false;

// ── LOGIN ──
async function doLogin() {
    const phone = document.getElementById('loginPhone').value.replace(/\s+/g, '').trim();
    const pin = document.getElementById('loginPin').value.trim();

    if (!phone || !pin) return;

    // DEMO MODE: phone "0000" + pin "1234"
    if (phone === '0000' && pin === '1234') {
        merchant = DEMO_MERCHANT;
        isDemo = true;
        localStorage.setItem('nexobot_merchant', JSON.stringify(merchant));
        enterApp();
        showToast('🎮 Modo demo activado');
        return;
    }

    try {
        const res = await fetch(`${API}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, pin })
        });

        const data = await res.json();

        if (data.success && data.merchant) {
            merchant = data.merchant;
            isDemo = false;
            localStorage.setItem('nexobot_token', data.token || '');
            localStorage.setItem('nexobot_merchant', JSON.stringify(merchant));
            enterApp();
        } else {
            document.getElementById('loginError').classList.remove('hidden');
        }
    } catch (e) {
        // Offline mode — try localStorage
        const saved = localStorage.getItem('nexobot_merchant');
        if (saved) {
            merchant = JSON.parse(saved);
            enterApp();
        } else {
            document.getElementById('loginError').classList.remove('hidden');
        }
    }
}

function doLogout() {
    merchant = null;
    localStorage.removeItem('nexobot_token');
    localStorage.removeItem('nexobot_merchant');
    window.location.reload();
}

function enterApp() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appShell').classList.remove('hidden');

    // Set header
    document.getElementById('headerGreeting').textContent = getGreeting();
    document.getElementById('headerName').textContent = merchant.name || merchant.business_name || 'Comerciante';

    const scoreEl = document.querySelector('.score-value');
    scoreEl.textContent = merchant.nexo_score || '--';

    loadDashboardData();
    loadDebtors();
    loadTransactions();
    setProfile();
}

// ── FORGOT PIN ──
function forgotPin() {
    alert("Para recuperar tu PIN, enviale un mensaje al bot de WhatsApp de NexoBot diciendo 'olvidé mi pin' o 'reset pin'.")
}

// ── AUTO LOGIN ──
window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('nexobot_merchant');
    if (saved) {
        merchant = JSON.parse(saved);
        enterApp();
    }
});

// ── TAB NAVIGATION ──
function switchTab(tabId) {
    // Panels
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');

    // Nav buttons
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const navMap = { tabHome: 'navHome', tabDebtors: 'navDebtors', tabHistory: 'navHistory', tabProfile: 'navProfile' };
    document.getElementById(navMap[tabId])?.classList.add('active');

    // Haptic feedback (Capacitor)
    if (window.Capacitor?.Plugins?.Haptics) {
        window.Capacitor.Plugins.Haptics.impact({ style: 'LIGHT' });
    }
}

// ── LOAD DASHBOARD DATA ──
async function loadDashboardData() {
    if (!merchant) return;

    if (isDemo) {
        document.getElementById('statSales').textContent = fmtPYG(2580000);
        document.getElementById('statDebts').textContent = fmtPYG(8650000);
        document.getElementById('statCustomers').textContent = 47;
        return;
    }

    try {
        const res = await fetch(`${API}/api/dashboard/summary`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('nexobot_token')}` }
        });
        const data = await res.json();

        document.getElementById('statSales').textContent = fmtPYG(data.salesToday || 0);
        document.getElementById('statDebts').textContent = fmtPYG(data.totalDebt || 0);
        document.getElementById('statCustomers').textContent = data.customerCount || 0;
    } catch (e) {
        document.getElementById('statSales').textContent = fmtPYG(merchant.total_sales || 0);
        document.getElementById('statDebts').textContent = '--';
        document.getElementById('statCustomers').textContent = '--';
    }
}

// ── LOAD TRANSACTIONS ──
async function loadTransactions() {
    if (!merchant) return;

    if (isDemo) {
        allTransactions = DEMO_TRANSACTIONS;
        renderTransactions(allTransactions.slice(0, 5), 'recentTxList');
        renderTransactions(allTransactions, 'historyTxList');
        return;
    }

    try {
        const res = await fetch(`${API}/api/dashboard/transactions?limit=30`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('nexobot_token')}` }
        });
        const data = await res.json();
        allTransactions = data.transactions || data || [];
        renderTransactions(allTransactions.slice(0, 10), 'recentTxList');
        renderTransactions(allTransactions, 'historyTxList');
    } catch (e) {
        document.getElementById('recentTxList').innerHTML = '<div class="tx-empty">Sin conexión</div>';
    }
}

function renderTransactions(list, containerId) {
    const container = document.getElementById(containerId);

    if (!list || list.length === 0) {
        container.innerHTML = '<div class="tx-empty">Sin transacciones aún</div>';
        return;
    }

    container.innerHTML = list.map(tx => {
        const typeConfig = {
            'SALE_CASH': { icon: '💰', cls: 'sale', sign: '+', amtCls: 'positive' },
            'SALE_CREDIT': { icon: '📝', cls: 'credit', sign: '+', amtCls: 'negative' },
            'PAYMENT': { icon: '✅', cls: 'payment', sign: '+', amtCls: 'income' },
            'EXPENSE': { icon: '🔻', cls: 'expense', sign: '-', amtCls: 'negative' }
        };
        const cfg = typeConfig[tx.type] || { icon: '💬', cls: 'sale', sign: '', amtCls: '' };

        const date = new Date(tx.created_at);
        const timeStr = `${date.getDate()}/${date.getMonth() + 1} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

        return `<div class="tx-item">
            <div class="tx-icon ${cfg.cls}">${cfg.icon}</div>
            <div class="tx-info">
                <div class="tx-name">${tx.customer_name || tx.product || tx.type}</div>
                <div class="tx-desc">${timeStr} · ${tx.product || ''}</div>
            </div>
            <div class="tx-amount ${cfg.amtCls}">${cfg.sign}${fmtPYG(tx.amount)}</div>
        </div>`;
    }).join('');
}

function filterTx(type, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const filtered = type === 'all'
        ? allTransactions
        : allTransactions.filter(tx => tx.type === type);

    renderTransactions(filtered, 'historyTxList');
}

// ── LOAD DEBTORS ──
async function loadDebtors() {
    if (!merchant) return;

    if (isDemo) {
        allDebtors = DEMO_DEBTORS;
        renderDebtors(allDebtors);
        return;
    }

    try {
        const res = await fetch(`${API}/api/dashboard/debtors`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('nexobot_token')}` }
        });
        const data = await res.json();
        allDebtors = data.debtors || data || [];
        renderDebtors(allDebtors);
    } catch (e) {
        document.getElementById('debtorList').innerHTML = '<div class="tx-empty">Sin conexión</div>';
    }
}

function renderDebtors(list) {
    const container = document.getElementById('debtorList');
    const totalEl = document.getElementById('totalDebtValue');

    if (!list || list.length === 0) {
        container.innerHTML = '<div class="tx-empty">¡No tenés deudores! 🎉</div>';
        totalEl.textContent = 'Gs. 0';
        return;
    }

    let total = 0;
    container.innerHTML = list.map(d => {
        total += d.total_debt || 0;
        return `<div class="debtor-item">
            <div>
                <div class="debtor-name">${d.name}</div>
                <div class="debtor-phone">${d.phone || 'Sin teléfono'}</div>
            </div>
            <div class="debtor-amount">${fmtPYG(d.total_debt)}</div>
        </div>`;
    }).join('');

    totalEl.textContent = fmtPYG(total);
}

function filterDebtors() {
    const query = document.getElementById('debtorSearch').value.toLowerCase();
    const filtered = allDebtors.filter(d =>
        (d.name || '').toLowerCase().includes(query)
    );
    renderDebtors(filtered);
}

// ── PROFILE ──
function setProfile() {
    if (!merchant) return;

    document.getElementById('profileName').textContent = merchant.name || 'Comerciante';
    document.getElementById('profileBusiness').textContent = merchant.business_name || 'Sin negocio';
    document.getElementById('profilePhone').textContent = merchant.phone || '--';
    document.getElementById('profileCity').textContent = merchant.city || '--';
    document.getElementById('profileType').textContent = merchant.business_type || '--';

    if (merchant.created_at) {
        const d = new Date(merchant.created_at);
        document.getElementById('profileSince').textContent = d.toLocaleDateString('es-PY');
    }

    // Score ring
    const score = merchant.nexo_score || 0;
    document.getElementById('profileScoreValue').textContent = score;
    const arc = document.getElementById('scoreArc');
    const pct = Math.min(score / 1000, 1);
    arc.setAttribute('stroke-dashoffset', 339 - (339 * pct));

    // Tier
    const tierEl = document.getElementById('profileTier');
    if (score >= 700) { tierEl.textContent = 'Tier A — Excelente'; tierEl.style.color = '#00D68F'; }
    else if (score >= 550) { tierEl.textContent = 'Tier B — Bueno'; tierEl.style.color = '#4ECDC4'; }
    else if (score >= 400) { tierEl.textContent = 'Tier C — Regular'; tierEl.style.color = '#FFCA2C'; }
    else { tierEl.textContent = 'Tier D — En desarrollo'; tierEl.style.color = '#FF6B6B'; }

    // Avatar
    const initial = (merchant.name || 'N').charAt(0).toUpperCase();
    document.getElementById('profileAvatar').textContent = initial === 'N' ? '🦄' : initial;
}

// ── MODALS ──
function showQuickSale() {
    document.getElementById('saleModal').classList.remove('hidden');
}

function showQuickPayment() {
    document.getElementById('paymentModal').classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function toggleSaleType(type) {
    saleType = type;
    document.getElementById('toggleCash').classList.toggle('active', type === 'cash');
    document.getElementById('toggleCredit').classList.toggle('active', type === 'credit');
}

async function submitSale() {
    const customer = document.getElementById('saleCustomer').value;
    const product = document.getElementById('saleProduct').value;
    const amount = parseInt(document.getElementById('saleAmount').value);

    if (!amount) return;

    const type = saleType === 'cash' ? 'SALE_CASH' : 'SALE_CREDIT';

    try {
        await fetch(`${API}/api/dashboard/transactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('nexobot_token')}`
            },
            body: JSON.stringify({ type, amount, customer_name: customer, product })
        });

        closeModal('saleModal');
        showToast(saleType === 'cash' ? '💰 Venta registrada' : '📝 Fiado registrado');

        // Reset form
        document.getElementById('saleCustomer').value = '';
        document.getElementById('saleProduct').value = '';
        document.getElementById('saleAmount').value = '';

        // Reload
        loadDashboardData();
        loadTransactions();
        if (saleType === 'credit') loadDebtors();
    } catch (e) {
        showToast('⚠️ Error al guardar');
    }
}

async function submitPayment() {
    const customer = document.getElementById('paymentCustomer').value;
    const amount = parseInt(document.getElementById('paymentAmount').value);

    if (!amount) return;

    try {
        await fetch(`${API}/api/dashboard/transactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('nexobot_token')}`
            },
            body: JSON.stringify({ type: 'PAYMENT', amount, customer_name: customer })
        });

        closeModal('paymentModal');
        showToast('✅ Cobro registrado');

        document.getElementById('paymentCustomer').value = '';
        document.getElementById('paymentAmount').value = '';

        loadDashboardData();
        loadTransactions();
        loadDebtors();
    } catch (e) {
        showToast('⚠️ Error al guardar');
    }
}

// ── DOWNLOADS ──
function downloadExcel(type) {
    if (!merchant) return;
    const url = `${API}/api/export/${merchant.id}/${type}`;
    window.open(url, '_blank');
}

function downloadPDF() {
    if (!merchant) return;
    const now = new Date();
    const url = `${API}/api/reports/${merchant.id}?month=${now.getMonth()}&year=${now.getFullYear()}`;
    window.open(url, '_blank');
}

// ── CLOSE MODALS on overlay click ──
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.add('hidden');
    }
});

// ── KEYBOARD: Enter on login ──
document.getElementById('loginPin')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
});
