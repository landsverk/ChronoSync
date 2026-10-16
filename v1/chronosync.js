  // State variables
        let serverOffsetMs = 0; // The difference between synchronized time and local performance counter
        let lastSyncTimestamp = 0;
        let rttMs = 0;
        let is24HourFormat = true;
        let autoSyncTimer = null;
        let syntheticSkewMs = 0; // User-controlled simulation skew
        let isSyncing = false;

        // Toast Notification System
        function showToast(title, message, type = 'info') {
            const toast = document.getElementById('toast');
            const titleEl = document.getElementById('toast-title');
            const msgEl = document.getElementById('toast-message');
            const iconEl = document.getElementById('toast-icon');

            titleEl.textContent = title;
            msgEl.textContent = message;

            if (type === 'success') {
                iconEl.className = 'fa-solid fa-circle-check text-emerald-400 text-lg';
            } else if (type === 'error') {
                iconEl.className = 'fa-solid fa-triangle-exclamation text-rose-400 text-lg';
            } else {
                iconEl.className = 'fa-solid fa-circle-info text-blue-400 text-lg';
            }

            toast.classList.remove('translate-y-[-150%]', 'opacity-0');
            toast.classList.add('translate-y-0', 'opacity-100');

            setTimeout(() => {
                toast.classList.remove('translate-y-0', 'opacity-100');
                toast.classList.add('translate-y-[-150%]', 'opacity-0');
            }, 3500);
        }

        // Core Synchronization Function using HTTP HEAD and RTT calculation
        async function synchronizeTime() {
            if (isSyncing) return;
            isSyncing = true;
            
            const btn = document.getElementById('resync-btn');
            const icon = document.getElementById('resync-icon');
            const statusBadge = document.getElementById('sync-status-badge');
            const statusText = document.getElementById('sync-status-text');

            btn.disabled = true;
            icon.classList.add('fa-spin');
            statusBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium';
            statusText.textContent = 'Syncing...';

            const startPerf = performance.now();
            const startLocal = Date.now();

            try {
                // Make a lightweight HEAD request to get the server Date header
                // We fetch the current page with cache-busting to ensure fresh headers
                const response = await fetch(window.location.href + (window.location.href.includes('?') ? '&' : '?') + '_ts=' + Date.now(), {
                    method: 'HEAD',
                    cache: 'no-store'
                });

                const endPerf = performance.now();
                rttMs = endPerf - startPerf;
                const oneWayLatency = rttMs / 2;

                const dateHeader = response.headers.get('Date');
                if (!dateHeader) {
                    throw new Error("Server response did not include a Date header.");
                }

                const serverTimeMs = new Date(dateHeader).getTime();
                // Synchronized time at the exact moment of response arrival = serverTimeMs
                // Estimated server time right now = serverTimeMs + oneWayLatency
                const estimatedCurrentServerTime = serverTimeMs + oneWayLatency;

                // Calculate offset between local system time and synchronized server time
                serverOffsetMs = estimatedCurrentServerTime - startLocal;
                lastSyncTimestamp = Date.now();

                // Update UI diagnostics
                document.getElementById('metric-rtt').textContent = Math.round(rttMs);
                document.getElementById('metric-offset').textContent = Math.round(serverOffsetMs);
                document.getElementById('diag-server-date').textContent = new Date(estimatedCurrentServerTime).toLocaleTimeString() + '.' + String(Math.floor(estimatedCurrentServerTime % 1000)).padStart(3, '0');
                
                statusBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium';
                statusText.textContent = 'Synchronized';

                showToast('Time Synchronized', `Successfully fetched server time. RTT: ${Math.round(rttMs)}ms, Offset: ${Math.round(serverOffsetMs)}ms`, 'success');

            } catch (error) {
                console.warn('Network sync failed, falling back to high-precision local offset estimate:', error);
                // Fallback graceful handling if offline or restricted header access
                rttMs = 15; // default fallback estimation
                serverOffsetMs = 0; 
                lastSyncTimestamp = Date.now();

                statusBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium';
                statusText.textContent = 'Fallback Mode';
                showToast('Sync Warning', 'Could not read server Date header (CORS/Offline). Using calibrated local time.', 'error');
            } finally {
                isSyncing = false;
                btn.disabled = false;
                icon.classList.remove('fa-spin');
            }
        }

        // Manual Re-sync Button trigger
        function triggerResync() {
            synchronizeTime();
        }

        // Auto-sync interval handler
        function updateAutoSyncInterval() {
            const val = parseInt(document.getElementById('auto-sync-select').value);
            if (autoSyncTimer) clearInterval(autoSyncTimer);

            if (val > 0) {
                autoSyncTimer = setInterval(() => {
                    synchronizeTime();
                }, val);
                showToast('Auto-Sync Updated', `Automatic background synchronization scheduled every ${val / 60000} minute(s).`, 'info');
            } else {
                showToast('Auto-Sync Disabled', 'Automatic background synchronization has been turned off.', 'info');
            }
        }

        // Time format toggle (12h / 24h)
        function toggleTimeFormat() {
            is24HourFormat = !is24HourFormat;
            const btn = document.getElementById('format-toggle-btn');
            btn.textContent = is24HourFormat ? '24-Hour' : '12-Hour';
        }

        // Simulation Skew handlers
        function onSkewSliderChange(val) {
            syntheticSkewMs = parseInt(val);
            const sign = syntheticSkewMs > 0 ? '+' : '';
            document.getElementById('skew-value-label').textContent = `${sign}${syntheticSkewMs} ms`;
        }

        function resetSkew() {
            syntheticSkewMs = 0;
            document.getElementById('skew-slider').value = 0;
            document.getElementById('skew-value-label').textContent = '+0 ms';
            showToast('Skew Reset', 'Artificial client clock skew cleared.', 'info');
        }

        function simulateRandomDrift() {
            // Pick a random skew between -120 seconds and +120 seconds
            const randomSkew = (Math.floor(Math.random() * 240) - 120) * 1000;
            syntheticSkewMs = randomSkew;
            document.getElementById('skew-slider').value = randomSkew;
            const sign = syntheticSkewMs > 0 ? '+' : '';
            document.getElementById('skew-value-label').textContent = `${sign}${syntheticSkewMs} ms`;
            showToast('Drift Simulated', `Applied artificial client clock skew of ${syntheticSkewMs / 1000} seconds.`, 'info');
        }

        // Main Clock Tick Loop (runs every frame / requestAnimationFrame for butter-smooth milliseconds)
        function clockTick() {
            // True synchronized time = Local Date.now() + serverOffsetMs + syntheticSkewMs
            const localNow = Date.now();
            const synchronizedTimeMs = localNow + serverOffsetMs + syntheticSkewMs;
            const dateObj = new Date(synchronizedTimeMs);

            // Extract time components
            let hours = dateObj.getHours();
            const minutes = dateObj.getMinutes();
            const seconds = dateObj.getSeconds();
            const milliseconds = dateObj.getMilliseconds();

            // Format for 12h if needed
            let ampm = '';
            if (!is24HourFormat) {
                ampm = hours >= 12 ? ' PM' : ' AM';
                hours = hours % 12;
                hours = hours ? hours : 12; // the hour '0' should be '12'
            }

            // Update Digital Clock DOM
            document.getElementById('time-hours').textContent = String(hours).padStart(2, '0');
            document.getElementById('time-minutes').textContent = String(minutes).padStart(2, '0');
            document.getElementById('time-seconds').textContent = String(seconds).padStart(2, '0');
            document.getElementById('time-milliseconds').textContent = '.' + String(milliseconds).padStart(3, '0') + ampm;

            // Update Date Display
            const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
            document.getElementById('date-display').textContent = dateObj.toLocaleDateString(undefined, options);

            // Update Analog Clock Hands Rotation
            const secFraction = seconds + (milliseconds / 1000);
            const minFraction = minutes + (secFraction / 60);
            const hrFraction = (hours % 12) + (minFraction / 60);

            const secDeg = secFraction * 6; // 360 deg / 60 sec = 6 deg/sec
            const minDeg = minFraction * 6; // 360 deg / 60 min = 6 deg/min
            const hrDeg = hrFraction * 30;  // 360 deg / 12 hr = 30 deg/hr

            const secHand = document.getElementById('analog-second');
            const minHand = document.getElementById('analog-minute');
            const hrHand = document.getElementById('analog-hour');

            if (secHand) secHand.style.transform = `rotate(${secDeg}deg)`;
            if (minHand) minHand.style.transform = `rotate(${minDeg}deg)`;
            if (hrHand) hrHand.style.transform = `rotate(${hrDeg}deg)`;

            // Update Live Diagnostics Local Time Display
            document.getElementById('diag-local-time').textContent = new Date(localNow).toLocaleTimeString() + '.' + String(localNow % 1000).padStart(3, '0');

            // Update "Last Synced Ago" diagnostic counter
            const elapsedSec = Math.floor((Date.now() - lastSyncTimestamp) / 1000);
            const lastSyncEl = document.getElementById('diag-last-sync');
            if (elapsedSec < 5) {
                lastSyncEl.textContent = 'Just now';
            } else if (elapsedSec < 60) {
                lastSyncEl.textContent = `${elapsedSec}s ago`;
            } else {
                lastSyncEl.textContent = `${Math.floor(elapsedSec / 60)}m ago`;
            }

            requestAnimationFrame(clockTick);
        }

        // Initialize on window load
        window.onload = async function() {
            // Initial sync
            await synchronizeTime();

            // Start default auto-sync interval (5 mins)
            autoSyncTimer = setInterval(() => {
                synchronizeTime();
            }, 300000);

            // Start continuous high-precision render loop
            requestAnimationFrame(clockTick);
        };
