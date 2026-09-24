// ============================================================
// scanner.js — High-Performance QR Code Camera Scanner Module
// Features: Hardware BarcodeDetector Turbo Engine, QR-Only Filtering,
// Continuous Autofocus, 720p Stream, and Instant Startup
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
  let _turboActive = false;
  let _turboDetector = null;

  // Inject sleek laser & reticle styles once
  function ensureScannerStyles() {
    if (document.getElementById('scanner-fast-styles')) return;
    const style = document.createElement('style');
    style.id = 'scanner-fast-styles';
    style.textContent = `
      @keyframes scannerLaser {
        0% { top: 8%; opacity: 0.9; }
        50% { top: 90%; opacity: 1; }
        100% { top: 8%; opacity: 0.9; }
      }
      .scanner-laser-line {
        position: absolute;
        left: 6%;
        right: 6%;
        height: 2px;
        background: linear-gradient(90deg, transparent, #10b981, #3b82f6, #10b981, transparent);
        box-shadow: 0 0 12px #10b981, 0 0 24px #3b82f6;
        border-radius: 50%;
        animation: scannerLaser 1.6s ease-in-out infinite;
        pointer-events: none;
        z-index: 6;
      }
      .scanner-reticle-corner {
        position: absolute;
        width: 24px;
        height: 24px;
        border-color: #3b82f6;
        border-style: solid;
        pointer-events: none;
        z-index: 5;
      }
      .scanner-reticle-tl { top: 10px; left: 10px; border-width: 3px 0 0 3px; border-top-left-radius: 6px; }
      .scanner-reticle-tr { top: 10px; right: 10px; border-width: 3px 3px 0 0; border-top-right-radius: 6px; }
      .scanner-reticle-bl { bottom: 10px; left: 10px; border-width: 0 0 3px 3px; border-bottom-left-radius: 6px; }
      .scanner-reticle-br { bottom: 10px; right: 10px; border-width: 0 3px 3px 0; border-bottom-right-radius: 6px; }
    `;
    document.head.appendChild(style);
  }

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
    stopTurboEngine();
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
        startTurboEngine();
      }
    } catch(e) {}
  }

  function prewarmAudio() {
    try {
      if (!_audioCtx || _audioCtx.state === 'closed') {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (_audioCtx.state === 'suspended') {
        _audioCtx.resume();
      }
    } catch(e) {}
  }

  function playBeep() {
    try {
      prewarmAudio();
      if (!_audioCtx) return;
      const ctx = _audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 950;
      gain.gain.value = 0.2;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch(e) {}
  }

  function handleDecoded(decodedText) {
    if (!decodedText) return;
    resetInactivityTimer();
    const now = Date.now();
    if (decodedText === lastScannedText && (now - lastScanTime) < 1200) {
      return; // Debounce rapid duplicate reads
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
    const readerEl = document.getElementById('scanner-qr-reader');
    if (readerEl) {
      readerEl.style.boxShadow = '0 0 20px #10b981';
      readerEl.style.borderColor = '#10b981';
      setTimeout(() => {
        if (readerEl) {
          readerEl.style.boxShadow = '';
          readerEl.style.borderColor = 'var(--border)';
        }
      }, 400);
    }

    if (isContinuous) {
      if (typeof showToast === 'function') showToast('⚡ Scanned: ' + decodedText, 'success');
    } else {
      stop();
      if (typeof showToast === 'function') showToast('QR Code scanned: ' + decodedText, 'success');
    }
  }

  // Hardware-accelerated native BarcodeDetector Turbo Engine
  async function startTurboEngine() {
    if (!('BarcodeDetector' in window)) return;
    try {
      if (!_turboDetector) {
        const formats = await BarcodeDetector.getSupportedFormats().catch(() => []);
        if (formats && formats.includes('qr_code')) {
          _turboDetector = new BarcodeDetector({ formats: ['qr_code'] });
        }
      }
      if (!_turboDetector) return;

      _turboActive = true;
      const video = document.querySelector('#scanner-qr-reader video');
      if (!video) {
        // Retry in 80ms if video element is still mounting
        setTimeout(() => { if (_turboActive) startTurboEngine(); }, 80);
        return;
      }

      let isDetecting = false;
      const scanFrame = async () => {
        if (!_turboActive || !video || video.paused || video.ended) return;
        if (!isDetecting && video.readyState >= 2 && video.videoWidth > 0) {
          isDetecting = true;
          try {
            const results = await _turboDetector.detect(video);
            if (results && results.length > 0 && _turboActive) {
              const raw = results[0].rawValue;
              if (raw) {
                handleDecoded(raw);
                isDetecting = false;
                return;
              }
            }
          } catch(e) {}
          isDetecting = false;
        }

        if (_turboActive) {
          if ('requestVideoFrameCallback' in video) {
            video.requestVideoFrameCallback(scanFrame);
          } else {
            requestAnimationFrame(scanFrame);
          }
        }
      };

      if ('requestVideoFrameCallback' in video) {
        video.requestVideoFrameCallback(scanFrame);
      } else {
        requestAnimationFrame(scanFrame);
      }
    } catch(err) {
      console.warn("Turbo detector error:", err);
    }
  }

  function stopTurboEngine() {
    _turboActive = false;
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
    stopTurboEngine();
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

  function attachViewfinderOverlay(qrRegion) {
    qrRegion.querySelectorAll('.scanner-laser-line, .scanner-reticle-corner').forEach(el => el.remove());

    const laser = document.createElement('div');
    laser.className = 'scanner-laser-line';

    const c1 = document.createElement('div'); c1.className = 'scanner-reticle-corner scanner-reticle-tl';
    const c2 = document.createElement('div'); c2.className = 'scanner-reticle-corner scanner-reticle-tr';
    const c3 = document.createElement('div'); c3.className = 'scanner-reticle-corner scanner-reticle-bl';
    const c4 = document.createElement('div'); c4.className = 'scanner-reticle-corner scanner-reticle-br';

    qrRegion.appendChild(laser);
    qrRegion.appendChild(c1);
    qrRegion.appendChild(c2);
    qrRegion.appendChild(c3);
    qrRegion.appendChild(c4);
  }

  async function startCamera(cameraIdOrConstraints) {
    const qrRegion = document.getElementById('scanner-qr-reader');
    if (!qrRegion) return false;

    // Optimized scanning configuration:
    // - 25 FPS for rapid real-time frame scanning
    // - Wide 85% dynamic scan box (no need to center QR perfectly)
    // - 720p sweet-spot resolution (sharp enough for tiny QR, 4x faster than 1080p)
    const config = {
      fps: 25,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const qrEdge = Math.floor(minEdge * 0.85);
        return {
          width: Math.max(180, Math.min(qrEdge, 340)),
          height: Math.max(180, Math.min(qrEdge, 340))
        };
      },
      aspectRatio: 1.0,
      disableFlip: false,
      videoConstraints: typeof cameraIdOrConstraints === 'object' ? {
        ...cameraIdOrConstraints,
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 }
      } : {
        deviceId: { exact: cameraIdOrConstraints },
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 }
      }
    };

    try {
      setStatus("Starting high-speed camera...", "var(--primary)");
      await html5QrcodeScanner.start(
        cameraIdOrConstraints,
        config,
        (decodedText) => handleDecoded(decodedText),
        (errorMessage) => {}
      );

      // Hardware auto-focus & exposure lock for instant clarity
      try {
        const track = html5QrcodeScanner.getRunningTrack();
        if (track && typeof track.applyConstraints === 'function') {
          const caps = track.getCapabilities ? track.getCapabilities() : {};
          const adv = {};
          if (caps.focusMode && (caps.focusMode.includes('continuous') || caps.focusMode.includes('macro'))) {
            adv.focusMode = caps.focusMode.includes('continuous') ? 'continuous' : 'macro';
          }
          if (caps.exposureMode && caps.exposureMode.includes('continuous')) {
            adv.exposureMode = 'continuous';
          }
          if (caps.whiteBalanceMode && caps.whiteBalanceMode.includes('continuous')) {
            adv.whiteBalanceMode = 'continuous';
          }
          if (Object.keys(adv).length > 0) {
            await track.applyConstraints({ advanced: [adv] }).catch(() => {});
          }
        }
      } catch(e) {}

      attachViewfinderOverlay(qrRegion);
      startTurboEngine();
      setStatus("Point camera at QR code", "var(--text-secondary)");
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
    prewarmAudio();
    ensureScannerStyles();

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
              <span style="font-size: 10px; background: rgba(16,185,129,0.15); color: #10b981; padding: 2px 6px; border-radius: 4px; font-weight: 700; margin-left: 4px;">FAST</span>
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
        <div>Opening camera...</div>
      </div>`;
    qrRegion.style.background = '#000';

    modal.onclick = () => resetInactivityTimer();
    modal.ontouchstart = () => resetInactivityTimer();

    // Instantiate with QR_CODE ONLY filter and native BarcodeDetector enabled
    const supportedFormats = typeof Html5QrcodeSupportedFormats !== 'undefined'
      ? [Html5QrcodeSupportedFormats.QR_CODE]
      : undefined;

    html5QrcodeScanner = new Html5Qrcode("scanner-qr-reader", {
      formatsToSupport: supportedFormats,
      useBarCodeDetectorIfSupported: true,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      },
      verbose: false
    });

    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const isSecure = window.isSecureContext || isLocalhost || window.location.protocol === 'https:';

    let started = false;

    // Fast Mobile-First Launch:
    // Directly request environment camera constraints immediately (< 200ms) without
    // waiting for slow device enumeration.
    try {
      started = await startCamera({ facingMode: { ideal: "environment" } });
    } catch(e) {
      console.warn("Direct environment launch failed, falling back to enumeration...", e);
    }

    // Asynchronously enumerate cameras in the background to enable the Flip button
    Html5Qrcode.getCameras().then(devices => {
      if (devices && devices.length > 0) {
        _availableCameras = devices;
        const backIdx = devices.findIndex(c => {
          const l = (c.label || '').toLowerCase();
          return l.includes('back') || l.includes('rear') || l.includes('environment');
        });
        _currentCameraIndex = backIdx !== -1 ? backIdx : (devices.length > 1 ? devices.length - 1 : 0);
        updateControlButtons();
      }
    }).catch(() => {});

    // If direct environment constraint failed, try enumerated back camera
    if (!started && _availableCameras.length > 0) {
      started = await startCamera(_availableCameras[_currentCameraIndex].id);
    }

    // Fallback: user/front facing camera
    if (!started) {
      started = await startCamera({ facingMode: "user" });
    }

    // If live camera still couldn't start (permissions / insecure context)
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
    stopTurboEngine();
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
      _torchActive = !_torchActive;
    }
    updateControlButtons();
  }

  async function handleFileSelect(inputElement) {
    if (!inputElement || !inputElement.files || !inputElement.files.length) return;
    const file = inputElement.files[0];
    inputElement.value = '';

    setStatus("Decoding photo...", "var(--primary)");
    if (typeof showToast === 'function') showToast('Reading QR code from photo...', 'info');

    let scannerInstance = html5QrcodeScanner;
    let createdTemporary = false;

    if (!scannerInstance || scannerInstance.isScanning) {
      let headless = document.getElementById('scanner-headless-reader');
      if (!headless) {
        headless = document.createElement('div');
        headless.id = 'scanner-headless-reader';
        headless.style.display = 'none';
        document.body.appendChild(headless);
      }
      const supportedFormats = typeof Html5QrcodeSupportedFormats !== 'undefined'
        ? [Html5QrcodeSupportedFormats.QR_CODE]
        : undefined;

      scannerInstance = new Html5Qrcode('scanner-headless-reader', {
        formatsToSupport: supportedFormats,
        useBarCodeDetectorIfSupported: true,
        verbose: false
      });
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
    stopTurboEngine();
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
