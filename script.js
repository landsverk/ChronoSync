// ChronoSync Pro - Main Application Logic

let serverOffsetMs = 0;
let lastSyncTimestamp = 0;
let rttMs = 0;
let syntheticSkewMs = 0;
let isSyncing = false;
let selectedTimezone = null; // null = UTC / Server time
let autoSyncTimer = null;

// Stopwatch state
let swTimer = null;
let swStartTime = 0;
let swElapsedTime = 0;
let swRunning = false;
let laps = [];

// Countdown state
let cdTimer = null;
let cdTimeRemaining = 300000; // 5 mins in ms
let cdRunning = false;

// Toast Notification System
function showToast(title, message, type = 'info') {
    const toast = document.getElementById('toast');
    const titleEl = document.getElementById('toast-title');
    const msgEl = document.getElementById('toast-message');
    const iconEl = document.getElementById('toast-icon');

    titleEl.textContent = title;
    msgEl.textContent = message;

    if (type === 'success') {
        iconEl.className = 'fa-solid fa-circle-check text-emerald-500 text-lg';
    } else if (type === 'error') {
        iconEl.className = 'fa-solid fa-triangle-exclamation text-rose-500 text-lg';
    } else {
        iconEl.className = 'fa-solid fa-circle-info text-blue-500 text-lg';
    }

    toast.classList.remove('translate-y-[-150%]', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-[-150%]', 'opacity-0');
    }, 3500);
}

// Theme Toggle
function toggleTheme() {
    const html = document.documentElement;
    const icon = document.getElementById('theme-icon');
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        icon.className = 'fa-solid fa-sun';
        showToast('Light Mode', 'Switched to light theme.', 'info');
    } else {
        html.classList.add('dark');
        icon.className = 'fa-solid fa-moon';
        showToast('Dark Mode', 'Switched to dark theme.', 'info');
    }
}

// Mode Switcher
function switchMode(mode) {
    document.getElementById('view-clock').classList.add('hidden');
    document.getElementById('view-stopwatch').classList.add('hidden');
    document.getElementById('view-countdown').classList.add('hidden');

    document.getElementById('tab-clock').className = 'flex-1 py-2 px-4 rounded-xl text-xs font-semibold transition text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer';
    document.getElementById('tab-stopwatch').className = 'flex-1 py-2 px-4 rounded-xl text-xs font-semibold transition text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer';
    document.getElementById('tab-countdown').className = 'flex-1 py-2 px-4 rounded-xl text-xs font-semibold transition text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer';

    if (mode === 'clock') {
        document.getElementById('view-clock').classList.remove('hidden');
        document.getElementById('tab-clock').className = 'flex-1 py-2 px-4 rounded-xl text-xs font-semibold transition bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-sm cursor-pointer';
    } else if (mode === 'stopwatch') {
        document.getElementById('view-stopwatch').classList.remove('hidden');
        document.getElementById('tab-stopwatch').className = 'flex-1 py-2 px-4 rounded-xl text-xs font-semibold transition bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-sm cursor-pointer';
    } else if (mode === 'countdown') {
        document.getElementById('view-countdown').classList.remove('hidden');
        document.getElementById('tab-countdown').className = 'flex-1 py-2 px-4 rounded-xl text-xs font-semibold transition bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-sm cursor-pointer';
    }
}

// Timezone selection
function setTimezone(tz) {
    selectedTimezone = tz;
    const label = tz ? tz.replace('_', ' ').split('/')[1] || tz : 'UTC / Synchronized Server Time';
    document.getElementById('active-timezone-label').innerHTML = `<i class="fa-solid fa-globe text-blue-500"></i> ${label}`;
    showToast('Timezone Selected', `Active display set to ${label}`, 'success');
}

// Core Time Synchronization via HTTP HEAD
async function synchronizeTime() {
    if (isSyncing) return;
    isSyncing = true;
    
    const btn = document.getElementById('resync-btn');
    const icon = document.getElementById('resync-icon');
    const statusBadge = document.getElementById('sync-status-badge');
    const statusText = document.getElementById('sync-status-text');

    btn.disabled = true;
    icon.classList.add('fa-spin');
    statusBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-medium';
    statusText.textContent = 'Syncing...';

    const startPerf = performance.now();
    const startLocal = Date.now();

    try {
        const response = await fetch(window.location.href + (window.location.href.includes('?') ? '&' : '?') + '_ts=' + Date.now(), {
            method: 'HEAD',
            cache: 'no-store'
        });

        const endPerf = performance.now();
        rttMs = endPerf - startPerf;
        const oneWayLatency = rttMs / 2;

        const dateHeader = response.headers.get('Date');
        if (!dateHeader) throw new Error("Missing Date header");

        const serverTimeMs = new Date(dateHeader).getTime();
        const estimatedCurrentServerTime = serverTimeMs + oneWayLatency;

        serverOffsetMs = estimatedCurrentServerTime - startLocal;
        lastSyncTimestamp = Date.now();

        document.getElementById('metric-rtt').textContent = Math.round(rttMs);
        document.getElementById('metric-offset').textContent = Math.round(serverOffsetMs);
        document.getElementById('diag-server-date').textContent = new Date(estimatedCurrentServerTime).toLocaleTimeString() + '.' + String(Math.floor(estimatedCurrentServerTime % 1000)).padStart(3, '0');
        
        statusBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-medium';
        statusText.textContent = 'Synchronized';
        showToast('Synchronized', `RTT: ${Math.round(rttMs)}ms, Offset: ${Math.round(serverOffsetMs)}ms`, 'success');

    } catch (error) {
        rttMs = 15;
        serverOffsetMs = 0;
        lastSyncTimestamp = Date.now();
        statusBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-medium';
        statusText.textContent = 'Fallback Mode';
        showToast('Sync Warning', 'Using calibrated local time fallback.', 'error');
    } finally {
        isSyncing = false;
        btn.disabled = false;
        icon.classList.remove('fa-spin');
    }
}

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


function onSkewSliderChange(val) {
    syntheticSkewMs = parseInt(val);
    const sign = syntheticSkewMs > 0 ? '+' : '';
    document.getElementById('skew-value-label').textContent = `${sign}${syntheticSkewMs} ms`;
}

function resetSkew() {
    syntheticSkewMs = 0;
    document.getElementById('skew-slider').value = 0;
    document.getElementById('skew-value-label').textContent = '+0 ms';
    showToast('Skew Reset', 'Artificial skew cleared.', 'info');
}

function simulateRandomDrift() {
    const randomSkew = (Math.floor(Math.random() * 240) - 120) * 1000;
    syntheticSkewMs = randomSkew;
    document.getElementById('skew-slider').value = randomSkew;
    const sign = syntheticSkewMs > 0 ? '+' : '';
    document.getElementById('skew-value-label').textContent = `${sign}${syntheticSkewMs} ms`;
    showToast('Drift Simulated', `Applied skew of ${syntheticSkewMs / 1000}s`, 'info');
}

// Stopwatch functions
function startStopwatch() {
    if (!swRunning) {
        swRunning = true;
        swStartTime = Date.now() - swElapsedTime;
        document.getElementById('sw-start-btn').textContent = 'Pause';
        document.getElementById('sw-start-btn').className = 'px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shadow-lg shadow-amber-600/25 cursor-pointer';
    } else {
        swRunning = false;
        document.getElementById('sw-start-btn').textContent = 'Resume';
        document.getElementById('sw-start-btn').className = 'px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-600/25 cursor-pointer';
    }
}

function lapStopwatch() {
    if (!swElapsedTime && !swRunning) return;
    laps.push(swElapsedTime);
    document.getElementById('laps-container').classList.remove('hidden');
    const list = document.getElementById('laps-list');
    list.innerHTML = laps.map((lap, idx) => {
        const m = Math.floor(lap / 60000);
        const s = Math.floor((lap % 60000) / 1000);
        const ms = Math.floor((lap % 1000) / 10);
        return `<div class="flex justify-between bg-slate-100 dark:bg-slate-900/50 p-2 rounded-lg"><span class="text-slate-500">Lap ${idx + 1}</span><span class="font-bold">${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(2,'0')}</span></div>`;
    }).join('');
}

function resetStopwatch() {
    swRunning = false;
    swElapsedTime = 0;
    laps = [];
    document.getElementById('sw-start-btn').textContent = 'Start';
    document.getElementById('sw-start-btn').className = 'px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-600/25 cursor-pointer';
    document.getElementById('laps-container').classList.add('hidden');
    document.getElementById('sw-minutes').textContent = '00';
    document.getElementById('sw-seconds').textContent = '00';
    document.getElementById('sw-millis').textContent = '.00';
}

// Countdown functions
function startCountdown() {
    if (!cdRunning) {
        const minsInput = parseInt(document.getElementById('cd-input-mins').value) || 5;
        cdTimeRemaining = minsInput * 60000;
        cdRunning = true;
        document.getElementById('cd-start-btn').textContent = 'Pause';
    } else {
        cdRunning = false;
        document.getElementById('cd-start-btn').textContent = 'Resume';
    }
}

function resetCountdown() {
    cdRunning = false;
    const minsInput = parseInt(document.getElementById('cd-input-mins').value) || 5;
    cdTimeRemaining = minsInput * 60000;
    document.getElementById('cd-start-btn').textContent = 'Start';
    document.getElementById('cd-display').textContent = String(minsInput).padStart(2, '0') + ':00';
}

// Main Animation & Tick Loop
let lastSwTick = Date.now();
function appTick() {
    const now = Date.now();
    const synchronizedTimeMs = now + serverOffsetMs + syntheticSkewMs;
    const dateObj = new Date(synchronizedTimeMs);

    // If timezone is set, format accordingly
    let hours, minutes, seconds, milliseconds;
    if (selectedTimezone) {
        const tzString = dateObj.toLocaleString('en-US', { timeZone: selectedTimezone, hour12: false });
        const timePart = tzString.split(', ')[1] || tzString;
        const parts = timePart.split(':');
        hours = parseInt(parts[0]);
        minutes = parseInt(parts[1]);
        seconds = parseInt(parts[2]);
        milliseconds = dateObj.getMilliseconds();
    } else {
        hours = dateObj.getHours();
        minutes = dateObj.getMinutes();
        seconds = dateObj.getSeconds();
        milliseconds = dateObj.getMilliseconds();
    }

    // Update Digital Clock
    document.getElementById('time-hours').textContent = String(hours).padStart(2, '0');
    document.getElementById('time-minutes').textContent = String(minutes).padStart(2, '0');
    document.getElementById('time-seconds').textContent = String(seconds).padStart(2, '0');
    document.getElementById('time-milliseconds').textContent = '.' + String(milliseconds).padStart(3, '0');

    document.getElementById('date-display').textContent = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

    // Update World Clocks preview
    const formatTz = (tz) => {
        try {
            return new Date(synchronizedTimeMs).toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
        } catch(e) { return '--:--'; }
    };
    document.getElementById('tz-utc').textContent = formatTz('UTC');
    document.getElementById('tz-ny').textContent = formatTz('America/New_York');
    document.getElementById('tz-london').textContent = formatTz('Europe/London');
    document.getElementById('tz-tokyo').textContent = formatTz('Asia/Tokyo');

    // Update Stopwatch
    if (swRunning) {
        const delta = now - lastSwTick;
        swElapsedTime += delta;
        const m = Math.floor(swElapsedTime / 60000);
        const s = Math.floor((swElapsedTime % 60000) / 1000);
        const ms = Math.floor((swElapsedTime % 1000) / 10);
        document.getElementById('sw-minutes').textContent = String(m).padStart(2, '0');
        document.getElementById('sw-seconds').textContent = String(s).padStart(2, '0');
        document.getElementById('sw-millis').textContent = '.' + String(ms).padStart(2, '0');
    }
    lastSwTick = now;

    // Update Countdown
    if (cdRunning && cdTimeRemaining > 0) {
        cdTimeRemaining -= 16; // approx frame time
        if (cdTimeRemaining < 0) cdTimeRemaining = 0;
        const m = Math.floor(cdTimeRemaining / 60000);
        const s = Math.floor((cdTimeRemaining % 60000) / 1000);
        document.getElementById('cd-display').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        if (cdTimeRemaining === 0) {
            cdRunning = false;
            document.getElementById('cd-start-btn').textContent = 'Start';
            showToast('Countdown Complete', 'Timer has finished!', 'success');
        }
    }

    // Diagnostics local time
    document.getElementById('diag-local-time').textContent = new Date(now).toLocaleTimeString() + '.' + String(now % 1000).padStart(3, '0');
    const elapsedSec = Math.floor((Date.now() - lastSyncTimestamp) / 1000);
    document.getElementById('diag-last-sync').textContent = elapsedSec < 5 ? 'Just now' : `${elapsedSec}s ago`;

    requestAnimationFrame(appTick);
}



window.onload = async function() {
      // Initial sync
            await synchronizeTime();
// Start default auto-sync interval (5 mins)
            autoSyncTimer = setInterval(() => {
                synchronizeTime();
            }, 300000);
    requestAnimationFrame(appTick);
};