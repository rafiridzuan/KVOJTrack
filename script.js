// --- Variable & State (Tempat simpan barang) ---
let applications = [];
let currentFilter = 'all';
let searchQuery = '';

// --- Enjin Mula sini boh ---
document.addEventListener('DOMContentLoaded', () => {
    try { 
        loadData(); // Tarik data dari local storage
    } catch(e) { 
        console.error("Data error", e); 
        applications=[]; // Kalau barai, buat array kosong
    }
    renderDashboard();
    
    // Safety check utk PDF.js
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // Event listener global, satu untuk semua
    document.addEventListener('click', (e) => {
        // Tutup settings dropdown kalau klik kat luar
        const settingsDrop = document.getElementById('settingsDropdown');
        const settingsBtn = document.getElementById('settingsBtn');
        
        if(settingsDrop.classList.contains('active')) {
            if(!settingsDrop.contains(e.target) && !settingsBtn.contains(e.target)) {
                settingsDrop.classList.remove('active');
            }
        }

        // Tutup status dropdown (move button) kalau klik luaq
        if (!e.target.closest('.quick-status-wrapper')) {
            document.querySelectorAll('.status-dropdown.show').forEach(el => {
                el.classList.remove('show');
                const card = el.closest('.card');
                if(card) card.classList.remove('active-dropdown');
            });
        }
    });

    // Setting button logic
    document.getElementById('settingsBtn').addEventListener('click', toggleSettings);
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('clearAllBtn').addEventListener('click', clearAllData);
    document.getElementById('importInputCsv').addEventListener('change', function() { importDataCsv(this); });
    
    // Add button logic (Desktop & Mobile)
    const openAddModal = () => openModal(false);
    const addBtnDesktop = document.getElementById('addBtnDesktop');
    if(addBtnDesktop) addBtnDesktop.addEventListener('click', openAddModal);
    document.getElementById('addBtnMobile').addEventListener('click', openAddModal);

    // Modal close logic
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
    
    // Tutup modal bila klik backdrop gelap tu
    document.getElementById('modalBackdrop').addEventListener('click', (e) => {
        if(e.target.id === 'modalBackdrop') closeModal();
    });

    // Handle Search input
    document.getElementById('searchInput').addEventListener('input', (e) => handleSearch(e.target.value));

    // Handle Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const status = btn.getAttribute('data-filter');
            filterApps(status);
        });
    });

    // Handle Form Submit (Tambah/Edit kerja)
    document.getElementById('appForm').addEventListener('submit', handleFormSubmit);
});

// --- Fungsi Paparan (Render Dashboard) ---
function renderDashboard() {
    // Kira-kira statistik, update nombor kat atas tu
    document.getElementById('statTotal').textContent = applications.length;
    document.getElementById('statInterview').textContent = applications.filter(a => a.status === 'Interview').length;
    document.getElementById('statOffer').textContent = applications.filter(a => a.status === 'Offer').length;
    document.getElementById('statRejected').textContent = applications.filter(a => a.status === 'Rejected').length;

    const grid = document.getElementById('appGrid');
    grid.innerHTML = '';
    
    // Filter ikut carian dan status (butang pil)
    let filtered = applications.filter(app => {
        const matchesStatus = currentFilter === 'all' || app.status === currentFilter;
        const matchesSearch = (app.company.toLowerCase() + app.role.toLowerCase()).includes(searchQuery.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    // Susun tarikh (baru ke lama), biar nampak yg latest dulu
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Kalau takdak data, tunjuk gambar folder kosong
    if (filtered.length === 0) {
        document.getElementById('emptyState').classList.add('visible');
    } else {
        document.getElementById('emptyState').classList.remove('visible');
        
        // Loop data dan buat kad seketul-seketul
        filtered.forEach(app => {
            const el = document.createElement('div');
            el.className = 'card';
            el.setAttribute('data-status', app.status); // Utk styling border warna warni
            
            // HTML dalam kad
            el.innerHTML = `
                <div class="card-header">
                    <div class="company-name">${escapeHtml(app.company)}</div>
                    <span class="status-badge status-${app.status.toLowerCase()}">${app.status}</span>
                </div>
                <div class="role-title">${escapeHtml(app.role)}</div>
                <div class="badge-row">
                    <span class="location-badge">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                        ${escapeHtml(app.location || 'Remote')}
                    </span>
                </div>
                <div class="card-meta">
                    <span class="date-text">${getRelativeTime(app.date)}</span>
                    <div class="card-actions">
                        
                        <!-- Dropdown Move -->
                        <div class="quick-status-wrapper">
                            <button class="quick-status-btn" onclick="toggleStatusDropdown(event, '${app.id}')">
                                Move <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </button>
                            <div id="dropdown-${app.id}" class="status-dropdown">
                                <button class="status-option" onclick="updateStatus('${app.id}', 'Applied')">Applied</button>
                                <button class="status-option" onclick="updateStatus('${app.id}', 'Interview')">Interview</button>
                                <button class="status-option" onclick="updateStatus('${app.id}', 'Offer')">Offer</button>
                                <button class="status-option" onclick="updateStatus('${app.id}', 'Rejected')">Rejected</button>
                                <button class="status-option" onclick="updateStatus('${app.id}', 'Ghosted')">Ghosted</button>
                                <button class="status-option" onclick="updateStatus('${app.id}', 'Declined')">Declined</button>
                            </div>
                        </div>
                        
                        <!-- Butang Edit -->
                        <button class="icon-btn" onclick="editEntry('${app.id}')" title="Edit">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        
                        <!-- Butang Delete -->
                        <button class="icon-btn delete" onclick="deleteEntry('${app.id}')" title="Delete">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>
            `;
            grid.appendChild(el);
        });
    }
}

// --- Helper Functions (Benda kecik-kecik) ---

// Bukak tutup dropdown move tu
function toggleStatusDropdown(event, id) {
    event.stopPropagation(); // Jgn bagi event ni trigger benda lain
    
    const dropdown = document.getElementById(`dropdown-${id}`);
    const wasOpen = dropdown.classList.contains('show');

    // Tutup semua dulu, reset balik
    document.querySelectorAll('.status-dropdown').forEach(el => {
        el.classList.remove('show');
        const card = el.closest('.card');
        if(card) card.classList.remove('active-dropdown');
    });

    // Kalau tadi tutup, kita bukak la
    if (!wasOpen) {
        dropdown.classList.add('show');
        dropdown.closest('.card').classList.add('active-dropdown'); // Naikkan z-index kad
    }
}

// Update status bila user pilih dlm dropdown
function updateStatus(id, newStatus) {
    const idx = applications.findIndex(a => a.id === id);
    if (idx !== -1) { 
        applications[idx].status = newStatus; 
        saveData(); // Simpan terus
        showToast(`Status updated to ${newStatus}`); 
    }
}

function toggleSettings() { 
    document.getElementById('settingsDropdown').classList.toggle('active'); 
}

function filterApps(status) {
    currentFilter = status;
    // Update button active state
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-filter') === status) btn.classList.add('active');
    });
    renderDashboard();
}

function handleSearch(val) { 
    searchQuery = val; 
    renderDashboard(); 
}

// Modal Logic
function openModal(isEdit = false) {
    const modal = document.getElementById('modalBackdrop');
    const title = document.getElementById('modalTitle');
    const form = document.getElementById('appForm');
    
    if (!isEdit) {
        form.reset(); 
        document.getElementById('entryId').value = ''; 
        document.getElementById('date').valueAsDate = new Date(); // Default hari ni
        title.textContent = 'Add Application';
    } else { 
        title.textContent = 'Edit Application'; 
    }
    modal.classList.add('active');
}

function closeModal() { 
    document.getElementById('modalBackdrop').classList.remove('active'); 
}

// Submit Form (Tambah/Edit)
function handleFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('entryId').value;
    
    // Kutip data dari form
    const data = {
        company: document.getElementById('company').value,
        role: document.getElementById('role').value,
        location: document.getElementById('location').value,
        status: document.getElementById('status').value,
        date: document.getElementById('date').value,
        notes: document.getElementById('notes').value
    };

    if (id) {
        // Edit mode: cari id lama, update
        const idx = applications.findIndex(a => a.id === id);
        if (idx !== -1) applications[idx] = { ...applications[idx], ...data };
        showToast('Application updated');
    } else {
        // Add mode: buat id baru
        applications.push({ id: Date.now().toString(), ...data });
        showToast('Application added');
    }
    
    saveData(); 
    closeModal();
}

function deleteEntry(id) { 
    if (confirm('Delete this application?')) { 
        applications = applications.filter(a => a.id !== id); 
        saveData(); 
        showToast('Application deleted'); 
    } 
}

function editEntry(id) {
    const app = applications.find(a => a.id === id);
    if (!app) return;
    
    // Isi balik form dengan data lama
    document.getElementById('entryId').value = app.id;
    document.getElementById('company').value = app.company;
    document.getElementById('role').value = app.role;
    document.getElementById('location').value = app.location;
    document.getElementById('status').value = app.status;
    document.getElementById('date').value = app.date;
    document.getElementById('notes').value = app.notes;
    
    openModal(true);
}

// --- Import/Export Data ---
function exportData() {
    const blob = new Blob([JSON.stringify(applications, null, 2)], { type: "application/json" });
    const a = document.createElement('a'); 
    a.href = URL.createObjectURL(blob); 
    a.download = `backup_${new Date().toISOString().split('T')[0]}.json`; 
    a.click();
    toggleSettings();
}

// Baca CSV Excel
function importDataCsv(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const rows = e.target.result.split(/\r?\n/).filter(row => row.trim() !== '');
            let added = 0;
            let startIndex = 0;
            // Skip header kalau ada perkataan 'company'
            if(rows.length > 0 && rows[0].toLowerCase().includes('company')) startIndex=1;

            for (let i=startIndex; i<rows.length; i++) {
                // Split koma, buang quote
                const cols = rows[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
                
                if(cols.length < 2) continue; // Skip baris rosak

                applications.push({
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                    company: cols[0] || 'Unknown',
                    role: cols[1] || 'Intern',
                    location: cols[3] || 'Unknown',
                    status: smartGuessStatus(cols[2] || 'Applied'),
                    date: new Date().toISOString().split('T')[0],
                    notes: 'Imported via CSV'
                });
                added++;
            }
            saveData(); 
            showToast(`Imported ${added} apps`);
        } catch(err) { 
            showToast('Error parsing CSV'); 
        }
    };
    reader.readAsText(file); 
    toggleSettings(); 
    input.value = '';
}

// Teka status dari text excel (sikit logic)
function smartGuessStatus(t) {
    t = t.toLowerCase();
    if(t.includes('interview')||t.includes('iv')) return 'Interview';
    if(t.includes('offer')||t.includes('accept')) return 'Offer';
    if(t.includes('reject')||t.includes('gagal')) return 'Rejected';
    return 'Applied';
}

function clearAllData() { 
    if(confirm('Delete ALL data? Cannot undo.')) { 
        applications=[]; 
        saveData(); 
        toggleSettings(); 
        showToast('All cleared'); 
    } 
}

// --- Utils Lain ---
function showToast(msg) {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div'); 
    t.className = 'toast'; 
    t.innerHTML = `<span>✓</span> ${msg}`;
    c.appendChild(t); 
    
    requestAnimationFrame(() => t.classList.add('visible'));
    
    setTimeout(() => { 
        t.classList.remove('visible'); 
        setTimeout(() => t.remove(), 300); 
    }, 3000);
}

// Format tarikh biar nampak "Hari Ini", "Semalam" (English ver)
function getRelativeTime(ds) {
    const diff = Math.ceil(Math.abs(new Date() - new Date(ds)) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today'; 
    if (diff === 1) return 'Yesterday'; 
    if (diff < 7) return `${diff} days ago`; 
    return new Date(ds).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(t) { 
    const d = document.createElement('div'); 
    d.innerText = t || ''; 
    return d.innerHTML; 
}

// --- Local Storage (Nadi sistem ni) ---
function loadData() {
    const stored = localStorage.getItem('internTrackData');
    if (stored) applications = JSON.parse(stored);
}

function saveData() {
    localStorage.setItem('internTrackData', JSON.stringify(applications));
    renderDashboard();
}