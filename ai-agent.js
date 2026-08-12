// ============================================================
// ai-agent.js — JMPL AI Assistant Module
// Voice-enabled Google Gemini AI Agent with Real-Time DB Context
// ============================================================

const AIAgentModule = (() => {
  let chatHistory = []; // Stores conversation history: { role: 'user'|'model', parts: [{ text: string }] }
  let voiceOutputEnabled = true;
  let customApiKey = localStorage.getItem('jmpl_gemini_key') || '';
  let selectedModel = localStorage.getItem('jmpl_gemini_model') || 'auto';
  let recognition = null;
  let isListening = false;

  const CANDIDATE_MODELS = [
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash'
  ];

  function getApiKey() {
    return customApiKey || (typeof JMPL_CONFIG !== 'undefined' ? JMPL_CONFIG.geminiApiKey : '');
  }

  function setCustomApiKey(key) {
    customApiKey = key.trim();
    localStorage.setItem('jmpl_gemini_key', customApiKey);
  }

  function changeModel(model) {
    selectedModel = model;
    localStorage.setItem('jmpl_gemini_model', model);
    showToast(`AI Model set to ${model === 'auto' ? 'Auto (Recommended)' : model}`, 'info');
  }

  // ── Render Entrypoint ──────────────────────────────────────
  function render() {
    const el = document.getElementById('content');
    if (!el) return;

    el.innerHTML = `
      <style>
        .ai-layout {
          display: flex;
          gap: 20px;
          height: calc(100vh - 130px);
          min-height: 520px;
          max-height: 860px;
        }
        @media (max-width: 900px) {
          .ai-layout {
            flex-direction: column;
            height: auto;
            min-height: auto;
            max-height: none;
          }
          .ai-chat-card {
            height: 550px;
          }
          .ai-sidebar-card {
            height: auto;
          }
        }
        .ai-chat-card {
          flex: 7;
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 16px rgba(15, 23, 42, 0.05);
        }
        .ai-sidebar-card {
          flex: 3;
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow-y: auto;
          box-shadow: 0 4px 16px rgba(15, 23, 42, 0.05);
        }
        .ai-chat-log {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          border-bottom: 1px solid #e2e8f0;
          background-color: #f8fafc;
        }
        .ai-message-bubble {
          display: flex;
          gap: 12px;
          max-width: 88%;
          align-self: flex-start;
          animation: fadeIn 0.25s ease-out;
        }
        .ai-message-bubble.user {
          align-self: flex-end;
          flex-direction: row-reverse;
        }
        .ai-msg-avatar {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background-color: #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 17px;
          flex-shrink: 0;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .ai-message-bubble.user .ai-msg-avatar {
          background-color: #2563eb;
          color: #ffffff;
        }
        .ai-msg-content {
          background-color: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          padding: 14px 18px;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
          color: #0f172a;
          word-break: break-word;
        }
        .ai-message-bubble.user .ai-msg-content {
          background-color: #2563eb;
          color: #ffffff;
          border-color: #1d4ed8;
          border-bottom-right-radius: 2px;
        }
        .ai-msg-sender {
          font-size: 11.5px;
          font-weight: 700;
          color: #64748b;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .ai-message-bubble.user .ai-msg-sender {
          text-align: right;
          color: rgba(255, 255, 255, 0.85);
        }
        .ai-msg-text {
          font-size: 13.5px;
          line-height: 1.65;
          color: #1e293b;
        }
        .ai-message-bubble.user .ai-msg-text {
          color: #ffffff;
        }
        .ai-msg-text strong {
          color: #0f172a;
          font-weight: 750;
        }
        .ai-message-bubble.user .ai-msg-text strong {
          color: #ffffff;
          font-weight: 750;
        }
        .ai-msg-text h1, .ai-msg-text h2, .ai-msg-text h3, .ai-msg-text h4 {
          color: #0f172a;
          font-weight: 750;
          margin-top: 14px;
          margin-bottom: 6px;
        }
        .ai-msg-text p {
          margin-bottom: 8px;
          color: inherit;
        }
        .ai-msg-text ul, .ai-msg-text ol {
          margin: 6px 0 10px 22px;
          color: inherit;
        }
        .ai-msg-text li {
          margin-bottom: 4px;
          color: inherit;
        }
        .ai-table-wrap {
          overflow-x: auto;
          margin: 12px 0;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
        }
        .ai-msg-text table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12.5px;
          background: #ffffff;
        }
        .ai-msg-text th, .ai-msg-text td {
          border: 1px solid #e2e8f0;
          padding: 8px 12px;
          text-align: left;
        }
        .ai-msg-text th {
          background-color: #f1f5f9;
          color: #0f172a;
          font-weight: 700;
          border-bottom: 2px solid #cbd5e1;
        }
        .ai-msg-text tr:nth-child(even) td {
          background-color: #f8fafc;
        }
        .ai-msg-text tr:hover td {
          background-color: #f1f5f9;
        }
        .ai-msg-text code {
          background-color: #f1f5f9;
          color: #0f172a;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 12px;
          border: 1px solid #e2e8f0;
        }
        .ai-input-bar {
          display: flex;
          gap: 10px;
          padding: 14px 16px;
          background-color: #ffffff;
          align-items: center;
          border-top: 1px solid #e2e8f0;
        }
        .ai-suggestions-container {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 10px 16px;
          background-color: #ffffff;
          border-bottom: 1px solid #e2e8f0;
        }
        .ai-suggestion-chip {
          background-color: #f1f5f9;
          color: #1e293b;
          border: 1px solid #cbd5e1;
          border-radius: 16px;
          padding: 6px 14px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .ai-suggestion-chip:hover {
          background-color: #2563eb;
          color: #ffffff;
          border-color: #2563eb;
        }
        .ai-alert-center {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 14px;
        }
        .ai-alert-card {
          border-radius: 8px;
          padding: 12px;
          border-left: 4px solid;
          font-size: 12px;
          line-height: 1.5;
          animation: fadeIn 0.3s ease-out;
        }
        .ai-alert-card.warning {
          background-color: #fffbeb;
          border-color: #f59e0b;
          color: #b45309;
        }
        .ai-alert-card.danger {
          background-color: #fef2f2;
          border-color: #ef4444;
          color: #b91c1c;
        }
        .ai-alert-title {
          font-weight: 700;
          margin-bottom: 4px;
        }
        .ai-alert-empty {
          text-align: center;
          padding: 24px;
          border: 1px dashed var(--border);
          border-radius: 8px;
          color: var(--text-muted);
          font-size: 12px;
        }
        
        /* Pulse Animation for Mic */
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .mic-btn.recording {
          background-color: var(--danger) !important;
          color: white !important;
          animation: pulse 1.5s infinite;
        }
        
        /* Typing Wave Animation */
        .typing-indicator-bubble .ai-msg-text {
          display: flex;
          gap: 4px;
          font-size: 20px;
          line-height: 1;
        }
        .typing-indicator-bubble .dot {
          animation: wave 1.2s infinite;
          opacity: 0.3;
          color: var(--primary);
        }
        .typing-indicator-bubble .dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-indicator-bubble .dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes wave {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.3; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>

      <div class="ai-layout animate-in">
        <!-- Main Chat Box -->
        <div class="card ai-chat-card">
          <!-- Conversation History Log -->
          <div class="ai-chat-log" id="ai-chat-log">
            <!-- Initial Greeting -->
            <div class="ai-message-bubble ai">
              <div class="ai-msg-avatar">🤖</div>
              <div class="ai-msg-content">
                <div class="ai-msg-sender">JMPL AI</div>
                <div class="ai-msg-text">
                  <p>Welcome back! I am your <strong>JMPL AI Assistant</strong>. 🔩</p>
                  <p>I have direct, real-time access to the JMPL database. You can ask me questions about batches, stages, part stock, monthly sales, or manufacturing losses.</p>
                  <p><em>Tip: You can use your voice by clicking the microphone button! 🎤</em></p>
                  <p style="font-size: 11.5px; color: var(--text-muted); background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 6px; border: 1px dashed var(--border); margin-top: 10px; line-height: 1.4;">
                    🔑 <strong>Setup Required:</strong> If you get an authentication error, please get a free API key at <a href="https://aistudio.google.com/" target="_blank" style="color:var(--primary);text-decoration:underline;">Google AI Studio</a> and save it in the <strong>Gemini API Key</strong> input under settings on the right.
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <!-- suggestion chips -->
          <div class="ai-suggestions-container" id="ai-suggestions">
            <button class="ai-suggestion-chip" onclick="AIAgentModule.askSuggestion('How many active batches are in production right now?')">📦 Active Batches</button>
            <button class="ai-suggestion-chip" onclick="AIAgentModule.askSuggestion('Which stage has the highest total loss?')">📉 Loss Analysis</button>
            <button class="ai-suggestion-chip" onclick="AIAgentModule.askSuggestion('Check store inventory and list low stock items.')">⚠️ Low Stock Check</button>
            <button class="ai-suggestion-chip" onclick="AIAgentModule.askSuggestion('Provide a summary of recent sales.')">💸 Sales Summary</button>
          </div>

          <!-- Query Input Controls -->
          <div class="ai-input-bar">
            <button type="button" class="btn btn-secondary mic-btn" id="ai-mic-btn" onclick="AIAgentModule.toggleListening()" style="width: 42px; height: 42px; padding:0; border-radius:50%; font-size:18px; display:flex; align-items:center; justify-content:center;" title="Voice input (Speech to Text)">
              🎤
            </button>
            <input type="text" id="ai-query-input" class="form-control" style="flex:1;" placeholder="Ask JMPL AI a question... (e.g. 'Where is batch JMPL-00001?')" onkeydown="if(event.key === 'Enter') AIAgentModule.sendMessage()">
            <button type="button" class="btn btn-primary" onclick="AIAgentModule.sendMessage()" style="padding:10px 18px;">
              Send 🚀
            </button>
          </div>
        </div>

        <!-- Sidebar / Alerts and Settings -->
        <div class="ai-sidebar-card card card-body">
          <h3 style="font-size: 15px; font-weight: 700; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 6px;">⚙️ AI Settings</h3>
          
          <!-- Text to Speech toggle -->
          <div class="form-group" style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 16px;">
            <label class="form-label" style="margin:0; cursor:pointer;" for="voice-toggle-chk">🔊 Voice Output (Read replies)</label>
            <input type="checkbox" id="voice-toggle-chk" style="width: 18px; height: 18px; cursor:pointer;" ${voiceOutputEnabled ? 'checked' : ''} onchange="AIAgentModule.toggleVoice(this.checked)">
          </div>

          <!-- AI Model Selection -->
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label">AI Model</label>
            <select id="ai-model-select" class="form-control form-control-sm" onchange="AIAgentModule.changeModel(this.value)">
              <option value="auto" ${selectedModel === 'auto' ? 'selected' : ''}>⚡ Auto (Active: Gemini 3.5 Flash)</option>
              <option value="gemini-3.5-flash" ${selectedModel === 'gemini-3.5-flash' ? 'selected' : ''}>🚀 Gemini 3.5 Flash (Super Fast & Smart)</option>
              <option value="gemini-3.5-flash-lite" ${selectedModel === 'gemini-3.5-flash-lite' ? 'selected' : ''}>⚡ Gemini 3.5 Flash-Lite</option>
              <option value="gemini-3.6-flash" ${selectedModel === 'gemini-3.6-flash' ? 'selected' : ''}>🌟 Gemini 3.6 Flash</option>
              <option value="gemini-3.1-flash-lite" ${selectedModel === 'gemini-3.1-flash-lite' ? 'selected' : ''}>⚡ Gemini 3.1 Flash-Lite</option>
              <option value="gemini-2.0-flash" ${selectedModel === 'gemini-2.0-flash' ? 'selected' : ''}>🤖 Gemini 2.0 Flash</option>
            </select>
            <p style="font-size:10.5px; color:var(--text-muted); margin-top:4px;">Auto connects directly to active supported Gemini models.</p>
          </div>

          <!-- Custom API Key override -->
          <div class="form-group">
            <label class="form-label">Gemini API Key</label>
            <div style="position:relative; display:flex; gap:6px;">
              <input type="password" id="custom-api-key" class="form-control form-control-sm" placeholder="Default Active" value="${customApiKey}">
              <button class="btn btn-secondary btn-xs" onclick="AIAgentModule.saveApiKey()" style="padding: 0 10px;">Save</button>
            </div>
            <p style="font-size:10.5px; color:var(--text-muted); margin-top:4px;">Leave blank to use pre-configured system key.</p>
          </div>

          <!-- Alert Center -->
          <h3 style="font-size: 15px; font-weight: 700; margin-top: 24px; margin-bottom: 8px; border-bottom: 1px solid var(--border); padding-bottom: 6px;">⚠️ Proactive Alert Center</h3>
          <div class="ai-alert-center" id="ai-alert-center">
            <!-- Filled dynamically -->
          </div>
        </div>
      </div>
    `;

    renderAlertCenter();
    initSpeechRecognition();
  }

  // ── Speech Synthesis Output ────────────────────────────────
  function speakText(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // Terminate ongoing speech

    // Remove markdown formats for cleaner text reading
    let clean = text
      .replace(/\*\*(.*?)\*\*/g, '$1') // Asterisk bolds
      .replace(/\*(.*?)\*/g, '$1') // Asterisk italics
      .replace(/#+\s+(.*)/g, '$1') // Heading prefixes
      .replace(/\|/g, ' ') // Table lines
      .replace(/-{3,}/g, '') // Row separators
      .replace(/<\/?[^>]+(>|$)/g, ""); // HTML tags

    // Fetch pleasant Indian or English speaker voice
    const utterance = new SpeechSynthesisUtterance(clean.substring(0, 400)); // Limit length
    const voices = window.speechSynthesis.getVoices();
    const selectedVoice = voices.find(v => v.lang.includes('en-IN') || v.lang.includes('en-GB') || v.lang.includes('en-US'));
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    
    window.speechSynthesis.speak(utterance);
  }

  // ── Speech Recognition Input ──────────────────────────────
  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Web Speech API recognition not supported in this browser.");
      return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-IN';
    recognition.interimResults = false;

    recognition.onstart = () => {
      isListening = true;
      updateMicButton();
    };

    recognition.onerror = (e) => {
      console.error("Speech recognition error", e.error);
      isListening = false;
      updateMicButton();
      if (e.error !== 'no-speech') {
        showToast("Speech recognition error: " + e.error, "error");
      }
    };

    recognition.onend = () => {
      isListening = false;
      updateMicButton();
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const input = document.getElementById('ai-query-input');
      if (input) {
        input.value = transcript;
        sendMessage();
      }
    };
  }

  function toggleListening() {
    if (!recognition) {
      initSpeechRecognition();
    }
    if (!recognition) {
      showToast("Speech recognition is not supported in your browser.", "error");
      return;
    }

    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
    }
  }

  function updateMicButton() {
    const btn = document.getElementById('ai-mic-btn');
    if (!btn) return;
    if (isListening) {
      btn.classList.add('recording');
      btn.innerHTML = '🛑';
      btn.title = "Listening... Click to stop";
    } else {
      btn.classList.remove('recording');
      btn.innerHTML = '🎤';
      btn.title = "Click to speak";
    }
  }

  // ── UI Actions ─────────────────────────────────────────────
  function toggleVoice(val) {
    voiceOutputEnabled = val;
    if (!val && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  async function saveApiKey() {
    const input = document.getElementById('custom-api-key');
    if (!input) return;
    const keyVal = input.value.trim();
    setCustomApiKey(keyVal);

    if (!keyVal) {
      showToast("Reset to default system Gemini key", "info");
      return;
    }

    // Quick validation check
    const btn = event?.target;
    const origText = btn ? btn.textContent : 'Save';
    if (btn) { btn.disabled = true; btn.textContent = 'Testing...'; }

    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${keyVal}`);
      if (resp.ok) {
        showToast("✅ Gemini API Key connected and verified successfully!", "success");
      } else {
        const errJson = await resp.json().catch(() => ({}));
        const msg = errJson.error?.message || "Invalid or restricted API Key";
        showToast("⚠️ Key saved, but Google returned: " + msg, "warning");
      }
    } catch (e) {
      showToast("Gemini key saved", "success");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = origText; }
    }
  }

  function askSuggestion(prompt) {
    const input = document.getElementById('ai-query-input');
    if (input) {
      input.value = prompt;
      sendMessage();
    }
  }

  // ── Data Compiler & AI Prompts ─────────────────────────────
  function compileDataContext() {
    const parts = DB.Master.all();
    const batches = DB.Batches.all();
    const losses = DB.LossTracker.all();
    const sales = DB.Sales.all();
    const storeInv = DB.StoreInventory.allParts();

    // Active batches info
    const activeBatches = batches.filter(b => b.status === 'active').map(b => {
      const stageRecs = DB.StageRecords.byBatch(b.id);
      const lastRec = stageRecs.length ? stageRecs[stageRecs.length - 1] : null;
      return {
        batchNo: b.batchNo,
        partNo: parts.find(p=>p.id === b.partId)?.partNo || '—',
        jmrefNo: b.jmrefNo,
        currentStage: b.currentStage,
        type: b.productionType || 'Inhouse',
        initialQty: b.initialQty,
        currentQty: lastRec ? lastRec.outputQty : b.initialQty,
        createdAt: b.createdAt
      };
    });

    // Store inventory summary
    const storeSummary = storeInv.map(p => ({
      partNo: p.partNo,
      jmrefNo: p.jmrefNo,
      available: p.available
    }));

    // Losses grouped by stage
    const lossesByStage = {};
    losses.forEach(l => {
      lossesByStage[l.stage] = (lossesByStage[l.stage] || 0) + (l.lossQty || 0);
    });

    // Sales (last 10 transactions)
    const recentSales = sales.sort((a,b) => (b.saleDate||'').localeCompare(a.saleDate||'')).slice(0, 10).map(s => ({
      jmrefNo: s.jmrefNo,
      qty: s.qty,
      date: s.saleDate
    }));

    return {
      systemInfo: {
        currentTime: new Date().toISOString(),
        totalRegisteredParts: parts.length,
        activeBatchesInPipeline: activeBatches.length
      },
      partsList: parts.map(p => ({ partNo: p.partNo, jmrefNo: p.jmrefNo, description: p.description })),
      activeBatches,
      storeInventory: storeSummary,
      totalLossesByStage: lossesByStage,
      recentSales
    };
  }

  // ── Alert Center Engine ────────────────────────────────────
  function getProactiveAlerts() {
    const alerts = [];
    const batches = DB.Batches.all().filter(b => b.status === 'active');
    const storeInv = DB.StoreInventory.allParts();
    const parts = DB.Master.all();
    const now = new Date();

    // 1. Check for stuck batches (> 7 days active)
    batches.forEach(b => {
      const created = new Date(b.createdAt);
      const diffDays = Math.ceil((now - created) / (1000 * 60 * 60 * 24));
      if (diffDays > 7) {
        alerts.push({
          type: 'danger',
          title: `Stuck Batch: ${b.batchNo}`,
          message: `In stage <strong>"${b.currentStage.toUpperCase()}"</strong> for ${diffDays} days. Needs check.`
        });
      }
    });

    // 2. Check for low/out-of-stock items
    storeInv.forEach(p => {
      if (p.available === 0) {
        alerts.push({
          type: 'danger',
          title: `Out of Stock: ${p.jmrefNo}`,
          message: `Part ${p.partNo} is completely out of stock.`
        });
      } else if (p.available < 10) {
        alerts.push({
          type: 'warning',
          title: `Low Stock: ${p.jmrefNo}`,
          message: `Only <strong>${p.available}</strong> units left in Store.`
        });
      }
    });

    // 3. High loss batches (> 15% batch size)
    const losses = DB.LossTracker.all();
    const batchLosses = {};
    losses.forEach(l => {
      batchLosses[l.batchId] = (batchLosses[l.batchId] || 0) + (l.lossQty || 0);
    });

    Object.keys(batchLosses).forEach(batchId => {
      const batch = DB.Batches.find(batchId);
      if (batch) {
        const lossQty = batchLosses[batchId];
        const percent = (lossQty / batch.initialQty) * 100;
        if (percent > 15) {
          alerts.push({
            type: 'warning',
            title: `High Loss: ${batch.batchNo}`,
            message: `Loss is <strong>${lossQty}</strong> units (${percent.toFixed(1)}% of batch).`
          });
        }
      }
    });

    return alerts;
  }

  function renderAlertCenter() {
    const el = document.getElementById('ai-alert-center');
    if (!el) return;

    const alerts = getProactiveAlerts();
    if (alerts.length === 0) {
      el.innerHTML = `<div class="ai-alert-empty">👍 No warnings or stuck batches detected in the system!</div>`;
      return;
    }

    el.innerHTML = alerts.map(a => `
      <div class="ai-alert-card ${a.type}">
        <div class="ai-alert-title">${a.title}</div>
        <div>${a.message}</div>
      </div>
    `).join('');
  }

  // ── Gemini Communication ──────────────────────────────────
  async function executeGeminiRequest(apiKey, modelName, contents, systemInstruction) {
    const cleanModel = modelName.replace(/^models\//, '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;
    
    const payload = {
      contents: contents,
      generationConfig: {
        temperature: 0.15
      }
    };

    if (systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    return response;
  }

  async function callGeminiWithAutoFallback(apiKey, contents, systemInstruction) {
    const modelsToTry = [];
    if (selectedModel && selectedModel !== 'auto') {
      modelsToTry.push(selectedModel);
    }
    CANDIDATE_MODELS.forEach(m => {
      if (!modelsToTry.includes(m)) modelsToTry.push(m);
    });

    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const response = await executeGeminiRequest(apiKey, model, contents, systemInstruction);
        if (response.ok) {
          const resJson = await response.json();
          const reply = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
          if (reply) {
            console.log(`[JMPL AI] Successfully connected using model: ${model}`);
            return { ok: true, text: reply, modelUsed: model };
          }
        }

        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson.error?.message || response.statusText || 'Unknown error';
        lastError = new Error(errMsg);

        // If error is 404 / model not supported for generateContent, continue to next candidate
        if (response.status === 404 || errMsg.toLowerCase().includes('not found') || errMsg.toLowerCase().includes('not supported') || errMsg.toLowerCase().includes('call modelservice.listmodels')) {
          console.warn(`[JMPL AI] Model ${model} not available (${errMsg}), trying next candidate model...`);
          continue;
        }

        // If error is authentication or invalid key, stop immediately
        if (response.status === 401 || response.status === 403 || errMsg.toLowerCase().includes('api key') || errMsg.toLowerCase().includes('invalid authentication')) {
          throw new Error("Authentication Error: The Gemini API Key is invalid, restricted, or expired. Please check your API key in the AI Settings panel.");
        }
      } catch (err) {
        lastError = err;
        if (err.message && (err.message.toLowerCase().includes('api key') || err.message.toLowerCase().includes('authentication'))) {
          throw err;
        }
      }
    }

    // Dynamic discovery fallback: query ListModels API
    try {
      console.log("[JMPL AI] Attempting dynamic model discovery via ListModels...");
      const listResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (listResp.ok) {
        const listData = await listResp.json();
        const available = (listData.models || [])
          .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
          .map(m => m.name.replace(/^models\//, ''));

        if (available.length > 0) {
          const dynamicModel = available[0];
          console.log(`[JMPL AI] Discovered supported model: ${dynamicModel}, executing request...`);
          const dynResp = await executeGeminiRequest(apiKey, dynamicModel, contents, systemInstruction);
          if (dynResp.ok) {
            const dynJson = await dynResp.json();
            const reply = dynJson.candidates?.[0]?.content?.parts?.[0]?.text;
            if (reply) {
              return { ok: true, text: reply, modelUsed: dynamicModel };
            }
          }
        }
      }
    } catch (e) {
      console.warn("[JMPL AI] Dynamic discovery failed:", e);
    }

    throw lastError || new Error("No supported Gemini model found for this API key. Please check your API key permissions in Google AI Studio.");
  }

  async function sendMessage() {
    const input = document.getElementById('ai-query-input');
    if (!input) return;
    const query = input.value.trim();
    if (!query) return;

    input.value = '';

    // Append user query to log
    appendMessage('user', query);
    
    // Add to chat history
    chatHistory.push({ role: 'user', parts: [{ text: query }] });
    if (chatHistory.length > 16) chatHistory.shift();

    const typingId = appendTypingIndicator();

    try {
      const apiKey = getApiKey();
      if (!apiKey) {
        throw new Error("API Key is missing. Enter a valid Gemini API Key in the settings sidebar.");
      }

      const context = compileDataContext();
      const systemInstruction = `You are JMPL AI, the intelligent virtual assistant for Janani Mouldings Pvt. Ltd. (Rubber O-Ring Manufacturing).
You have access to the live JMPL database state in JSON format.
Analyze the data and answer the user's queries accurately, clearly, and concisely.
Always format your response using professional Markdown. If the user asks for reports, lists, or comparisons, use clean Markdown tables.
Be proactive: if you notice critical issues (like batches stuck in a stage for more than 7 days, low stock of active items, or abnormally high losses in a particular stage), point them out in your answer or warn the user.
Use a helpful, professional tone.

Here is the live JMPL database context:
<DATA>
${JSON.stringify(context, null, 2)}
</DATA>
`;

      const result = await callGeminiWithAutoFallback(apiKey, chatHistory, systemInstruction);

      removeTypingIndicator(typingId);

      const aiReply = result.text || "I was unable to formulate a response.";

      appendMessage('model', aiReply);
      
      // Add AI reply to history
      chatHistory.push({ role: 'model', parts: [{ text: aiReply }] });
      if (chatHistory.length > 16) chatHistory.shift();

      if (voiceOutputEnabled) {
        speakText(aiReply);
      }

      // Re-evaluate alert center in case data updated
      renderAlertCenter();

    } catch (e) {
      removeTypingIndicator(typingId);
      appendMessage('model', `⚠️ Error: ${e.message}`, true);
    }
  }

  // ── Render Utilities ──────────────────────────────────────
  function appendMessage(role, text, isError = false) {
    const log = document.getElementById('ai-chat-log');
    if (!log) return;

    // Remove suggestions chip bar on first message to clean up layout
    const suggs = document.getElementById('ai-suggestions');
    if (suggs && role === 'user') {
      suggs.style.display = 'none';
    }

    const bubble = document.createElement('div');
    bubble.className = `ai-message-bubble ${role === 'user' ? 'user' : 'ai'}`;

    const icon = role === 'user' ? '👤' : '🤖';
    const parsedText = role === 'user' ? text : markdownToHtml(text);

    bubble.innerHTML = `
      <div class="ai-msg-avatar">${icon}</div>
      <div class="ai-msg-content">
        <div class="ai-msg-sender">${role === 'user' ? 'You' : 'JMPL AI'}</div>
        <div class="ai-msg-text ${isError ? 'text-danger' : ''}">${parsedText}</div>
      </div>
    `;

    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
  }

  function appendTypingIndicator() {
    const log = document.getElementById('ai-chat-log');
    if (!log) return null;

    const id = 'typing-' + Date.now();
    const bubble = document.createElement('div');
    bubble.className = 'ai-message-bubble ai typing-indicator-bubble';
    bubble.id = id;

    bubble.innerHTML = `
      <div class="ai-msg-avatar">🤖</div>
      <div class="ai-msg-content">
        <div class="ai-msg-sender">JMPL AI</div>
        <div class="ai-msg-text">
          <span class="dot">.</span>
          <span class="dot">.</span>
          <span class="dot">.</span>
        </div>
      </div>
    `;

    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
    return id;
  }

  function removeTypingIndicator(id) {
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  // ── Lightweight Markdown to HTML Parser ─────────────────────
  function markdownToHtml(md) {
    if (!md) return '';
    let html = md;

    // Escape raw bracket inputs
    html = html.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Parse tables
    const lines = html.split('\n');
    let inTable = false;
    let tableHtml = '';
    const newLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('|') && line.endsWith('|')) {
        if (!inTable) {
          inTable = true;
          tableHtml = '<div class="ai-table-wrap"><table><thead>';
        }

        const cells = line.split('|').slice(1, -1).map(c => c.trim());

        if (lines[i + 1] && lines[i + 1].includes('|---')) {
          tableHtml += '<tr>' + cells.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
          i++; // Skip delimiter line
        } else {
          tableHtml += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
        }
      } else {
        if (inTable) {
          inTable = false;
          tableHtml += '</tbody></table></div>';
          newLines.push(tableHtml);
        }
        newLines.push(lines[i]);
      }
    }
    if (inTable) {
      tableHtml += '</tbody></table></div>';
      newLines.push(tableHtml);
    }

    html = newLines.join('\n');

    // Headers with strong dark contrast
    html = html.replace(/^### (.*$)/gim, '<h4 style="margin-top:12px; margin-bottom:6px; font-weight:700; color:#0f172a;">$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3 style="margin-top:16px; margin-bottom:8px; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:4px; color:#0f172a;">$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2 style="margin-top:20px; margin-bottom:10px; font-weight:800; color:#0f172a;">$1</h2>');

    // Bold / Italic
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight:750; color:inherit;">$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Inline Code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Lists
    html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, ''); // Join consecutive ul items

    // Line breaks
    html = html.replace(/\n\n/g, '<br><br>');
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  return {
    render,
    toggleListening,
    sendMessage,
    toggleVoice,
    saveApiKey,
    changeModel,
    askSuggestion
  };
})();
