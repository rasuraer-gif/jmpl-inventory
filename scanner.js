// ============================================================
// scanner.js — Reusable QR Code Camera Scanner Module
// ============================================================
const Scanner = (() => {
  let html5QrcodeScanner = null;
  let activeInputId = null;
  let activeCallback = null;
  let lastScannedText = '';
  let lastScanTime = 0;

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
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

  function start(inputId, callback) {
    activeInputId = inputId;
    activeCallback = callback;
    lastScannedText = '';
    lastScanTime = 0;

    if (typeof Html5Qrcode === 'undefined') {
      showToast('Scanner library not loaded. Please check your internet connection.', 'error');
      return;
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

    html5QrcodeScanner = new Html5Qrcode("scanner-qr-reader");
    const config = { fps: 10, qrbox: { width: 220, height: 220 } };

    html5QrcodeScanner.start(
      { facingMode: "environment" },
      config,
      (decodedText) => handleDecoded(decodedText),
      (errorMessage) => {}
    ).catch(err => {
      console.warn("Back camera access failed, trying default camera...", err);
      html5QrcodeScanner.start(
        { facingMode: "user" },
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
