// ============================================================
// scanner.js — Reusable QR Code Camera Scanner Module
// ============================================================
const Scanner = (() => {
  let html5QrcodeScanner = null;

  function start(inputId, callback) {
    if (typeof Html5Qrcode === 'undefined') {
      showToast('Scanner library not loaded. Please check your internet connection.', 'error');
      return;
    }

    const modal = document.getElementById('scanner-modal-overlay');
    const qrRegion = document.getElementById('scanner-qr-reader');
    if (!modal || !qrRegion) {
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

  return { start, stop };
})();
