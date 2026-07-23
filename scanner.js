// ============================================================
// scanner.js — Reusable QR Code Camera Scanner Module
// ============================================================
const Scanner = (() => {
  let html5QrcodeScanner = null;
  let activeInputId = null;
  let activeCallback = null;

  function start(inputId, callback) {
    activeInputId = inputId;
    activeCallback = callback;

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
        <div class="modal modal-sm" style="max-width: 400px; border-radius: 16px;">
          <div class="modal-header">
            <h3>📷 Scan QR Code</h3>
            <button class="modal-close" onclick="Scanner.stop()">✕</button>
          </div>
          <div class="modal-body" style="padding: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div id="scanner-qr-reader" style="width: 100%; max-width: 320px; border-radius: 12px; overflow: hidden; background: #000; border: 2px solid var(--border);"></div>
            <p style="font-size: 12.5px; color: var(--text-secondary); margin-top: 14px; text-align: center; line-height: 1.4;">Align the JMPL QR Code sticker inside the camera viewfinder frame to scan.</p>
            <div style="margin-top: 16px; width: 100%; border-top: 1px solid var(--border); padding-top: 16px; display: flex; flex-direction: column; gap: 8px;">
              <label style="font-size: 12px; font-weight: 600; color: var(--text);">Or type batch number manually:</label>
              <div style="display: flex; gap: 8px; width: 100%;">
                <input type="text" id="scanner-manual-input" class="form-control form-control-sm" placeholder="Enter batch number..." style="margin: 0; flex: 1;" onkeydown="if(event.key==='Enter') Scanner.submitManual()">
                <button class="btn btn-primary btn-sm" onclick="Scanner.submitManual()" style="padding: 4px 12px; height: 32px;">Search</button>
              </div>
            </div>
          </div>
          <div class="modal-footer" style="justify-content: center;">
            <button class="btn btn-secondary" onclick="Scanner.stop()">Cancel / Close</button>
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
    
    // Clear any previous instances
    if (html5QrcodeScanner) {
      try { html5QrcodeScanner.clear(); } catch(e) {}
    }

    // Initialize Html5Qrcode
    html5QrcodeScanner = new Html5Qrcode("scanner-qr-reader");

    const config = { fps: 10, qrbox: { width: 220, height: 220 } };

    // Try starting with back camera first
    html5QrcodeScanner.start(
      { facingMode: "environment" },
      config,
      (decodedText) => {
        // Success callback
        const input = document.getElementById(inputId);
        if (input) {
          input.value = decodedText;
        }
        if (typeof callback === 'function') {
          callback(decodedText);
        }
        stop();
        showToast('QR Code scanned successfully: ' + decodedText, 'success');
      },
      (errorMessage) => {
        // Scanning feedback (ignored noise)
      }
    ).catch(err => {
      console.warn("Back camera access failed, trying default camera...", err);
      // Fallback to any available camera (like front camera)
      html5QrcodeScanner.start(
        { facingMode: "user" },
        config,
        (decodedText) => {
          const input = document.getElementById(inputId);
          if (input) input.value = decodedText;
          if (typeof callback === 'function') callback(decodedText);
          stop();
          showToast('QR Code scanned successfully: ' + decodedText, 'success');
        },
        (error) => {}
      ).catch(fallbackErr => {
        console.error("Camera scanner initialization failed completely:", fallbackErr);
        showToast('Camera access blocked or unavailable: ' + fallbackErr.message, 'error');
        stop();
      });
    });
  }

  function stop() {
    const modal = document.getElementById('scanner-modal-overlay');
    if (modal) modal.classList.add('hidden');

    if (html5QrcodeScanner) {
      html5QrcodeScanner.stop().then(() => {
        html5QrcodeScanner.clear();
        html5QrcodeScanner = null;
      }).catch(err => {
        console.warn("Error stopping scanner:", err);
        try { html5QrcodeScanner.clear(); } catch(e) {}
        html5QrcodeScanner = null;
      });
    }
  }

  function submitManual() {
    const val = (document.getElementById('scanner-manual-input')?.value || '').trim();
    if (!val) {
      showToast('Please enter a valid batch number', 'warning');
      return;
    }
    const input = document.getElementById(activeInputId);
    if (input) {
      input.value = val;
    }
    if (typeof activeCallback === 'function') {
      activeCallback(val);
    }
    stop();
  }

  return { start, stop, submitManual };
})();
