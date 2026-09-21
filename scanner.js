// ============================================================
// scanner.js — Reusable QR Code Camera Scanner Module
// ============================================================
const Scanner = (() => {
  let html5QrcodeScanner = null;
  let activeInputId = null;
  let activeCallback = null;
  let lastScannedText = '';
  let lastScanTime = 0;
  let _audioCtx = null;
  let _inactivityTimer = null;
  let _isSleeping = false;

  function resetInactivityTimer() {
    if (_inactivityTimer) clearTimeout(_inactivityTimer);
    if (_isSleeping) {
      resumeFromSleep();
    }
    _inactivityTimer = setTimeout(() => {
      enterSleepMode();
    }, 60000); // Auto-sleep after 60 seconds of inactivity
  }

  function enterSleepMode() {
    if (!html5QrcodeScanner || _isSleeping) return;
    _isSleeping = true;
    try {
      if (html5QrcodeScanner.isScanning) {
        html5QrcodeScanner.pause(true);
      }
    } catch(e) {}

    const readerEl = document.getElementById('scanner-qr-reader');
    if (readerEl) {
      let sleepOverlay = document.getElementById('scanner-sleep-overlay');
      if (!sleepOverlay) {
        sleepOverlay = document.createElement('div');
        sleepOverlay.id = 'scanner-sleep-overlay';
        sleepOverlay.style.cssText = 'position:absolute; inset:0; background:rgba(15,23,42,0.85); display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; z-index:10; cursor:pointer; text-align:center; padding:16px; border-radius:12px; backdrop-filter:blur(2px);';
        sleepOverlay.innerHTML = `
          <div style="font-size:32px; margin-bottom:8px;">💤</div>
          <div style="font-weight:700; font-size:14px; margin-bottom:4px;">Scanner Paused (Battery Saver)</div>
          <div style="font-size:12px; color:#94a3b8; margin-bottom:12px;">Tap anywhere to resume scanning</div>
          <button class="btn btn-primary btn-sm" style="pointer-events:none; padding:4px 16px;">▶ Resume Camera</button>
        `;
        sleepOverlay.onclick = (e) => {
          e.stopPropagation();
          resetInactivityTimer();
        };
        readerEl.style.position = 'relative';
        readerEl.appendChild(sleepOverlay);
      }
    }
  }

  function resumeFromSleep() {
    _isSleeping = false;
    const sleepOverlay = document.getElementById('scanner-sleep-overlay');
    if (sleepOverlay) sleepOverlay.remove();
    try {
      if (html5QrcodeScanner) {
        html5QrcodeScanner.resume();
      }
    } catch(e) {}
  }

  function playBeep() {
    try {
      if (!_audioCtx || _audioCtx.state === 'closed') {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (_audioCtx.state === 'suspended') {
        _audioCtx.resume();
      }
      const ctx = _audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch(e) {}
  }

  function handleDecoded(decodedText) {
    resetInactivityTimer();
    const now = Date.now();
    if (decodedText === lastScannedText && (now - lastScanTime) < 1500) {
      return; // Debounce rapid duplicate reads of the exact same code
    }
    lastScannedText = decodedText;
    lastScanTime = now;

    playBeep();

    const input = document.getElementById(activeInputId);
    if (input) {
      input.value = decodedText;
    }
    if (typeof activeCallback === 'function') {
      activeCallback(decodedText);
    }

    const isContinuous = document.getElementById('scanner-continuous-toggle')?.checked;
    if (isContinuous) {
      showToast('⚡ Scanned: ' + decodedText, 'success');
      const readerEl = document.getElementById('scanner-qr-reader');
      if (readerEl) {
        readerEl.style.borderColor = '#10b981';
        setTimeout(() => { if (readerEl) readerEl.style.borderColor = 'var(--border)'; }, 400);
      }
    } else {
      stop();
      showToast('QR Code scanned successfully: ' + decodedText, 'success');
    }
  }

  async function start(inputId, callback) {
    activeInputId = inputId;
    activeCallback = callback;
    lastScannedText = '';
    lastScanTime = 0;

    if (typeof Html5Qrcode === 'undefined') {
      try {
        if (typeof showToast === 'function') showToast('Loading camera scanner...', 'info');
        if (typeof loadScriptAsync === 'function') {
          await loadScriptAsync('https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js');
        } else {
          await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
            s.onload = res;
            s.onerror = rej;
            document.head.appendChild(s);
          });
        }
      } catch (err) {
        showToast('Scanner library not loaded. Please check your internet connection.', 'error');
        return;
      }
    }

    let modal = document.getElementById('scanner-modal-overlay');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal-overlay hidden';
      modal.id = 'scanner-modal-overlay';
      modal.style.zIndex = '2000';
      modal.innerHTML = `
        <div class="modal modal-sm" style="max-width: 420px; border-radius: 16px;">
          <div class="modal-header">
            <h3>📷 Scan QR Code</h3>
            <button class="modal-close" onclick="Scanner.stop()">✕</button>
          </div>
          <div class="modal-body" style="padding: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div id="scanner-qr-reader" style="width: 100%; max-width: 320px; border-radius: 12px; overflow: hidden; background: #000; border: 2px solid var(--border); transition: border-color 0.2s;"></div>
            <p style="font-size: 12.5px; color: var(--text-secondary); margin-top: 12px; text-align: center; line-height: 1.4;">Align the JMPL QR Code sticker inside the camera viewfinder frame to scan.</p>
            
            <div style="margin-top: 12px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; background: rgba(59, 130, 246, 0.08); padding: 8px 12px; border-radius: 8px;">
              <label style="font-size: 12px; font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="scanner-continuous-toggle" style="cursor: pointer;">
                ⚡ Continuous Rapid Scan Mode
              </label>
            </div>

            <div style="margin-top: 14px; width: 100%; border-top: 1px solid var(--border); padding-top: 14px; display: flex; flex-direction: column; gap: 8px;">
              <label style="font-size: 12px; font-weight: 600; color: var(--text);">Or type batch number manually:</label>
              <div style="display: flex; gap: 8px; width: 100%;">
                <input type="text" id="scanner-manual-input" class="form-control form-control-sm" placeholder="Enter batch number..." style="margin: 0; flex: 1;" onkeydown="if(event.key==='Enter') Scanner.submitManual()">
                <button class="btn btn-primary btn-sm" onclick="Scanner.submitManual()" style="padding: 4px 12px; height: 32px;">Search</button>
              </div>
            </div>
          </div>
          <div class="modal-footer" style="justify-content: center;">
            <button class="btn btn-secondary" onclick="Scanner.stop()">Done / Close</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }

    const qrRegion = document.getElementById('scanner-qr-reader');
    if (!qrRegion) {
      showToast('Scanner UI components not found in document.', 'error');
      return;
    }

    modal.classList.remove('hidden');
    
    // Clear and focus manual input
    const manualInp = document.getElementById('scanner-manual-input');
    if (manualInp) {
      manualInp.value = '';
      setTimeout(() => manualInp.focus(), 150);
    }
    
    // Reset viewfinder HTML
    qrRegion.innerHTML = '';
    qrRegion.style.background = '#000';

    if (html5QrcodeScanner) {
      try { html5QrcodeScanner.clear(); } catch(e) {}
    }

    resetInactivityTimer();
    modal.onclick = () => resetInactivityTimer();
    modal.ontouchstart = () => resetInactivityTimer();

    html5QrcodeScanner = new Html5Qrcode("scanner-qr-reader");
    const config = { 
      fps: 15, 
      qrbox: { width: 240, height: 240 },
      aspectRatio: 1.0,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true }
    };
    const cameraConstraints = {
      facingMode: "environment",
      width: { ideal: 1280 },
      height: { ideal: 720 }
    };

    html5QrcodeScanner.start(
      cameraConstraints,
      config,
      (decodedText) => handleDecoded(decodedText),
      (errorMessage) => {}
    ).catch(err => {
      console.warn("Back camera access failed, trying default camera...", err);
      html5QrcodeScanner.start(
        { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        config,
        (decodedText) => handleDecoded(decodedText),
        (error) => {}
      ).catch(fallbackErr => {
        console.error("Camera scanner initialization failed completely:", fallbackErr);
        showToast('Camera unavailable. You can enter batch number manually.', 'warning');
        qrRegion.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:180px; padding:20px; color:#f43f5e; font-weight:700; text-align:center; font-size:13px; box-sizing:border-box;">⚠️ Camera Unavailable<span style="font-weight:400; font-size:11.5px; color:var(--text-secondary); margin-top:8px; display:block; line-height:1.4;">Camera access is blocked or unavailable. Please type the batch number manually below.</span></div>`;
      });
    });
  }

  function stop() {
    if (_inactivityTimer) {
      clearTimeout(_inactivityTimer);
      _inactivityTimer = null;
    }
    _isSleeping = false;
    const sleepOverlay = document.getElementById('scanner-sleep-overlay');
    if (sleepOverlay) sleepOverlay.remove();

    const modal = document.getElementById('scanner-modal-overlay');
    if (modal) modal.classList.add('hidden');

    if (html5QrcodeScanner) {
      const isScanning = html5QrcodeScanner.isScanning;
      if (isScanning) {
        html5QrcodeScanner.stop().then(() => {
          html5QrcodeScanner.clear();
          html5QrcodeScanner = null;
        }).catch(err => {
          console.warn("Error stopping scanner:", err);
          try { html5QrcodeScanner.clear(); } catch(e) {}
          html5QrcodeScanner = null;
        });
      } else {
        try { html5QrcodeScanner.clear(); } catch(e) {}
        html5QrcodeScanner = null;
      }
    }
  }

  function submitManual() {
    const val = (document.getElementById('scanner-manual-input')?.value || '').trim();
    if (!val) {
      showToast('Please enter a valid batch number', 'warning');
      return;
    }
    handleDecoded(val);
    stop();
  }

  return { start, stop, submitManual };
})();
