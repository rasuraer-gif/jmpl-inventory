// ============================================================
// ai-agent.js — JMPL AI Assistant Module
// Voice-enabled Google Gemini AI Agent with Real-Time DB Context
// ============================================================

const AIAgentModule = (() => {
  let chatHistory = []; // Stores conversation history: { role: 'user'|'model', parts: [{ text: string }] }
  let voiceOutputEnabled = true;
  let customApiKey = localStorage.getItem('jmpl_gemini_key') || '';
  let recognition = null;
  let isListening = false;

  function getApiKey() {
    return customApiKey || JMPL_CONFIG.geminiApiKey;
  }

  function setCustomApiKey(key) {
    customApiKey = key.trim();
    localStorage.setItem('jmpl_gemini_key', customApiKey);
  }

  // ── Render Entrypoint ──────────────────────────────────────
  function render() {
    const el = document.getElementById('content');
    if (!el) return;

    el.innerHTML = `
      <style>
        .ai-layout {
          display: flex;
          gap: 24px;
          height: calc(100vh - 120px);
          min-height: 500px;
          max-height: 800px;
        }
        .ai-chat-card {
          flex: 7;
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .ai-sidebar-card {
          flex: 3;
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow-y: auto;
        }
        .ai-chat-log {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          border-bottom: 1px solid var(--border);
          background-color: rgba(15, 23, 42, 0.2);
        }
        .ai-message-bubble {
          display: flex;
          gap: 12px;
          max-width: 85%;
          align-self: flex-start;
          animation: fadeIn 0.25s ease-out;
        }
        .ai-message-bubble.user {
          align-self: flex-end;
          flex-direction: row-reverse;
        }
        .ai-msg-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background-color: var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
        }
        .ai-message-bubble.user .ai-msg-avatar {
          background-color: var(--primary);
        }
        .ai-msg-content {
          background-color: var(--card-bg);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 12px 16px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
        }
        .ai-message-bubble.user .ai-msg-content {
          background-color: rgba(99, 102, 241, 0.15);
          border-color: rgba(99, 102, 241, 0.3);
        }
        .ai-msg-sender {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          margin-bottom: 6px;
        }
        .ai-message-bubble.user .ai-msg-sender {
          text-align: right;
        }
        .ai-msg-text {
          font-size: 13.5px;
          line-height: 1.6;
          color: var(--text-main);
        }
        .ai-msg-text strong {
          color: #fff;
        }
        .ai-msg-text p {
          margin-bottom: 8px;
        }
        .ai-msg-text ul, .ai-msg-text ol {
          margin: 6px 0 10px 20px;
        }
        .ai-msg-text li {
          margin-bottom: 4px;
        }
        .ai-msg-text table {
          width: 100%;
          border-collapse: collapse;
          margin: 12px 0;
          font-size: 12.5px;
        }
        .ai-msg-text th, .ai-msg-text td {
          border: 1px solid var(--border);
          padding: 8px 10px;
          text-align: left;
        }
        .ai-msg-text th {
          background-color: rgba(255,255,255,0.03);
          font-weight: bold;
        }
        .ai-input-bar {
          display: flex;
          gap: 12px;
          padding: 16px;
          background-color: var(--card-bg);
          align-items: center;
        }
        .ai-suggestions-container {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 12px 16px;
          background-color: rgba(255,255,255,0.01);
          border-bottom: 1px solid var(--border);
        }
        .ai-suggestion-chip {
          background-color: var(--border);
          color: var(--text-main);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 16px;
          padding: 6px 14px;
          font-size: 11.5px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .ai-suggestion-chip:hover {
          background-color: var(--primary);
          color: white;
          border-color: var(--primary);
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
          background-color: rgba(245, 158, 11, 0.05);
          border-color: var(--warning);
          color: #fbbf24;
        }
        .ai-alert-card.danger {
          background-color: rgba(239, 68, 68, 0.05);
          border-color: var(--danger);
          color: #f87171;
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
          <div class="form-group" style="display:flex; align-items:center; justify-content:between; margin-bottom: 16px;">
            <label class="form-label" style="margin:0; cursor:pointer;" for="voice-toggle-chk">🔊 Voice Output (Read replies)</label>
            <input type="checkbox" id="voice-toggle-chk" style="width: 18px; height: 18px; cursor:pointer;" ${voiceOutputEnabled ? 'checked' : ''} onchange="AIAgentModule.toggleVoice(this.checked)">
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

  function saveApiKey() {
    const input = document.getElementById('custom-api-key');
    if (input) {
      setCustomApiKey(input.value);
      showToast("Gemini key settings updated", "success");
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
        throw new Error("API Key is missing. Enter a Gemini API Key in the settings sidebar.");
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

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          contents: chatHistory,
          generationConfig: {
            temperature: 0.15
          }
        })
      });

      removeTypingIndicator(typingId);

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error?.message || "Error communication with Gemini API.");
      }

      const resJson = await response.json();
      const aiReply = resJson.candidates?.[0]?.content?.parts?.[0]?.text || "I was unable to formulate a response.";

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
      if (line.startsWith('|')) {
        if (!inTable) {
          inTable = true;
          tableHtml = '<table><thead>';
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
          tableHtml += '</tbody></table>';
          newLines.push(tableHtml);
        }
        newLines.push(lines[i]);
      }
    }
    if (inTable) {
      tableHtml += '</tbody></table>';
      newLines.push(tableHtml);
    }

    html = newLines.join('\n');

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h4 style="margin-top:12px; margin-bottom:6px; font-weight:700;">$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3 style="margin-top:16px; margin-bottom:8px; font-weight:700; border-bottom:1px solid var(--border); padding-bottom:4px; color:#f8fafc;">$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2 style="margin-top:20px; margin-bottom:10px; font-weight:800; color:#fff;">$1</h2>');

    // Bold / Italic
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Lists
    html = html.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');
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
    askSuggestion
  };
})();
