/**
 * InstaDown Pro — Frontend Application Logic
 * Modern, responsive media downloader for Instagram & YouTube
 */

(function () {
  'use strict';

  // ─── DOM Elements ──────────────────────────────────────────────────────────
  const elements = {
    // Navigation & Auth
    userMenu: document.getElementById('userMenu'),
    loginNavBtn: document.getElementById('loginNavBtn'),
    userAvatarBtn: document.getElementById('userAvatarBtn'),
    navAvatar: document.getElementById('navAvatar'),
    navUsername: document.getElementById('navUsername'),
    userDropdown: document.getElementById('userDropdown'),
    dropdownName: document.getElementById('dropdownName'),
    dropdownEmail: document.getElementById('dropdownEmail'),
    dropdownDownloads: document.getElementById('dropdownDownloads'),
    historyDropdownBtn: document.getElementById('historyDropdownBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    mobileDrawer: document.getElementById('mobileDrawer'),

    // Nav Links
    navInstagram: document.getElementById('navInstagram'),
    navYouTube: document.getElementById('navYouTube'),
    navHistory: document.getElementById('navHistory'),
    mobNavInstagram: document.getElementById('mobNavInstagram'),
    mobNavYouTube: document.getElementById('mobNavYouTube'),
    mobNavHistory: document.getElementById('mobNavHistory'),

    // Platform Selector
    platformSegmented: document.querySelector('.platform-segmented'),
    tabInstagram: document.getElementById('tabInstagram'),
    tabYouTube: document.getElementById('tabYouTube'),
    ytQualityBar: document.getElementById('ytQualityBar'),
    qualityPills: document.querySelectorAll('.q-pill'),

    // Downloader Card
    downloaderCard: document.getElementById('downloaderCard'),
    authBanner: document.getElementById('authBanner'),
    downloadSection: document.getElementById('downloadSection'),
    inputWrapper: document.getElementById('inputWrapper'),
    inputPlatformIcon: document.getElementById('inputPlatformIcon'),
    urlInput: document.getElementById('urlInput'),
    clearInputBtn: document.getElementById('clearInputBtn'),
    pasteBtn: document.getElementById('pasteBtn'),
    pasteBtnText: document.getElementById('pasteBtnText'),
    downloadBtn: document.getElementById('downloadBtn'),
    btnText: document.getElementById('btnText'),

    // State Cards
    loaderCard: document.getElementById('loaderCard'),
    loaderHeading: document.getElementById('loaderHeading'),
    loaderStep: document.getElementById('loaderStep'),
    progressBarFill: document.getElementById('progressBarFill'),

    errorCard: document.getElementById('errorCard'),
    errorMsg: document.getElementById('errorMsg'),
    errorRetryBtn: document.getElementById('errorRetryBtn'),

    resultCard: document.getElementById('resultCard'),
    mediaPreview: document.getElementById('mediaPreview'),
    platformMetaTag: document.getElementById('platformMetaTag'),
    mediaTitle: document.getElementById('mediaTitle'),
    mediaDesc: document.getElementById('mediaDesc'),
    specResolutionVal: document.getElementById('specResolutionVal'),
    specDurationVal: document.getElementById('specDurationVal'),
    specFormatVal: document.getElementById('specFormatVal'),
    specSizeVal: document.getElementById('specSizeVal'),
    downloadLink: document.getElementById('downloadLink'),
    finalDlText: document.getElementById('finalDlText'),
    copyUrlBtn: document.getElementById('copyUrlBtn'),
    resetBtn: document.getElementById('resetBtn'),

    // History Modal
    historyModal: document.getElementById('historyModal'),
    historyBody: document.getElementById('historyBody'),
    closeHistoryModal: document.getElementById('closeHistoryModal'),
    historySearchInput: document.getElementById('historySearchInput'),

    // Toast Container
    toastContainer: document.getElementById('toastContainer')
  };

  // ─── Application State ─────────────────────────────────────────────────────
  const state = {
    currentPlatform: 'instagram', // 'instagram' | 'youtube'
    selectedQuality: 'bestvideo[height<=2160]+bestaudio/best',
    isAudioOnly: false,
    isLoading: false,
    activeToken: null,
    stepInterval: null,
    cachedHistory: [],
    currentUser: null
  };

  // ─── Theme Management ──────────────────────────────────────────────────────
  function initTheme() {
    const saved = localStorage.getItem('instadown_theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('instadown_theme', next);
    showToast(`Switched to ${next} mode`);
  }

  // ─── Toast Notifications ───────────────────────────────────────────────────
  function showToast(message, icon = '✓') {
    if (!elements.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }

  // ─── Authentication Flow ───────────────────────────────────────────────────
  async function getSession() {
    return window.InstaDownAuth ? window.InstaDownAuth.session() : null;
  }

  async function logout() {
    try {
      if (window.InstaDownAuth) await window.InstaDownAuth.signOut();
    } finally {
      window.location.href = '/auth.html';
    }
  }

  async function refreshUserData() {
    try {
      const session = await getSession();
      if (!session) {
        showUnauthenticatedUI();
        return;
      }

      showAuthenticatedUI();

      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (res.status === 401) return logout();
      if (!res.ok) return;

      const data = await res.json();
      state.currentUser = data.user || {};

      const name = state.currentUser.full_name || state.currentUser.email || 'User';
      const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U';

      if (elements.navAvatar) elements.navAvatar.textContent = initials;
      if (elements.navUsername) elements.navUsername.textContent = name;
      if (elements.dropdownName) elements.dropdownName.textContent = name;
      if (elements.dropdownEmail) elements.dropdownEmail.textContent = state.currentUser.email || '';
      if (elements.dropdownDownloads) elements.dropdownDownloads.textContent = state.currentUser.downloads || 0;
    } catch (err) {
      console.error('Failed to load user profile:', err);
    }
  }

  function showAuthenticatedUI() {
    if (elements.userMenu) elements.userMenu.style.display = 'block';
    if (elements.loginNavBtn) elements.loginNavBtn.style.display = 'none';
    if (elements.authBanner) elements.authBanner.style.display = 'none';
  }

  function showUnauthenticatedUI() {
    if (elements.userMenu) elements.userMenu.style.display = 'none';
    if (elements.loginNavBtn) elements.loginNavBtn.style.display = 'inline-flex';
    if (elements.authBanner) elements.authBanner.style.display = 'flex';
  }

  // ─── Platform Switching ────────────────────────────────────────────────────
  function setPlatform(platform) {
    if (state.currentPlatform === platform) return;
    state.currentPlatform = platform;
    const isYT = platform === 'youtube';

    document.body.setAttribute('data-active-platform', platform);

    // Segmented tab pill slider
    if (elements.platformSegmented) {
      elements.platformSegmented.classList.toggle('yt-active', isYT);
    }

    // Tabs active states
    if (elements.tabInstagram) {
      elements.tabInstagram.classList.toggle('active', !isYT);
      elements.tabInstagram.setAttribute('aria-selected', !isYT);
    }
    if (elements.tabYouTube) {
      elements.tabYouTube.classList.toggle('active', isYT);
      elements.tabYouTube.setAttribute('aria-selected', isYT);
    }

    // Nav buttons active states
    if (elements.navInstagram) elements.navInstagram.classList.toggle('active', !isYT);
    if (elements.navYouTube) elements.navYouTube.classList.toggle('active', isYT);
    if (elements.mobNavInstagram) elements.mobNavInstagram.classList.toggle('active', !isYT);
    if (elements.mobNavYouTube) elements.mobNavYouTube.classList.toggle('active', isYT);

    // Input platform icon
    if (elements.inputPlatformIcon) {
      const igIcon = elements.inputPlatformIcon.querySelector('.icon-ig');
      const ytIcon = elements.inputPlatformIcon.querySelector('.icon-yt');
      if (igIcon) igIcon.style.display = isYT ? 'none' : 'block';
      if (ytIcon) ytIcon.style.display = isYT ? 'block' : 'none';
    }

    // YouTube quality options
    if (elements.ytQualityBar) {
      elements.ytQualityBar.style.display = isYT ? 'flex' : 'none';
    }

    // Input placeholder
    if (elements.urlInput) {
      elements.urlInput.placeholder = isYT
        ? 'Paste YouTube Video or Shorts link…'
        : 'Paste Instagram Reel or Video link…';
    }

    // Reset results and errors on platform switch
    hideAllStates();
  }

  // ─── URL Validation & Auto-Detection ───────────────────────────────────────
  function isInstagramUrl(str) {
    try {
      const u = new URL(str.startsWith('http') ? str : 'https://' + str);
      return /(^|\.)instagram\.com$/i.test(u.hostname);
    } catch {
      return false;
    }
  }

  function isYouTubeUrl(str) {
    try {
      const u = new URL(str.startsWith('http') ? str : 'https://' + str);
      return /(^|\.)youtube\.com$/i.test(u.hostname) || /^youtu\.be$/i.test(u.hostname);
    } catch {
      return false;
    }
  }

  function autoDetectPlatform(val) {
    const trimmed = (val || '').trim();
    if (isYouTubeUrl(trimmed)) {
      setPlatform('youtube');
      return 'youtube';
    } else if (isInstagramUrl(trimmed)) {
      setPlatform('instagram');
      return 'instagram';
    }
    return null;
  }

  // ─── Loader Steps Management ───────────────────────────────────────────────
  const STEP_MESSAGES = {
    instagram: [
      'Connecting to Instagram…',
      'Extracting high-resolution streams…',
      'Verifying audio track…',
      'Finalizing MP4 video…'
    ],
    youtube: [
      'Connecting to YouTube…',
      'Selecting video stream…',
      'Merging audio and video tracks…',
      'Finalizing media file…'
    ]
  };

  function startLoader() {
    state.isLoading = true;
    if (elements.downloadBtn) elements.downloadBtn.disabled = true;
    if (elements.btnText) elements.btnText.textContent = 'Processing…';

    hideAllStates();
    if (elements.loaderCard) elements.loaderCard.classList.add('visible');

    const steps = STEP_MESSAGES[state.currentPlatform] || STEP_MESSAGES.instagram;
    let index = 0;
    if (elements.loaderStep) elements.loaderStep.textContent = steps[index];

    clearInterval(state.stepInterval);
    state.stepInterval = setInterval(() => {
      index = (index + 1) % steps.length;
      if (elements.loaderStep) elements.loaderStep.textContent = steps[index];
    }, 1500);
  }

  function stopLoader() {
    state.isLoading = false;
    clearInterval(state.stepInterval);
    if (elements.downloadBtn) elements.downloadBtn.disabled = false;
    if (elements.btnText) elements.btnText.textContent = 'Download';
    if (elements.loaderCard) elements.loaderCard.classList.remove('visible');
  }

  function hideAllStates() {
    if (elements.loaderCard) elements.loaderCard.classList.remove('visible');
    if (elements.errorCard) elements.errorCard.classList.remove('visible');
    if (elements.resultCard) elements.resultCard.classList.remove('visible');
    clearInterval(state.stepInterval);
  }

  function showError(message) {
    hideAllStates();
    if (elements.errorMsg) {
      elements.errorMsg.textContent = message || 'Unable to download video. Please ensure the link is public and accessible.';
    }
    if (elements.errorCard) elements.errorCard.classList.add('visible');
  }

  // ─── Displaying Result Preview ─────────────────────────────────────────────
  function showResult(data) {
    hideAllStates();
    if (!elements.resultCard) return;

    elements.resultCard.classList.add('visible');

    // Thumbnail
    if (elements.mediaPreview) {
      elements.mediaPreview.innerHTML = '';
      if (data.thumbnail) {
        const img = document.createElement('img');
        img.src = data.thumbnail;
        img.alt = data.title || 'Video preview';
        img.loading = 'lazy';
        elements.mediaPreview.appendChild(img);
      } else {
        elements.mediaPreview.innerHTML = `
          <div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted)">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </div>
        `;
      }
    }

    // Platform & title
    const isYT = state.currentPlatform === 'youtube';
    if (elements.platformMetaTag) {
      elements.platformMetaTag.textContent = isYT
        ? (state.isAudioOnly ? 'YouTube Audio (MP3)' : 'YouTube Video')
        : 'Instagram Reel';
    }

    if (elements.mediaTitle) {
      elements.mediaTitle.textContent = data.title || (isYT ? 'YouTube Video' : 'Instagram Video');
    }

    // Specs
    if (elements.specResolutionVal) {
      elements.specResolutionVal.textContent = state.isAudioOnly
        ? '320 kbps'
        : (isYT ? (state.selectedQuality.includes('2160') ? '4K Ultra HD' : '1080p Full HD') : '1080p HD');
    }

    if (elements.specDurationVal) {
      elements.specDurationVal.textContent = data.durationFormatted || '--:--';
    }

    if (elements.specFormatVal) {
      elements.specFormatVal.textContent = state.isAudioOnly ? 'MP3' : 'MP4';
    }

    if (elements.specSizeVal) {
      const mb = data.fileSize ? (data.fileSize / (1024 * 1024)).toFixed(1) + ' MB' : 'Ready';
      elements.specSizeVal.textContent = mb;
    }

    // Download action
    const ext = state.isAudioOnly ? 'mp3' : 'mp4';
    const filename = `${state.currentPlatform}_${Date.now()}.${ext}`;

    if (elements.downloadLink) {
      elements.downloadLink.href = `${data.downloadUrl}?name=${encodeURIComponent(filename)}`;
      elements.downloadLink.setAttribute('download', filename);
    }

    if (elements.finalDlText) {
      elements.finalDlText.textContent = state.isAudioOnly ? 'Download MP3 Audio' : 'Download Video';
    }

    // Update download counter locally
    if (elements.dropdownDownloads) {
      const current = parseInt(elements.dropdownDownloads.textContent || '0', 10);
      elements.dropdownDownloads.textContent = current + 1;
    }

    showToast('Video ready for download!');
  }

  // ─── Download Process ──────────────────────────────────────────────────────
  async function handleDownload() {
    if (state.isLoading) return;

    const url = (elements.urlInput ? elements.urlInput.value : '').trim();
    if (!url) {
      if (elements.inputWrapper) {
        elements.inputWrapper.classList.add('shake');
        setTimeout(() => elements.inputWrapper.classList.remove('shake'), 500);
      }
      if (elements.urlInput) elements.urlInput.focus();
      return;
    }

    // Auto-detect and sync platform
    autoDetectPlatform(url);

    // Validate URL
    if (!isInstagramUrl(url) && !isYouTubeUrl(url)) {
      showError("Please enter a valid Instagram or YouTube video URL.");
      return;
    }

    // Check user authentication
    const session = await getSession();
    if (!session) {
      window.location.href = '/auth.html';
      return;
    }

    startLoader();

    try {
      const payload = {
        url,
        platform: state.currentPlatform,
        quality: state.isAudioOnly ? 'bestaudio/best' : state.selectedQuality,
        audioOnly: state.isAudioOnly
      };

      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      stopLoader();

      if (response.status === 401) {
        return logout();
      }

      if (!response.ok || !result.success) {
        showError(result.error || 'Failed to download video. Ensure it is public and try again.');
        return;
      }

      showResult(result);
    } catch (err) {
      stopLoader();
      console.error('Download request failed:', err);
      showError('Connection lost. Please verify your internet connection and try again.');
    }
  }

  // ─── Clipboard Paste Handling ──────────────────────────────────────────────
  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      if (elements.urlInput) {
        elements.urlInput.value = text;
        updateClearButton();
        autoDetectPlatform(text);
      }

      if (elements.pasteBtn && elements.pasteBtnText) {
        elements.pasteBtn.classList.add('pasted');
        elements.pasteBtnText.textContent = 'Pasted!';
        setTimeout(() => {
          elements.pasteBtn.classList.remove('pasted');
          elements.pasteBtnText.textContent = 'Paste';
        }, 1600);
      }

      // If valid URL, trigger download immediately
      if (isInstagramUrl(text) || isYouTubeUrl(text)) {
        handleDownload();
      }
    } catch (e) {
      if (elements.urlInput) {
        elements.urlInput.focus();
        elements.urlInput.select();
      }
    }
  }

  function updateClearButton() {
    if (!elements.clearInputBtn || !elements.urlInput) return;
    elements.clearInputBtn.style.display = elements.urlInput.value.length > 0 ? 'flex' : 'none';
  }

  // ─── Download History Modal ────────────────────────────────────────────────
  async function openHistoryModal() {
    if (elements.userDropdown) elements.userDropdown.classList.remove('open');
    if (elements.mobileDrawer) elements.mobileDrawer.classList.remove('open');
    if (elements.historyModal) elements.historyModal.classList.add('open');

    if (elements.historyBody) {
      elements.historyBody.innerHTML = `
        <div class="history-loading">
          <div class="spinner-ring sm"></div>
          <span>Loading download history…</span>
        </div>
      `;
    }

    try {
      const session = await getSession();
      if (!session) {
        window.location.href = '/auth.html';
        return;
      }

      const res = await fetch('/api/auth/history', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (res.status === 401) return logout();
      const data = await res.json();
      state.cachedHistory = data.history || [];
      renderHistoryList(state.cachedHistory);
    } catch (err) {
      if (elements.historyBody) {
        elements.historyBody.innerHTML = `
          <div class="history-empty">
            <p>Could not load history at this moment.</p>
          </div>
        `;
      }
    }
  }

  function closeHistory() {
    if (elements.historyModal) elements.historyModal.classList.remove('open');
  }

  function renderHistoryList(items) {
    if (!elements.historyBody) return;

    if (!items || items.length === 0) {
      elements.historyBody.innerHTML = `
        <div class="history-empty">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.5">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <p>No downloads yet.</p>
          <span style="font-size:0.8rem;color:var(--text-muted)">Videos you download will be saved here for quick access.</span>
        </div>
      `;
      return;
    }

    const html = `
      <div class="history-list">
        ${items.map(item => {
          const isYT = item.url.includes('youtube') || item.url.includes('youtu.be');
          const title = item.title || item.url;
          const timeAgo = formatTimeAgo(item.downloaded_at);
          const icon = isYT
            ? `<div class="history-platform-badge yt"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z"/></svg></div>`
            : `<div class="history-platform-badge ig"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg></div>`;

          return `
            <div class="history-row">
              ${icon}
              <div class="history-info">
                <div class="history-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
                <div class="history-meta-sub">${timeAgo} &middot; ${escapeHtml(item.media_type || 'video')}</div>
              </div>
              <div class="history-actions">
                <button class="btn-history-action btn-redownload" data-url="${escapeHtml(item.url)}" title="Download again">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Get
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    elements.historyBody.innerHTML = html;

    // Attach re-download clicks
    elements.historyBody.querySelectorAll('.btn-redownload').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-url');
        if (url && elements.urlInput) {
          elements.urlInput.value = url;
          closeHistory();
          autoDetectPlatform(url);
          handleDownload();
        }
      });
    });
  }

  function filterHistory(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
      renderHistoryList(state.cachedHistory);
      return;
    }
    const filtered = state.cachedHistory.filter(item => {
      return (item.title && item.title.toLowerCase().includes(q)) ||
             (item.url && item.url.toLowerCase().includes(q));
    });
    renderHistoryList(filtered);
  }

  // ─── Utility Helpers ───────────────────────────────────────────────────────
  function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Recently';
    const date = new Date(timestamp);
    const sec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (sec < 60) return 'Just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    return `${days}d ago`;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ─── Setup Event Listeners ─────────────────────────────────────────────────
  function setupEventListeners() {
    // Theme toggle
    elements.themeToggleBtn?.addEventListener('click', toggleTheme);

    // Platform switcher tabs
    elements.tabInstagram?.addEventListener('click', () => setPlatform('instagram'));
    elements.tabYouTube?.addEventListener('click', () => setPlatform('youtube'));
    elements.navInstagram?.addEventListener('click', () => setPlatform('instagram'));
    elements.navYouTube?.addEventListener('click', () => setPlatform('youtube'));
    elements.mobNavInstagram?.addEventListener('click', () => {
      setPlatform('instagram');
      elements.mobileDrawer?.classList.remove('open');
    });
    elements.mobNavYouTube?.addEventListener('click', () => {
      setPlatform('youtube');
      elements.mobileDrawer?.classList.remove('open');
    });

    // YouTube format pills
    elements.qualityPills.forEach(pill => {
      pill.addEventListener('click', () => {
        elements.qualityPills.forEach(p => {
          p.classList.remove('sel');
          p.setAttribute('aria-checked', 'false');
        });
        pill.classList.add('sel');
        pill.setAttribute('aria-checked', 'true');
        state.selectedQuality = pill.dataset.quality;
        state.isAudioOnly = pill.dataset.type === 'audio';
      });
    });

    // Input events
    elements.urlInput?.addEventListener('input', () => {
      updateClearButton();
      autoDetectPlatform(elements.urlInput.value);
    });

    elements.urlInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleDownload();
    });

    elements.clearInputBtn?.addEventListener('click', () => {
      if (elements.urlInput) {
        elements.urlInput.value = '';
        updateClearButton();
        elements.urlInput.focus();
      }
    });

    elements.pasteBtn?.addEventListener('click', handlePaste);
    elements.downloadBtn?.addEventListener('click', handleDownload);
    elements.errorRetryBtn?.addEventListener('click', handleDownload);

    // Reset button
    elements.resetBtn?.addEventListener('click', () => {
      if (elements.urlInput) {
        elements.urlInput.value = '';
        updateClearButton();
        elements.urlInput.focus();
      }
      hideAllStates();
    });

    // Copy URL button
    elements.copyUrlBtn?.addEventListener('click', async () => {
      if (!elements.downloadLink || !elements.downloadLink.href) return;
      try {
        await navigator.clipboard.writeText(elements.downloadLink.href);
        showToast('Download link copied to clipboard!');
      } catch (err) {
        showToast('Link copied!');
      }
    });

    // User Avatar dropdown
    elements.userAvatarBtn?.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = elements.userDropdown?.classList.toggle('open');
      elements.userAvatarBtn.setAttribute('aria-expanded', !!isOpen);
    });

    document.addEventListener('click', () => {
      elements.userDropdown?.classList.remove('open');
      elements.userAvatarBtn?.setAttribute('aria-expanded', 'false');
    });

    elements.userDropdown?.addEventListener('click', e => e.stopPropagation());
    elements.logoutBtn?.addEventListener('click', logout);

    // History modal
    elements.navHistory?.addEventListener('click', openHistoryModal);
    elements.mobNavHistory?.addEventListener('click', openHistoryModal);
    elements.historyDropdownBtn?.addEventListener('click', openHistoryModal);
    elements.closeHistoryModal?.addEventListener('click', closeHistory);
    elements.historyModal?.addEventListener('click', e => {
      if (e.target === elements.historyModal) closeHistory();
    });

    elements.historySearchInput?.addEventListener('input', e => {
      filterHistory(e.target.value);
    });

    // Mobile menu drawer
    elements.mobileMenuBtn?.addEventListener('click', () => {
      elements.mobileDrawer?.classList.toggle('open');
    });

    // Keyboard global shortcut: Ctrl/Cmd + V to focus input if not focused
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeHistory();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && document.activeElement !== elements.urlInput) {
        elements.urlInput?.focus();
      }
    });
  }

  // ─── Initialize Application ────────────────────────────────────────────────
  async function init() {
    initTheme();
    setupEventListeners();
    await refreshUserData();
  }

  init();
})();
