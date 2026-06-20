/**
 * BigQuery Release Notes Explorer - Client Script
 */

document.addEventListener('DOMContentLoaded', () => {
    // State management
    let state = {
        updates: [],
        filteredUpdates: [],
        currentFilter: 'all',
        searchQuery: '',
        sortBy: 'newest',
        selectedUpdateForTweet: null
    };

    // DOM Elements
    const notesList = document.getElementById('notes-list');
    const skeletonLoader = document.getElementById('skeleton-loader');
    const emptyState = document.getElementById('empty-state');
    const errorBanner = document.getElementById('error-banner');
    const errorMessage = document.getElementById('error-message');
    const btnDismissError = document.getElementById('btn-dismiss-error');
    
    const btnRefresh = document.getElementById('btn-refresh');
    const refreshIcon = document.getElementById('refresh-icon');
    const lastFetchedText = document.getElementById('last-fetched-text');
    
    const searchInput = document.getElementById('search-input');
    const btnClearSearch = document.getElementById('btn-clear-search');
    const filterChips = document.getElementById('filter-chips');
    const sortSelect = document.getElementById('sort-select');
    const btnResetFilters = document.getElementById('btn-reset-filters');

    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    const themeToggleIcon = document.getElementById('theme-toggle-icon');
    
    // Modal Elements
    const tweetModal = document.getElementById('tweet-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelTweet = document.getElementById('btn-cancel-tweet');
    const btnSubmitTweet = document.getElementById('btn-submit-tweet');
    const tweetTextarea = document.getElementById('tweet-textarea');
    const previewLinkTitle = document.getElementById('preview-link-title');
    const charCountCurrent = document.getElementById('char-count-current');
    const progressRingCircle = document.getElementById('progress-ring-circle');
    const charWarning = document.getElementById('char-warning');

    // Progress Ring configuration
    const ringRadius = 10;
    const ringCircumference = 2 * Math.PI * ringRadius;
    progressRingCircle.style.strokeDasharray = `${ringCircumference} ${ringCircumference}`;
    progressRingCircle.style.strokeDashoffset = ringCircumference;

    // Initialize application
    init();

    function init() {
        initTheme();
        fetchReleaseNotes();
        setupEventListeners();
    }

    // ==========================================================================
    // API INTERACTIONS
    // ==========================================================================
    
    async function fetchReleaseNotes(force = false) {
        showLoading(true);
        hideError();
        
        const endpoint = force ? '/api/release-notes/refresh' : '/api/release-notes';
        
        try {
            const response = await fetch(endpoint);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            
            if (result.status === 'success') {
                state.updates = result.data;
                updateLastFetchedTime(result.last_fetched);
                updateCategoryCounts();
                applyFiltersAndRender();
            } else {
                throw new Error(result.message || 'Unknown backend error');
            }
        } catch (error) {
            console.error('Failed to load release notes:', error);
            showError(`Failed to fetch release notes: ${error.message}. Showing cached data if available.`);
            
            // Try fallback to whatever cached updates exist in the list
            if (state.updates.length > 0) {
                updateCategoryCounts();
                applyFiltersAndRender();
            } else {
                showEmptyState(true);
            }
        } finally {
            showLoading(false);
        }
    }

    // ==========================================================================
    // EVENT LISTENERS
    // ==========================================================================
    
    function setupEventListeners() {
        // Theme toggle
        btnThemeToggle.addEventListener('click', () => {
            toggleTheme();
        });

        // Refresh button
        btnRefresh.addEventListener('click', () => {
            fetchReleaseNotes(true);
        });

        // Search input
        searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value.toLowerCase().trim();
            btnClearSearch.style.display = state.searchQuery ? 'block' : 'none';
            applyFiltersAndRender();
        });

        // Clear search button
        btnClearSearch.addEventListener('click', () => {
            searchInput.value = '';
            state.searchQuery = '';
            btnClearSearch.style.display = 'none';
            applyFiltersAndRender();
            searchInput.focus();
        });

        // Filter chips click
        filterChips.addEventListener('click', (e) => {
            const chip = e.target.closest('.chip');
            if (!chip) return;
            
            // Toggle active class
            filterChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            
            state.currentFilter = chip.dataset.type;
            applyFiltersAndRender();
        });

        // Sort select dropdown
        sortSelect.addEventListener('change', (e) => {
            state.sortBy = e.target.value;
            applyFiltersAndRender();
        });

        // Dismiss error banner
        btnDismissError.addEventListener('click', hideError);

        // Reset filters button in empty state
        btnResetFilters.addEventListener('click', resetFilters);

        // Modal Close listeners
        btnCloseModal.addEventListener('click', closeModal);
        btnCancelTweet.addEventListener('click', closeModal);
        tweetModal.addEventListener('click', (e) => {
            if (e.target === tweetModal) closeModal();
        });

        // Submit tweet to Twitter Intent
        btnSubmitTweet.addEventListener('click', submitTweet);

        // Tweet textarea character counting and adjustments
        tweetTextarea.addEventListener('input', () => {
            updateTweetCharCounter();
        });
    }

    // ==========================================================================
    // FILTERING, SORTING, & RENDERING
    // ==========================================================================

    function resetFilters() {
        searchInput.value = '';
        state.searchQuery = '';
        btnClearSearch.style.display = 'none';
        
        state.currentFilter = 'all';
        filterChips.querySelectorAll('.chip').forEach(c => {
            if (c.dataset.type === 'all') c.classList.add('active');
            else c.classList.remove('active');
        });
        
        state.sortBy = 'newest';
        sortSelect.value = 'newest';
        
        applyFiltersAndRender();
    }

    function updateCategoryCounts() {
        const counts = {
            all: state.updates.length,
            feature: 0,
            announcement: 0,
            breaking: 0,
            issue: 0,
            change: 0
        };
        
        state.updates.forEach(u => {
            const type = u.type.toLowerCase();
            if (type in counts) {
                counts[type]++;
            }
        });
        
        Object.keys(counts).forEach(key => {
            const span = document.getElementById(`count-${key}`);
            if (span) {
                span.textContent = `(${counts[key]})`;
            }
        });
    }

    function applyFiltersAndRender() {
        let filtered = [...state.updates];

        // 1. Apply Type Filter
        if (state.currentFilter !== 'all') {
            filtered = filtered.filter(u => u.type.toLowerCase() === state.currentFilter);
        }

        // 2. Apply Search Filter
        if (state.searchQuery) {
            filtered = filtered.filter(u => {
                const searchContent = `${u.type} ${u.date} ${u.content_text}`.toLowerCase();
                return searchContent.includes(state.searchQuery);
            });
        }

        // 3. Apply Sorting
        filtered.sort((a, b) => {
            // Compare ISO dates or fall back to array indexing
            const dateA = new Date(a.updated_iso || 0);
            const dateB = new Date(b.updated_iso || 0);
            
            if (state.sortBy === 'newest') {
                return dateB - dateA;
            } else {
                return dateA - dateB;
            }
        });

        state.filteredUpdates = filtered;
        renderUpdates();
    }

    function renderUpdates() {
        notesList.innerHTML = '';
        
        if (state.filteredUpdates.length === 0) {
            showEmptyState(true);
            notesList.style.display = 'none';
            return;
        }

        showEmptyState(false);
        notesList.style.display = 'flex';
        
        state.filteredUpdates.forEach(update => {
            const card = createCard(update);
            notesList.appendChild(card);
        });
    }

    function createCard(update) {
        const typeClass = `type-${update.type.toLowerCase()}`;
        const badgeClass = update.type.toLowerCase();
        
        const card = document.createElement('article');
        card.className = `release-card ${typeClass}`;
        card.id = `card-${update.id}`;
        card.setAttribute('aria-label', `BigQuery ${update.type} release note from ${update.date}`);
        
        card.innerHTML = `
            <div class="card-header">
                <div class="card-meta">
                    <span class="type-badge ${badgeClass}">${update.type}</span>
                    <span class="card-date">
                        <i class="fa-regular fa-calendar"></i>
                        <span>${update.date}</span>
                    </span>
                </div>
                <div class="card-actions">
                    <button class="btn-copy" data-id="${update.id}" title="Copy formatted update to clipboard">
                        <i class="fa-regular fa-copy"></i>
                        <span>Copy</span>
                    </button>
                    <button class="btn-share" data-id="${update.id}" title="Share this update on X / Twitter">
                        <i class="fa-brands fa-x-twitter"></i>
                        <span>Tweet</span>
                    </button>
                </div>
            </div>
            <div class="card-content">
                ${update.content_html}
            </div>
        `;

        // Wire up Tweet share button on card
        const btnShare = card.querySelector('.btn-share');
        btnShare.addEventListener('click', () => {
            openTweetModal(update);
        });

        // Wire up Copy button on card
        const btnCopy = card.querySelector('.btn-copy');
        btnCopy.addEventListener('click', () => {
            const copyText = `BigQuery Release [${update.type}] (${update.date}):\n"${update.content_text}"\n\nRead more: ${update.link}`;
            navigator.clipboard.writeText(copyText).then(() => {
                const icon = btnCopy.querySelector('i');
                const text = btnCopy.querySelector('span');
                
                // Swap icon and text for success feedback
                icon.className = 'fa-solid fa-check';
                text.textContent = 'Copied!';
                btnCopy.style.color = '#10b981';
                btnCopy.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                
                setTimeout(() => {
                    icon.className = 'fa-regular fa-copy';
                    text.textContent = 'Copy';
                    btnCopy.style.color = '';
                    btnCopy.style.borderColor = '';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
            });
        });

        return card;
    }

    // ==========================================================================
    // TWITTER INTEGRATION & CHARACTER COUNTING
    // ==========================================================================

    function openTweetModal(update) {
        state.selectedUpdateForTweet = update;
        
        // Build preview link title
        previewLinkTitle.textContent = `BigQuery Release Notes (${update.date}) - Google Cloud`;
        
        // Create initial tweet text
        const defaultTweetText = prepareDefaultTweet(update);
        tweetTextarea.value = defaultTweetText;
        
        // Trigger modal visibility
        tweetModal.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // prevent back scroll
        
        updateTweetCharCounter();
        
        // Focus and select textarea text
        setTimeout(() => {
            tweetTextarea.focus();
            tweetTextarea.setSelectionRange(tweetTextarea.value.length, tweetTextarea.value.length);
        }, 150);
    }

    function closeModal() {
        tweetModal.style.display = 'none';
        document.body.style.overflow = '';
        state.selectedUpdateForTweet = null;
    }

    /**
     * Estimates character count for X/Twitter where URLs are shortened to 23 chars.
     */
    function countTwitterCharacters(text) {
        const urlRegex = /https?:\/\/[^\s]+/g;
        const urlMatches = text.match(urlRegex) || [];
        
        // Subtract URL lengths and add 23 characters for each URL
        let textWithoutUrls = text.replace(urlRegex, '');
        return textWithoutUrls.length + (urlMatches.length * 23);
    }

    function prepareDefaultTweet(update) {
        const typeStr = update.type;
        const dateStr = update.date;
        const linkStr = update.link;
        let text = update.content_text;
        
        // Clean up redundant whitespace
        text = text.replace(/\s+/g, ' ').trim();
        
        const prefix = `BigQuery [${typeStr}] (${dateStr}):\n"`;
        const suffix = `"\n\nDetails: ${linkStr}`;
        
        // Twitter details: URLs are counted as exactly 23 chars
        const urlLengthInTwitter = 23;
        const textOverhead = prefix.length + 3 + urlLengthInTwitter + 2; // prefix + '\n\nDetails: ' (11) + 23 + '"\n' (2)
        const maxTextLen = 280 - textOverhead;
        
        if (text.length > maxTextLen) {
            text = text.substring(0, maxTextLen - 3) + '...';
        }
        
        return `${prefix}${text}${suffix}`;
    }

    function updateTweetCharCounter() {
        const text = tweetTextarea.value;
        const charCount = countTwitterCharacters(text);
        
        charCountCurrent.textContent = charCount;
        
        // Update styling based on character length
        const maxChars = 280;
        const progressRing = document.querySelector('.progress-ring-container');
        
        const charCountContainer = document.querySelector('.char-count-container');
        charCountContainer.className = 'char-count-container'; // reset
        
        if (charCount > maxChars) {
            charCountContainer.classList.add('exceeded');
            charWarning.style.display = 'flex';
            btnSubmitTweet.disabled = true;
            btnSubmitTweet.style.opacity = '0.5';
            btnSubmitTweet.style.cursor = 'not-allowed';
            setProgress(maxChars, maxChars, '#f43f5e');
        } else {
            charWarning.style.display = 'none';
            btnSubmitTweet.disabled = false;
            btnSubmitTweet.style.opacity = '1';
            btnSubmitTweet.style.cursor = 'pointer';
            
            if (charCount >= maxChars - 20) {
                charCountContainer.classList.add('warning');
                setProgress(charCount, maxChars, '#f59e0b');
            } else {
                setProgress(charCount, maxChars, '#3b82f6');
            }
        }
    }

    function setProgress(current, max, color) {
        const percent = Math.min((current / max) * 100, 100);
        const offset = ringCircumference - (percent / 100) * ringCircumference;
        progressRingCircle.style.strokeDashoffset = offset;
        progressRingCircle.style.stroke = color;
    }

    function submitTweet() {
        const tweetText = tweetTextarea.value.trim();
        if (!tweetText) return;
        
        const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
        window.open(twitterIntentUrl, '_blank', 'width=600,height=400,resizable=yes');
        closeModal();
    }

    // ==========================================================================
    // UI HELPERS
    // ==========================================================================
    
    function showLoading(isLoading) {
        if (isLoading) {
            skeletonLoader.style.display = 'flex';
            notesList.style.display = 'none';
            emptyState.style.display = 'none';
            refreshIcon.classList.add('spin');
            btnRefresh.disabled = true;
            
            const statusDot = document.querySelector('.status-dot');
            statusDot.className = 'status-dot loading';
            lastFetchedText.textContent = 'Updating feed...';
        } else {
            skeletonLoader.style.display = 'none';
            refreshIcon.classList.remove('spin');
            btnRefresh.disabled = false;
            
            const statusDot = document.querySelector('.status-dot');
            statusDot.className = 'status-dot';
        }
    }

    function showEmptyState(show) {
        emptyState.style.display = show ? 'flex' : 'none';
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorBanner.style.display = 'flex';
        // Auto-dismiss after 10 seconds
        setTimeout(hideError, 10000);
    }

    function hideError() {
        errorBanner.style.display = 'none';
    }

    function updateLastFetchedTime(timestamp) {
        if (!timestamp) {
            lastFetchedText.textContent = 'Updated just now';
            return;
        }
        
        const lastFetched = new Date(timestamp * 1000);
        
        const updateText = () => {
            const secondsAgo = Math.floor((new Date() - lastFetched) / 1000);
            if (secondsAgo < 60) {
                lastFetchedText.textContent = 'Updated just now';
            } else if (secondsAgo < 3600) {
                const minutes = Math.floor(secondsAgo / 60);
                lastFetchedText.textContent = `Updated ${minutes}m ago`;
            } else {
                const hours = Math.floor(secondsAgo / 3600);
                lastFetchedText.textContent = `Updated ${hours}h ago`;
            }
        };
        
        updateText();
        // Set up periodic update of the relative timestamp indicator
        if (window.fetchedTimer) clearInterval(window.fetchedTimer);
        window.fetchedTimer = setInterval(updateText, 60000);
    }

    // ==========================================================================
    // THEME SWITCHER HELPER FUNCTIONS
    // ==========================================================================
    
    function initTheme() {
        const savedTheme = localStorage.getItem('theme');
        // Default to dark mode if not specified
        if (savedTheme === 'light') {
            document.body.classList.add('light-mode');
            themeToggleIcon.className = 'fa-solid fa-sun';
        } else {
            document.body.classList.remove('light-mode');
            themeToggleIcon.className = 'fa-solid fa-moon';
        }
    }

    function toggleTheme() {
        const isLight = document.body.classList.toggle('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        
        if (isLight) {
            themeToggleIcon.className = 'fa-solid fa-sun';
        } else {
            themeToggleIcon.className = 'fa-solid fa-moon';
        }
        
        // Add a micro-animation (brief rotate)
        themeToggleIcon.style.transform = 'rotate(360deg)';
        themeToggleIcon.style.transition = 'transform 0.3s ease';
        setTimeout(() => {
            themeToggleIcon.style.transform = '';
            themeToggleIcon.style.transition = '';
        }, 300);
    }
});
