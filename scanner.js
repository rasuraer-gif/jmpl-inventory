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
  let _isStarting = false;
  let _availableCameras = [];
  let _currentCameraIndex = 0;
  let _torchActive = false;

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
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (typeof activeCallback === 'function') {
      activeCallback(decodedText);
    }

    const isContinuous = document.getElementById('scanner-continuous-toggle')?.checked;
    if (isContinuous) {
      if (typeof showToast === 'function') showToast('⚡ Scanned: ' + decodedText, 'success');
      const readerEl = document.getElementById('scanner-qr-reader');
      if (readerEl) {
        readerEl.style.borderColor = '#10b981';
        setTimeout(() => { if (readerEl) readerEl.style.borderColor = 'var(--border)'; }, 400);
      }
    } else {
      stop();
      if (typeof showToast === 'function') showToast('QR Code scanned successfully: ' + decodedText, 'success');
    }
  }

  async function ensureLibraryLoaded() {
    if (typeof Html5Qrcode !== 'undefined') return true;
    
    // First attempt: local bundled script
    try {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'html5-qrcode.min.js';
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });
      if (typeof Html5Qrcode !== 'undefined') return true;
    } catch(e) {}

    // Second attempt: CDN fallback
    try {
      if (typeof showToast === 'function') showToast('Loading camera scanner...', 'info');
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });
      return typeof Html5Qrcode !== 'undefined';
    } catch (err) {
      return false;
    }
  }

  async function safelyStopScanner() {
    if (_inactivityTimer) {
      clearTimeout(_inactivityTimer);
      _inactivityTimer = null;
    }
    _isSleeping = false;
    _torchActive = false;

    if (html5QrcodeScanner) {
      try {
        if (html5QrcodeScanner.isScanning) {
          await html5QrcodeScanner.stop();
        }
      } catch (err) {
        console.warn("Scanner stop warning:", err);
      }
      try {
        html5QrcodeScanner.clear();
      } catch(e) {}
      html5QrcodeScanner = null;
    }
  }

  function setStatus(text, color = 'var(--text-secondary)') {
    const statusEl = document.getElementById('scanner-status-text');
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.style.color = color;
    }
  }

  function updateControlButtons() {
    const flipBtn = document.getElementById('scanner-flip-btn');
    if (flipBtn) {
      flipBtn.style.display = (_availableCameras && _availableCameras.length > 1) ? 'inline-flex' : 'none';
    }

    const torchBtn = document.getElementById('scanner-torch-btn');
    if (torchBtn) {
      let canTorch = false;
      try {
        const track = html5QrcodeScanner?.getRunningTrack();
        if (track && typeof track.getCapabilities === 'function') {
          const caps = track.getCapabilities();
          if (caps && caps.torch) canTorch = true;
        }
        if (!canTorch) {
          const caps = html5QrcodeScanner?.getRunningTrackCameraCapabilities();
          if (caps?.torchFeature && caps.torchFeature().isSupported()) canTorch = true;
        }
      } catch(e) {}
      torchBtn.style.display = canTorch ? 'inline-flex' : 'none';
      torchBtn.style.background = _torchActive ? '#f59e0b' : '';
      torchBtn.style.color = _torchActive ? '#000' : '';
    }
  }

  async function startCamera(cameraIdOrConstraints) {
    const qrRegion = document.getElementById('scanner-qr-reader');
    if (!qrRegion) return false;

    // Responsive dynamic qrbox calculation avoids "qrbox is larger than video size" on mobile
    const config = {
      fps: 15,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const qrEdge = Math.floor(minEdge * 0.72);
        return {
          width: Math.max(160, Math.min(qrEdge, 280)),
          height: Math.max(160, Math.min(qrEdge, 280))
        };
      },
      aspectRatio: 1.0,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true }
    };

    try {
      setStatus("Starting camera feed...", "var(--primary)");
      await html5QrcodeScanner.start(
        cameraIdOrConstraints,
        config,
        (decodedText) => handleDecoded(decodedText),
        (errorMessage) => {}
      );
      setStatus("Point camera at JMPL QR Code sticker", "var(--text-secondary)");
      updateControlButtons();
      resetInactivityTimer();
      return true;
    } catch (err) {
      console.warn("Camera start failed for:", cameraIdOrConstraints, err);
      return false;
    }
  }

  async function start(inputId, callback) {
    if (_isStarting) return;
    _isStarting = true;

    activeInputId = inputId;
    activeCallback = callback;
    lastScannedText = '';
    lastScanTime = 0;

    const ready = await ensureLibraryLoaded();
    if (!ready) {
      _isStarting = false;
      if (typeof showToast === 'function') {
        showToast('Scanner library not loaded. Please check connection or reload.', 'error');
      }
      return;
    }

    let modal = document.getElementById('scanner-modal-overlay');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal-overlay hidden';
      modal.id = 'scanner-modal-overlay';
      modal.style.zIndex = '2000';
      modal.innerHTML = `
        <div class="modal modal-sm" style="max-width: 440px; border-radius: 16px;">
          <div class="modal-header" style="padding: 12px 16px; border-bottom: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 20px;">📷</span>
              <h3 style="margin: 0; font-size: 16px;">Scan QR Code</h3>
            </div>
            <button class="modal-close" onclick="Scanner.stop()" title="Close scanner" style="font-size: 18px;">✕</button>
          </div>
          
          <div class="modal-body" style="padding: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div id="scanner-qr-reader" style="width: 100%; max-width: 320px; aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: #000; border: 2px solid var(--border); position: relative; display: flex; align-items: center; justify-content: center;"></div>
            
            <p id="scanner-status-text" style="font-size: 12px; color: var(--text-secondary); margin-top: 10px; margin-bottom: 6px; text-align: center; min-height: 18px; line-height: 1.4;">
              Initializing camera...
            </p>

            <!-- Quick Action Bar: Flip, Torch, Snap Photo -->
            <div id="scanner-action-bar" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; width: 100%; margin-top: 6px;">
              <button type="button" id="scanner-flip-btn" class="btn btn-secondary btn-sm" onclick="Scanner.switchCamera()" style="display: none; align-items: center; gap: 4px; font-size: 11.5px; padding: 4px 10px; height: 32px;">
                🔄 Flip Camera
              </button>
              
              <button type="button" id="scanner-torch-btn" class="btn btn-secondary btn-sm" onclick="Scanner.toggleTorch()" style="display: none; align-items: center; gap: 4px; font-size: 11.5px; padding: 4px 10px; height: 32px;">
                🔦 Flashlight
              </button>

              <button type="button" id="scanner-snap-btn" class="btn btn-secondary btn-sm" onclick="document.getElementById('scanner-file-input').click()" style="display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; padding: 4px 10px; height: 32px;" title="Take a photo with native phone camera">
                📸 Snap / Upload Photo
              </button>
              
              <!-- Hidden native camera file capture -->
              <input type="file" id="scanner-file-input" accept="image/*" capture="environment" style="display: none;" onchange="Scanner.handleFileSelect(this)">
            </div>
            
            <!-- Continuous Mode Toggle -->
            <div style="margin-top: 12px; width: 100%; display: flex; align-items: center; justify-content: center; background: rgba(59, 130, 246, 0.08); padding: 8px 12px; border-radius: 8px;">
              <label style="font-size: 12px; font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;">
                <input type="checkbox" id="scanner-continuous-toggle" style="cursor: pointer;">
                ⚡ Continuous Rapid Scan Mode
              </label>
            </div>

            <!-- Manual Batch Number Entry Fallback -->
            <div style="margin-top: 12px; width: 100%; border-top: 1px solid var(--border); padding-top: 12px; display: flex; flex-direction: column; gap: 6px;">
              <label style="font-size: 11.5px; font-weight: 600; color: var(--text-secondary);">Or enter batch number manually:</label>
              <div style="display: flex; gap: 6px; width: 100%;">
                <input type="text" id="scanner-manual-input" class="form-control form-control-sm font-mono" placeholder="Type Batch No..." style="margin: 0; flex: 1;" onkeydown="if(event.key==='Enter') Scanner.submitManual()">
                <button class="btn btn-primary btn-sm" onclick="Scanner.submitManual()" style="padding: 4px 12px; height: 32px;">Search</button>
              </div>
            </div>
          </div>
          <div class="modal-footer" style="padding: 10px 16px; justify-content: center;">
            <button class="btn btn-secondary btn-sm" onclick="Scanner.stop()">Done / Close</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }

    const qrRegion = document.getElementById('scanner-qr-reader');
    if (!qrRegion) {
      _isStarting = false;
      return;
    }

    modal.classList.remove('hidden');

    // Reset manual input
    const manualInp = document.getElementById('scanner-manual-input');
    if (manualInp) {
      manualInp.value = '';
      setTimeout(() => manualInp.focus(), 150);
    }

    // Safely stop any previous scanning instance
    await safelyStopScanner();

    // Reset viewfinder HTML
    qrRegion.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#94a3b8; font-size:13px; text-align:center; padding:20px;">
        <div style="font-size:28px; margin-bottom:8px; animation:spin 1s linear infinite;">⏳</div>
        <div>Initializing camera...</div>
      </div>`;
    qrRegion.style.background = '#000';

    modal.onclick = () => resetInactivityTimer();
    modal.ontouchstart = () => resetInactivityTimer();

    html5QrcodeScanner = new Html5Qrcode("scanner-qr-reader");

    // Check secure context (HTTPS / localhost required for WebRTC getUserMedia on mobile browsers)
    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const isSecure = window.isSecureContext || isLocalhost || window.location.protocol === 'https:';

    let started = false;

    // Mobile Strategy 1: Camera device enumeration
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        _availableCameras = devices;
        // Prioritize rear/back camera
        const backIdx = devices.findIndex(c => {
          const l = (c.label || '').toLowerCase();
          return l.includes('back') || l.includes('rear') || l.includes('environment');
        });
        // On mobile devices where labels may be empty, back camera is usually the last camera
        _currentCameraIndex = backIdx !== -1 ? backIdx : (devices.length > 1 ? devices.length - 1 : 0);
        
        started = await startCamera(_availableCameras[_currentCameraIndex].id);
      }
    } catch (e) {
      console.warn("Camera enumeration failed, trying direct constraints...", e);
    }

    // Mobile Strategy 2: Direct environment facing mode
    if (!started) {
      started = await startCamera({ facingMode: "environment" });
    }

    // Mobile Strategy 3: Default / user facing camera fallback
    if (!started) {
      started = await startCamera({ facingMode: "user" });
    }

    // If live camera still couldn't start (e.g. HTTP insecure context or permissions denied)
    if (!started) {
      let errorReason = 'Camera access is unavailable.';
      if (!isSecure) {
        errorReason = 'Mobile browsers require HTTPS or an installed app for live video.';
      } else if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        errorReason = 'Camera streaming is not supported on this browser version.';
      }

      setStatus(errorReason, '#f43f5e');
      qrRegion.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; padding:16px; text-align:center; box-sizing:border-box;">
          <div style="font-size:32px; margin-bottom:6px;">📷</div>
          <div style="color:#f43f5e; font-weight:700; font-size:13px; margin-bottom:4px;">Live Stream Inactive</div>
          <div style="font-size:11px; color:#94a3b8; margin-bottom:12px; line-height:1.4;">${errorReason}</div>
          <button type="button" class="btn btn-primary btn-sm" onclick="document.getElementById('scanner-file-input').click()" style="padding:6px 14px; font-size:12px; font-weight:600;">
            📸 Snap Photo to Scan
          </button>
        </div>`;
      
      if (typeof showToast === 'function') {
        showToast('Tap "Snap Photo to Scan" to read QR code using camera', 'info');
      }
    }

    _isStarting = false;
  }

  async function switchCamera() {
    if (!_availableCameras || _availableCameras.length <= 1) return;
    _currentCameraIndex = (_currentCameraIndex + 1) % _availableCameras.length;
    const targetCameraId = _availableCameras[_currentCameraIndex].id;

    setStatus("Switching camera...", "var(--primary)");
    try {
      if (html5QrcodeScanner && html5QrcodeScanner.isScanning) {
        await html5QrcodeScanner.stop();
      }
      await startCamera(targetCameraId);
    } catch(err) {
      console.warn("Failed switching camera:", err);
    }
  }

  async function toggleTorch() {
    if (!html5QrcodeScanner) return;
    _torchActive = !_torchActive;
    try {
      const track = html5QrcodeScanner.getRunningTrack();
      if (track && typeof track.applyConstraints === 'function') {
        await track.applyConstraints({
          advanced: [{ torch: _torchActive }]
        });
      } else {
        const caps = html5QrcodeScanner.getRunningTrackCameraCapabilities();
        if (caps?.torchFeature && caps.torchFeature().isSupported()) {
          await caps.torchFeature().apply(_torchActive);
        }
      }
    } catch(err) {
      console.warn("Torch toggle error:", err);
      _torchActive = !_torchActive; // revert state on error
    }
    updateControlButtons();
  }

  async function handleFileSelect(inputElement) {
    if (!inputElement || !inputElement.files || !inputElement.files.length) return;
    const file = inputElement.files[0];
    
    // Reset file input so same file can be selected again
    inputElement.value = '';

    setStatus("Decoding photo...", "var(--primary)");
    if (typeof showToast === 'function') showToast('Reading QR code from photo...', 'info');

    let scannerInstance = html5QrcodeScanner;
    let createdTemporary = false;

    if (!scannerInstance || scannerInstance.isScanning) {
      // If live scanner is active or null, create a headless reader element for file scan
      let headless = document.getElementById('scanner-headless-reader');
      if (!headless) {
        headless = document.createElement('div');
        headless.id = 'scanner-headless-reader';
        headless.style.display = 'none';
        document.body.appendChild(headless);
      }
      scannerInstance = new Html5Qrcode('scanner-headless-reader');
      createdTemporary = true;
    }

    try {
      const decodedText = await scannerInstance.scanFile(file, /* showImage= */ false);
      if (decodedText) {
        handleDecoded(decodedText);
      } else {
        throw new Error('No QR code detected');
      }
    } catch(err) {
      console.warn("File scan error:", err);
      setStatus("No QR code found in photo", "#f43f5e");
      if (typeof showToast === 'function') {
        showToast('No QR code detected. Please capture a clear, close-up photo of the sticker.', 'warning');
      }
    } finally {
      if (createdTemporary && scannerInstance) {
        try { scannerInstance.clear(); } catch(e) {}
      }
    }
  }

  async function stop() {
    const modal = document.getElementById('scanner-modal-overlay');
    if (modal) modal.classList.add('hidden');
    await safelyStopScanner();
  }

  function submitManual() {
    const val = (document.getElementById('scanner-manual-input')?.value || '').trim();
    if (!val) {
      if (typeof showToast === 'function') showToast('Please enter a valid batch number', 'warning');
      return;
    }
    handleDecoded(val);
    stop();
  }

  return {
    start,
    stop,
    submitManual,
    switchCamera,
    toggleTorch,
    handleFileSelect
  };
})();
