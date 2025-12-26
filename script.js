// --- Variable & State ---
    let applications = [];
    let currentFilter = 'all';
    let searchQuery = '';
    let currentAiAppContext = {}; 
    let extractedResumeText = ''; // Text utk OpenAI
    let resumeBase64 = ''; // Base64 utk Gemini
    let geminiKey = localStorage.getItem('internTrackGeminiKey') || '';
    let openaiKey = localStorage.getItem('internTrackOpenaiKey') || '';
    
    // Resume Default
    let defaultResumeText = localStorage.getItem('internTrackDefaultResumeText') || '';
    let defaultResumeBase64 = localStorage.getItem('internTrackDefaultResumeBase64') || '';

    // --- Enjin Mula ---
    document.addEventListener('DOMContentLoaded', () => {
        try { loadData(); } catch(e) { console.error("Data error", e); applications=[]; }
        renderDashboard();
        updateDefaultResumeStatus();
        
        if(geminiKey) document.getElementById('geminiKeyInput').value = geminiKey;
        if(openaiKey) document.getElementById('openaiKeyInput').value = openaiKey;

        // Tutup dropdown bila klik luaq
        document.addEventListener('click', (e) => {
            const settingsDrop = document.getElementById('settingsDropdown');
            const settingsBtn = document.querySelector('[onclick="toggleSettings()"]');
            
            if(settingsDrop.classList.contains('active')) {
                if(!settingsDrop.contains(e.target) && !settingsBtn.contains(e.target)) {
                    settingsDrop.classList.remove('active');
                }
            }
            if (!e.target.closest('.quick-status-wrapper')) {
                document.querySelectorAll('.status-dropdown.show').forEach(el => {
                    el.classList.remove('show');
                    const card = el.closest('.card');
                    if(card) card.classList.remove('active-dropdown');
                });
            }
        });
    });

    // --- Upload Default Resume ---
    async function handleDefaultResumeUpload(input) {
        const file = input.files[0];
        if (!file) return;
        if (file.type !== 'application/pdf') { alert('Please upload a PDF file.'); return; }
        
        const statusEl = document.getElementById('defaultResumeStatus');
        statusEl.textContent = "Processing...";
        
        try {
            // 1. Simpan Base64 utk Gemini
            const base64Reader = new FileReader();
            const base64Promise = new Promise((resolve) => {
                base64Reader.onload = () => resolve(base64Reader.result.split(',')[1]);
                base64Reader.readAsDataURL(file);
            });
            const base64 = await base64Promise;
            
            try {
                localStorage.setItem('internTrackDefaultResumeBase64', base64);
                defaultResumeBase64 = base64;
            } catch (e) {
                console.warn("File besar sangat, simpan text je.");
                defaultResumeBase64 = ''; 
                showToast("PDF too large. Saving text only.");
            }

            // 2. Extract Text utk OpenAI
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n\n';
            }
            
            defaultResumeText = fullText;
            localStorage.setItem('internTrackDefaultResumeText', fullText);
            
            updateDefaultResumeStatus();
            showToast('Default Resume Saved!');
            
        } catch (error) {
            console.error(error);
            statusEl.textContent = "Error reading PDF";
            alert("Error reading PDF. Try another file.");
        }
        input.value = ''; 
    }

    function updateDefaultResumeStatus() {
        const statusEl = document.getElementById('defaultResumeStatus');
        if (defaultResumeText) {
             statusEl.innerHTML = '<span class="file-success">✓ Saved (Ready)</span>';
        } else {
            statusEl.textContent = 'Upload PDF';
        }
    }

    function clearDefaultResume() {
        if(confirm('Clear default resume text?')) {
            defaultResumeText = '';
            defaultResumeBase64 = '';
            localStorage.removeItem('internTrackDefaultResumeText');
            localStorage.removeItem('internTrackDefaultResumeBase64');
            updateDefaultResumeStatus();
            showToast('Default Resume Cleared');
        }
    }

    // --- Upload Resume Job Specific ---
    async function handleResumeUpload(input) {
        const file = input.files[0];
        if (!file) return;

        const zone = document.querySelector('.file-upload-zone');
        const textLabel = document.getElementById('fileUploadText');
        const infoLabel = document.getElementById('fileUploadInfo');

        if (file.type !== 'application/pdf') {
            alert('Please upload a PDF file.');
            return;
        }

        textLabel.textContent = "Processing PDF...";
        infoLabel.textContent = "Preparing analysis...";
        
        try {
            // 1. Base64
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                resumeBase64 = reader.result.split(',')[1];
            };

            // 2. Extract Text
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                
                // Susun atur text biar tak berterabur (Smart Sorting)
                const items = textContent.items.map(item => ({
                    str: item.str,
                    x: item.transform[4], 
                    y: item.transform[5], 
                    w: item.width,
                    h: item.height
                }));

                items.sort((a, b) => {
                    const yDiff = Math.abs(a.y - b.y);
                    if (yDiff < 5) return a.x - b.x; 
                    return b.y - a.y; 
                });

                let pageText = '';
                let lastY = items.length > 0 ? items[0].y : 0;

                items.forEach(item => {
                    if (Math.abs(item.y - lastY) > 10) pageText += '\n';
                    else if (pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) pageText += ' ';
                    pageText += item.str;
                    lastY = item.y;
                });
                fullText += pageText + '\n\n';
            }

            extractedResumeText = fullText;
            
            zone.style.borderColor = 'var(--success)';
            zone.style.background = 'var(--status-offer-bg)';
            textLabel.innerHTML = `<span class="file-success">✓ ${file.name}</span>`;
            infoLabel.textContent = "Ready! Gemini can see full file.";
            
        } catch (error) {
            console.error(error);
            textLabel.textContent = "Error reading PDF";
            infoLabel.textContent = "Try another file.";
        }
    }

    // --- Logic AI ---
    function openAiModal(id) {
        const app = applications.find(a => a.id === id);
        if(!app) return;
        currentAiAppContext = app;
        
        // Reset UI
        document.getElementById('aiEmailType').value = 'Cold Email';
        document.getElementById('btnTextEmail').innerText = 'Generate Email Draft';
        document.getElementById('btnTextResume').innerText = 'Scan My Resume';
        document.getElementById('btnTextInterview').innerText = 'Generate Questions';

        const zone = document.querySelector('.file-upload-zone');
        const textLabel = document.getElementById('fileUploadText');
        const infoLabel = document.getElementById('fileUploadInfo');
        
        // Reset data local utk job ni
        extractedResumeText = '';
        resumeBase64 = '';
        document.getElementById('aiRealResumeFile').value = '';

        // Cek kalau ada default resume
        if (defaultResumeText) {
             zone.style.borderColor = 'var(--ai-accent)';
             zone.style.background = '#eff6ff';
             textLabel.innerHTML = `<span style="color:var(--ai-accent)">★ Using Default Resume</span>`;
             infoLabel.textContent = "Upload different PDF to override.";
        } else {
             zone.style.borderColor = 'var(--border)';
             zone.style.background = 'var(--bg-body)';
             textLabel.textContent = "Click to upload PDF Resume";
             infoLabel.textContent = "AI will read this to personalize output.";
        }

        document.getElementById('aiEmailCompany').textContent = app.company;
        // Takde span aiInterviewCompany dlm HTML, buang baris ni kalau error
        // document.getElementById('aiInterviewCompany').textContent = app.company;
        document.getElementById('aiModalBackdrop').classList.add('active');
    }

    function switchAiTab(tab) {
        document.querySelectorAll('.ai-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ai-content').forEach(c => c.classList.remove('active'));
        if(tab === 'email') {
            document.querySelectorAll('.ai-tab')[0].classList.add('active');
            document.getElementById('aiTabEmail').classList.add('active');
        } else if (tab === 'resume') {
            document.querySelectorAll('.ai-tab')[1].classList.add('active');
            document.getElementById('aiTabResume').classList.add('active');
        } else if (tab === 'interview') {
            document.querySelectorAll('.ai-tab')[2].classList.add('active');
            document.getElementById('aiTabInterview').classList.add('active');
        }
    }

    // Tukar warna tema modal ikut AI
    function updateProviderStyle() {
        const provider = document.getElementById('aiProvider').value;
        const modal = document.querySelector('.modal.ai-modal');
        const badge = document.querySelector('.ai-badge-dynamic');

        modal.classList.remove('ai-provider-local', 'ai-provider-gemini', 'ai-provider-openai');
        modal.classList.add(`ai-provider-${provider}`);
        
        if(provider === 'local') badge.style.background = 'var(--ai-gradient)';
        else if(provider === 'gemini') badge.style.background = 'var(--gemini-gradient)';
        else if(provider === 'openai') badge.style.background = 'var(--gpt-gradient)';
    }

    async function generateContent(action) {
        const provider = document.getElementById('aiProvider').value;
        if (action === 'email') await generateEmail(provider);
        else if (action === 'resume') await analyzeResume(provider);
        else if (action === 'interview') await generateInterviewPrep(provider);
    }

    function cleanAIResponse(text) {
        if (!text) return "";
        return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/#{1,6}\s?/g, '').replace(/`/g, '').trim();
    }

    function showResultModal(title, content, showEmailBtn = false) {
        document.getElementById('resultTitle').innerText = title;
        document.getElementById('resultContent').innerText = content;
        document.getElementById('resultEmailBtn').style.display = showEmailBtn ? 'block' : 'none';
        document.getElementById('resultModalBackdrop').classList.add('active');
    }

    function copyToClipboard() {
        const text = document.getElementById('resultContent').innerText;
        navigator.clipboard.writeText(text).then(() => {
            showToast('Copied to clipboard!');
        });
    }

    function getActiveResumeText() { return extractedResumeText || defaultResumeText; }
    function getActiveResumeBase64() { return resumeBase64 || defaultResumeBase64; }

    // --- Email Logic ---
    async function generateEmail(provider) {
        const btn = document.getElementById('btnTextEmail');
        const type = document.getElementById('aiEmailType').value;
        const resumeTxt = getActiveResumeText();
        
        btn.innerHTML = '<span class="loading-spinner"></span> Generating...';

        let resultText = "";

        if (provider === 'local') {
            await new Promise(r => setTimeout(r, 600)); 
            resultText = getLocalEmailTemplate(type);
        } else {
            // Prompt updated utk Cold Approach
            let contextPrompt = "";
            if (type === 'Cold Email') {
                 contextPrompt = "CONTEXT: Cold approach email. The Subject Line MUST be catchy/witty to get noticed (e.g. 'Not another generic application...'). Body MUST be STRICTLY PROFESSIONAL.";
            }

            const prompt = `Write a professional email to "${currentAiAppContext.company}" for the role "${currentAiAppContext.role}".
            ${contextPrompt}
            IMPORTANT: Extract my Name, Phone Number, and Email from the Resume Context provided and use them in the email signature.
            IMPORTANT: Write in a natural tone. No markdown formatting.
            Context: Use the extracted details to personalize the email.
            Current Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            Format: Return ONLY the Subject line and the Body text.`;

            if (provider === 'gemini') resultText = await callGemini(prompt);
            else if (provider === 'openai') resultText = await callOpenAI(prompt + `\n\nRESUME TEXT: ${resumeTxt ? resumeTxt.substring(0,2500) : "No resume provided."}`);
        }

        showResultModal('📧 Email Draft', cleanAIResponse(resultText), true);
        btn.innerText = 'Generate Email Draft';
    }

    // --- Resume Logic ---
    async function analyzeResume(provider) {
        const btn = document.getElementById('btnTextResume');
        const resumeTxt = getActiveResumeText();
        const resumeB64 = getActiveResumeBase64();

        if(!resumeB64 && !resumeTxt) { 
            alert('Upload resume dulu, atau set default resume kat setting!'); 
            return; 
        }

        btn.innerHTML = '<span class="loading-spinner"></span> Scanning...';

        let resultText = "";

        if (provider === 'local') {
            await new Promise(r => setTimeout(r, 800));
            resultText = getLocalResumeScan();
        } else {
            const prompt = `Persona: You are a weary but hopeful HR recruiter at "${currentAiAppContext.company}". You are talking to yourself (internal monologue) while reviewing this attached resume for the "${currentAiAppContext.role}" position.
            Tone: Candid, human, professional yet slightly informal internal thought process. Use phrases like "Hmm, this looks good", "I wonder why they put that?", etc.
            
            IMPORTANT: Write naturally in plain text paragraphs. No markdown.
            
            Structure your monologue:
            1. First impression and Fit Score (0-10).
            2. Candid thoughts on experience/projects.
            3. Red flags vs Green flags.
            4. Final Verdict: Call them or Pass?`;

            if (provider === 'gemini') resultText = await callGemini(prompt);
            else if (provider === 'openai') resultText = await callOpenAI(prompt + `\n\nRESUME TEXT: ${resumeTxt.substring(0,3500)}`);
        }
        
        showResultModal('📄 Resume Critique', cleanAIResponse(resultText), false);
        btn.innerText = 'Scan My Resume';
    }
    
    // --- Interview Prep Logic ---
    async function generateInterviewPrep(provider) {
        const btn = document.getElementById('btnTextInterview');
        const resumeTxt = getActiveResumeText();
        
        btn.innerHTML = '<span class="loading-spinner"></span> Preparing...';
        
        let resultText = "";
        
        if (provider === 'local') {
            await new Promise(r => setTimeout(r, 800));
            resultText = getLocalInterviewPrep();
        } else {
            const prompt = `Generate 3 technical interview questions and 3 behavioral interview questions for the role of ${currentAiAppContext.role} at ${currentAiAppContext.company}. 
            Base the questions on the skills found in the attached resume if possible.
            IMPORTANT: Write in plain text only. No markdown. Write naturally.`;
            
            if (provider === 'gemini') resultText = await callGemini(prompt);
            else if (provider === 'openai') resultText = await callOpenAI(prompt + `\n\nRESUME SKILLS: ${resumeTxt ? resumeTxt.substring(0,2500) : "No resume."}`);
        }
        
        showResultModal('🎤 Interview Guide', cleanAIResponse(resultText), false);
        btn.innerText = 'Generate Questions';
    }

    // --- API Calls ---
    async function callGemini(promptText) {
        if (!geminiKey) return "Error: Please enter a Google Gemini API Key in Settings.";
        try {
            const { GoogleGenerativeAI } = await import("https://esm.run/@google/generative-ai");
            
            const genAI = new GoogleGenerativeAI(geminiKey);
            const modelsToTry = ["gemini-2.0-flash-exp", "gemini-2.0-flash", "gemini-1.5-flash"];
            
            const activeB64 = getActiveResumeBase64();
            const activeTxt = getActiveResumeText();

            for (const modelName of modelsToTry) {
                try {
                    const model = genAI.getGenerativeModel({ model: modelName });
                    let parts = [{ text: promptText }];
                    
                    if (activeB64) {
                        parts.push({ inlineData: { mimeType: "application/pdf", data: activeB64 } });
                    } else if (activeTxt) {
                        parts[0].text = promptText + `\n\nCONTEXT FROM RESUME:\n${activeTxt}`;
                    }

                    const result = await model.generateContent(parts);
                    return result.response.text();
                } catch (e) {
                    console.warn(`Model ${modelName} failed, trying next...`, e);
                    continue; 
                }
            }
            return "Error: All Gemini models failed or quota exceeded.";
            
        } catch (error) {
            console.error(error);
            return `Error calling Gemini API: ${error.message}`;
        }
    }

    async function callOpenAI(prompt) {
        if (!openaiKey) return "Error: Please enter an OpenAI API Key in Settings.";
        try {
            const { OpenAI } = await import("https://cdn.jsdelivr.net/npm/openai@4.28.0/+esm");
            const client = new OpenAI({ apiKey: openaiKey, dangerouslyAllowBrowser: true });
            
            const response = await client.chat.completions.create({
                model: "gpt-4o", 
                messages: [{ role: "user", content: prompt }]
            });
            return response.choices[0].message.content || "Error: AI returned no text.";
        } catch (error) {
            console.error(error);
            if (error.message.includes('429')) return "Error: OpenAI Quota Exceeded (429). Check billing.";
            return `Error calling OpenAI API: ${error.message}`;
        }
    }

    // --- Local Fallbacks ---
    function getLocalEmailTemplate(type) {
        const c = currentAiAppContext.company;
        const r = currentAiAppContext.role;
        if(type === 'Cold Email') return `Subject: Application for ${r} - [Your Name]\n\nDear Hiring Manager,\n\nI am writing to apply for the ${r} position at ${c}... (Local Template)`;
        return `Subject: Regarding ${r} at ${c}\n\nDear Hiring Manager,\n\n(This is a local offline template. Add an API Key for smart generation!)...`;
    }

    function getLocalResumeScan() {
        return `FIT SCORE: ${Math.floor(Math.random()*3)+6}/10 (Offline Estimate)\n\nKEYWORDS FOUND: Team, Project, Analysis (Offline Scan)\n\nNOTE: Use Gemini or ChatGPT for real feedback.`;
    }
    
    function getLocalInterviewPrep() {
        return `INTERVIEW QUESTIONS (OFFLINE MODE)\n\n1. Tell me about yourself.\n2. Why do you want to work at ${currentAiAppContext.company}?\n\n(Connect Gemini/OpenAI API Key for tailored questions!)`;
    }

    function saveKeys() {
        geminiKey = document.getElementById('geminiKeyInput').value.trim();
        openaiKey = document.getElementById('openaiKeyInput').value.trim();
        localStorage.setItem('internTrackGeminiKey', geminiKey);
        localStorage.setItem('internTrackOpenaiKey', openaiKey);
        showToast('API Keys Saved!');
    }

    function openMailClient() {
        const hrEmail = document.getElementById('aiHrEmail').value;
        const content = document.getElementById('resultContent').innerText; // Guna modal punya content
        let subject = "";
        let body = content;
        const lines = content.split('\n');
        const subjectLine = lines.find(l => l.toLowerCase().startsWith('subject:'));
        if (subjectLine) {
            subject = subjectLine.replace(/subject:/i, '').trim();
            body = content.replace(subjectLine, '').trim();
        }
        window.open(`mailto:${hrEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    }

    // --- Data & Core Logic ---
    function loadData() {
        const stored = localStorage.getItem('internTrackData');
        if (stored) applications = JSON.parse(stored);
    }
    function saveData() {
        localStorage.setItem('internTrackData', JSON.stringify(applications));
        renderDashboard();
    }
    
    function renderDashboard() {
        document.getElementById('statTotal').textContent = applications.length;
        document.getElementById('statInterview').textContent = applications.filter(a => a.status === 'Interview').length;
        document.getElementById('statOffer').textContent = applications.filter(a => a.status === 'Offer').length;
        document.getElementById('statRejected').textContent = applications.filter(a => a.status === 'Rejected').length;

        const grid = document.getElementById('appGrid');
        grid.innerHTML = '';
        
        let filtered = applications.filter(app => {
            const matchesStatus = currentFilter === 'all' || app.status === currentFilter;
            const matchesSearch = (app.company.toLowerCase() + app.role.toLowerCase()).includes(searchQuery.toLowerCase());
            return matchesStatus && matchesSearch;
        });

        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

        if (filtered.length === 0) {
            document.getElementById('emptyState').classList.add('visible');
        } else {
            document.getElementById('emptyState').classList.remove('visible');
            filtered.forEach(app => {
                const el = document.createElement('div');
                el.className = 'card';
                // Add data-status for styling borders
                el.setAttribute('data-status', app.status);
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
                            <button class="icon-btn ai-btn" onclick="openAiModal('${app.id}')" title="Smart Assistant">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
                            </button>
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
                            <button class="icon-btn" onclick="editEntry('${app.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                            <button class="icon-btn delete" onclick="deleteEntry('${app.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                        </div>
                    </div>
                `;
                grid.appendChild(el);
            });
        }
    }

    function toggleStatusDropdown(event, id) {
        event.stopPropagation();
        
        const dropdown = document.getElementById(`dropdown-${id}`);
        const wasOpen = dropdown.classList.contains('show');

        // Tutup semua dulu
        document.querySelectorAll('.status-dropdown').forEach(el => {
            el.classList.remove('show');
            const card = el.closest('.card');
            if(card) card.classList.remove('active-dropdown');
        });

        // Kalau tadi tutup, bukak la
        if (!wasOpen) {
            dropdown.classList.add('show');
            dropdown.closest('.card').classList.add('active-dropdown');
        }
    }
    function updateStatus(id, newStatus) {
        const idx = applications.findIndex(a => a.id === id);
        if (idx !== -1) { applications[idx].status = newStatus; saveData(); showToast(`Status updated to ${newStatus}`); }
    }
    function toggleSettings() { document.getElementById('settingsDropdown').classList.toggle('active'); }
    function filterApps(status) {
        currentFilter = status;
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.textContent.trim() === (status === 'all' ? 'All' : status.includes('Declined') ? 'Declined' : status)) btn.classList.add('active');
        });
        renderDashboard();
    }
    function handleSearch(val) { searchQuery = val; renderDashboard(); }

    function openModal(isEdit = false) {
        const modal = document.getElementById('modalBackdrop');
        const title = document.getElementById('modalTitle');
        const form = document.getElementById('appForm');
        if (!isEdit) {
            form.reset(); document.getElementById('entryId').value = ''; document.getElementById('date').valueAsDate = new Date(); title.textContent = 'Add Application';
        } else { title.textContent = 'Edit Application'; }
        modal.classList.add('active');
    }
    function closeModal(id) { document.getElementById(id).classList.remove('active'); }

    function handleFormSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('entryId').value;
        const data = {
            company: document.getElementById('company').value,
            role: document.getElementById('role').value,
            location: document.getElementById('location').value,
            status: document.getElementById('status').value,
            date: document.getElementById('date').value,
            notes: document.getElementById('notes').value
        };
        if (id) {
            const idx = applications.findIndex(a => a.id === id);
            if (idx !== -1) applications[idx] = { ...applications[idx], ...data };
            showToast('Application updated');
        } else {
            applications.push({ id: Date.now().toString(), ...data });
            showToast('Application added');
        }
        saveData(); closeModal('modalBackdrop');
    }
    function deleteEntry(id) { if (confirm('Delete this application?')) { applications = applications.filter(a => a.id !== id); saveData(); showToast('Application deleted'); } }
    function editEntry(id) {
        const app = applications.find(a => a.id === id);
        if (!app) return;
        document.getElementById('entryId').value = app.id;
        document.getElementById('company').value = app.company;
        document.getElementById('role').value = app.role;
        document.getElementById('location').value = app.location;
        document.getElementById('status').value = app.status;
        document.getElementById('date').value = app.date;
        document.getElementById('notes').value = app.notes;
        openModal(true);
    }

    function exportData() {
        const blob = new Blob([JSON.stringify(applications, null, 2)], { type: "application/json" });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `backup_${new Date().toISOString().split('T')[0]}.json`; a.click();
        toggleSettings();
    }
    function triggerImport(type) { document.getElementById('importInputCsv').click(); }
    function importDataCsv(input) {
        const file = input.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const rows = e.target.result.split(/\r?\n/).filter(row => row.trim() !== '');
                let added = 0;
                let startIndex = 0;
                if(rows.length>0 && rows[0].toLowerCase().includes('company')) startIndex=1;

                for (let i=startIndex; i<rows.length; i++) {
                    const cols = rows[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
                    if(cols.length < 2) continue;
                    applications.push({
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                        company: cols[0] || 'Unknown',
                        role: cols[1] || 'Intern',
                        location: cols[3] || 'Unknown',
                        status: smartGuessStatus(cols[2] || 'Applied'),
                        date: new Date().toISOString().split('T')[0],
                        notes: 'Imported'
                    });
                    added++;
                }
                saveData(); showToast(`Imported ${added} apps`);
            } catch(err) { showToast('Error parsing CSV'); }
        };
        reader.readAsText(file); toggleSettings(); input.value = '';
    }
    function smartGuessStatus(t) {
        t = t.toLowerCase();
        if(t.includes('interview')||t.includes('iv')) return 'Interview';
        if(t.includes('offer')||t.includes('accept')) return 'Offer';
        if(t.includes('reject')||t.includes('gagal')) return 'Rejected';
        return 'Applied';
    }
    function clearAllData() { if(confirm('Delete ALL data?')) { applications=[]; saveData(); toggleSettings(); showToast('Cleared'); } }

    function showToast(msg) {
        const c = document.getElementById('toastContainer');
        const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = `<span>✓</span> ${msg}`;
        c.appendChild(t); requestAnimationFrame(()=>t.classList.add('visible'));
        setTimeout(()=>{ t.classList.remove('visible'); setTimeout(()=>t.remove(),300); }, 3000);
    }
    function getRelativeTime(ds) {
        const diff = Math.ceil(Math.abs(new Date() - new Date(ds)) / (1000 * 60 * 60 * 24));
        if (diff === 0) return 'Today'; 
        if (diff === 1) return 'Yesterday'; 
        if (diff < 7) return `${diff} days ago`; 
        return new Date(ds).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    function escapeHtml(t) { const d = document.createElement('div'); d.innerText = t||''; return d.innerHTML; }
