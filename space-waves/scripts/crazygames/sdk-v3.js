// Crazygames sdk-v3.js
(() => {
    "use strict";

    const CONFIG = {
        adUnits: {
            rewarded: '/21849154601,22866254644/Ad.Plus-Rewarded'
        },
        fallbackVideosUrl: '../../scripts/ads/fallback-videos.json',
        loadingGifUrl: '../../scripts/ads/thumb_anim.gif',
        adTimeout: 8000,
        minLoadingTime: 800
    };

    let isAdActive = false;
    let fallbackVideos = [];
    let lastIndex = -1;
    let freezeTimer = null;
    let currentVideoElement = null;
    let gptSlot = null;
    let loadingOverlay = null;
    let loadingStartTime = 0;

    function injectStyles() {
        if (document.getElementById('crazygames-sdk-styles')) return;
        const css = `
            #crazygames-gameplay-freeze { position: fixed; inset: 0; z-index: 999999998; pointer-events: all; background: rgba(0,0,0,0.01); }
            .crazygames-video-overlay { position: fixed; inset: 0; background: #000; z-index: 999999999; display: flex; align-items: center; justify-content: center; }
            .crazygames-loading-overlay {
                position: fixed; inset: 0; background: #000; z-index: 999999999;
                display: flex; align-items: center; justify-content: center;
            }
            .crazygames-loading-spinner { width: 120px; height: 120px; }
            .crazygames-cta-button {
                position: absolute; top: 36px; right: 16px;
                padding: 16px; background: #FFFFFF; color: #002B50;
                font-family: sans-serif; font-size: 18px; font-weight: bold;
                border: 1px solid #b2b2b2; border-radius: 6px;
                text-decoration: none; z-index: 1000000002;
                transition: transform 0.2s;
                cursor: pointer;
            }
            .crazygames-cta-button:hover { transform: scale(1.04); }
            .crazygames-pause-container {
                display: none;
                position: absolute;
                inset: 0;
                background: rgba(0,0,0,0.3);
                z-index: 1000000001;
                cursor: pointer;
            }
            .crazygames-play-icon {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 90px;
                height: 90px;
                background: rgba(0,0,0,0.3);
                border: 2px solid #fff;
                border-radius: 50px;
            }
            .crazygames-play-icon::after {
                content: '';
                position: absolute;
                top: 50%;
                left: 55%;
                transform: translate(-50%, -50%);
                border-style: solid;
                border-width: 15px 0 15px 25px;
                border-color: transparent transparent transparent #fff;
            }
            .crazygames-pulse { animation: crazygames-pulse-anim 1.5s infinite; }
            @keyframes crazygames-pulse-anim {
                0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
                100% { transform: translate(-50%, -50%) scale(1.3); opacity: 0; }
            }
            .crazygames-progress-bar {
                position: fixed;
                bottom: 0;
                left: 0;
                width: 100%;
                height: 6px;
                background: rgba(255,255,255,0.3);
                z-index: 1000000003;
            }
            .crazygames-progress-inner {
                width: 0%;
                height: 100%;
                background: #FFDC00;
            }
        `;
        const style = document.createElement('style');
        style.id = 'crazygames-sdk-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function initGPT() {
        window.googletag = window.googletag || { cmd: [] };

        if (!document.querySelector('script[src*="gpt.js"]')) {
            const script = document.createElement('script');
            script.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
            script.async = true;
            script.crossOrigin = 'anonymous';
            document.head.appendChild(script);
        }

        window.googletag.cmd.push(() => {
            window.googletag.pubads().enableSingleRequest();
            window.googletag.enableServices();
            console.log('[CrazyGames SDK] GPT Core Initialized');
        });
    }

    function showLoadingIndicator() {
        if (loadingOverlay) return;
        loadingStartTime = Date.now();
        loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'crazygames-loading-overlay';
        const spinner = document.createElement('img');
        spinner.src = CONFIG.loadingGifUrl;
        spinner.className = 'crazygames-loading-spinner';
        loadingOverlay.appendChild(spinner);
        document.body.appendChild(loadingOverlay);
    }

    async function hideLoadingIndicator() {
        if (!loadingOverlay) return;
        const elapsed = Date.now() - loadingStartTime;
        const remainingTime = Math.max(0, CONFIG.minLoadingTime - elapsed);
        if (remainingTime > 0) await new Promise(r => setTimeout(r, remainingTime));
        if (loadingOverlay && loadingOverlay.parentNode) loadingOverlay.remove();
        loadingOverlay = null;
    }

    async function loadFallbackList() {
        try {
            const res = await fetch(CONFIG.fallbackVideosUrl, { cache: "no-store" });
            fallbackVideos = await res.json();
            console.log("[CrazyGames SDK] Fallback list loaded");
        } catch (e) {
            console.warn("[CrazyGames SDK] Fallback load failed");
        }
    }

    function playFallbackVideo() {
        return new Promise((resolve) => {
            if (!fallbackVideos || !fallbackVideos.length) {
                unfreezeGame();
                return resolve();
            }

            if (freezeTimer) {
                clearTimeout(freezeTimer);
                freezeTimer = null;
            }

            let index;
            do {
                index = Math.floor(Math.random() * fallbackVideos.length);
            } while (index === lastIndex && fallbackVideos.length > 1);
            lastIndex = index;
            const videoData = fallbackVideos[index];

            const overlay = document.createElement("div");
            overlay.className = "crazygames-video-overlay";

            const video = document.createElement("video");
            video.src = videoData.src;
            video.autoplay = true;
            video.playsInline = true;
            video.style.cssText = "width:100%; height:100%; object-fit:contain; cursor:pointer;";
            currentVideoElement = video;

            const pauseLayer = document.createElement("div");
            pauseLayer.className = "crazygames-pause-container";
            pauseLayer.innerHTML = `
                <div class="crazygames-play-icon"></div>
                <div class="crazygames-play-icon crazygames-pulse"></div>
            `;

            const cta = document.createElement("a");
            cta.className = "crazygames-cta-button";
            cta.innerText = "Play Now!";
            cta.href = videoData.link;
            cta.target = "_blank";
            cta.onclick = (e) => {
                e.stopPropagation();
                if (!video.paused) {
                    video.pause();
                    pauseLayer.style.display = "block";
                }
            };

            const pb = document.createElement("div");
            pb.className = "crazygames-progress-bar";
            const pbi = document.createElement("div");
            pbi.className = "crazygames-progress-inner";
            pb.appendChild(pbi);

            overlay.appendChild(video);
            overlay.appendChild(pauseLayer);
            overlay.appendChild(cta);
            document.body.appendChild(overlay);
            document.body.appendChild(pb);

            video.onclick = (e) => {
                e.stopPropagation();
                video.pause();
                pauseLayer.style.display = "block";
            };

            pauseLayer.onclick = (e) => {
                e.stopPropagation();
                video.play();
                pauseLayer.style.display = "none";
            };

            const updateProgressBar = () => {
                if (video.duration) {
                    pbi.style.width = (video.currentTime / video.duration) * 100 + "%";
                }
                if (!video.paused && !video.ended) {
                    requestAnimationFrame(updateProgressBar);
                }
            };

            video.addEventListener('play', () => {
                requestAnimationFrame(updateProgressBar);
            });

            requestAnimationFrame(updateProgressBar);

            const onVideoEnd = () => {
                unfreezeGame();
                resolve();
            };
            video.onended = onVideoEnd;
            video.onerror = onVideoEnd;
        });
    }

    function showGPTRewardedAd() {
        return new Promise((resolve, reject) => {
            window.googletag.cmd.push(() => {
                let adStarted = false;
                let timeoutId;
                let listeners = [];

                const cleanup = () => {
                    clearTimeout(timeoutId);
                    listeners.forEach(l => window.googletag.pubads().removeEventListener(l.name, l.fn));
                    if (gptSlot) {
                        window.googletag.destroySlots([gptSlot]);
                        gptSlot = null;
                    }
                };

                gptSlot = window.googletag.defineOutOfPageSlot(
                    CONFIG.adUnits.rewarded,
                    window.googletag.enums.OutOfPageFormat.REWARDED
                );

                if (!gptSlot) return reject(new Error('no_slot'));
                gptSlot.addService(window.googletag.pubads());

                const addL = (name, fn) => {
                    window.googletag.pubads().addEventListener(name, fn);
                    listeners.push({ name, fn });
                };

                addL('slotRenderEnded', (event) => {
                    if (event.slot === gptSlot && event.isEmpty) {
                        console.log('[CrazyGames SDK] GPT: No fill');
                        cleanup();
                        reject(new Error('no_fill'));
                    }
                });

                addL('rewardedSlotReady', (event) => {
                    if (event.slot === gptSlot) {
                        console.log('[CrazyGames SDK] GPT: Ad ready');
                        adStarted = true;
                        clearTimeout(timeoutId);
                        hideLoadingIndicator().then(() => event.makeRewardedVisible());
                    }
                });

                addL('rewardedSlotClosed', (event) => {
                    if (event.slot === gptSlot) {
                        console.log('[CrazyGames SDK] GPT: Ad closed');
                        cleanup();
                        resolve();
                    }
                });

                addL('rewardedSlotGranted', (event) => {
                    if (event.slot === gptSlot) {
                        console.log('[CrazyGames SDK] GPT: Reward granted 🎁');
                    }
                });

                timeoutId = setTimeout(() => {
                    if (!adStarted) {
                        console.warn('[CrazyGames SDK] GPT: Timeout');
                        cleanup();
                        reject(new Error('timeout'));
                    }
                }, CONFIG.adTimeout);

                window.googletag.display(gptSlot);
            });
        });
    }

    function freezeGame() {
        if (document.getElementById('crazygames-gameplay-freeze')) return;
        const overlay = document.createElement('div');
        overlay.id = 'crazygames-gameplay-freeze';
        document.body.appendChild(overlay);

        if (freezeTimer) clearTimeout(freezeTimer);
        freezeTimer = setTimeout(() => unfreezeGame(), 180000);

        document.querySelectorAll('audio, video').forEach(el => {
            try { el.muted = true; } catch(e){}
        });
        try {
            if (window.audioContext) window.audioContext.suspend();
        } catch (e) {}
    }

    function unfreezeGame() {
        if (freezeTimer) clearTimeout(freezeTimer);
        freezeTimer = null;

        ['#crazygames-gameplay-freeze', '.crazygames-video-overlay', '.crazygames-progress-bar', '.crazygames-loading-overlay'].forEach(sel => {
            document.querySelectorAll(sel).forEach(el => el.remove());
        });

        document.querySelectorAll('audio, video').forEach(el => {
            try { el.muted = false; } catch(e){}
        });
        try {
            if (window.audioContext) window.audioContext.resume();
        } catch (e) {}

        isAdActive = false;
        currentVideoElement = null;
    }

    async function showRewardedAd() {
        if (isAdActive) return Promise.resolve();

        isAdActive = true;
        console.log('[CrazyGames SDK] Starting rewarded ad...');
        freezeGame();
        showLoadingIndicator();

        try {
            console.log('[CrazyGames SDK] Strategy: Direct GPT');
            await showGPTRewardedAd();
            console.log('[CrazyGames SDK] ✅ GPT ad completed');
            await hideLoadingIndicator();
            unfreezeGame();
        } catch (error) {
            console.warn('[CrazyGames SDK] GPT failed, using fallback:', error.message);
            await hideLoadingIndicator();
            await playFallbackVideo();
        }

        isAdActive = false;
        console.log('[CrazyGames SDK] Rewarding user');

        return Promise.resolve();
    }

    // === CRAZYGAMES SDK MODULES ===

    class CustomAdModule {
        constructor() {
            this.adPlaying = false;
        }

	addAdblockPopupListener(callback) {
            console.log('[CrazyGames SDK] Adblock popup listener added');
        }

        removeAdblockPopupListener(callback) {
            console.log('[CrazyGames SDK] Adblock popup listener removed');
        }

        async hasAdblock() {
            // Возвращаем false, чтобы игра думала, что блокировщика нет
            return false;
        }

        prefetchAd(type) {
            console.log(`[CrazyGames SDK] Prefetch ${type} ad - IGNORED`);
        }

        async requestAd(type, callbacks = {}) {
            console.log(`[CrazyGames SDK] Request ${type} ad`);

            // Блокируем все типы рекламы кроме rewarded
            if (type !== 'rewarded') {
                console.log(`[CrazyGames SDK] BLOCKING ${type} ad - only "rewarded" is allowed`);
                if (callbacks.adFinished) {
                    setTimeout(() => callbacks.adFinished(), 10);
                }
                return Promise.resolve();
            }

            console.log(`[CrazyGames SDK] ✅ SHOWING ${type} ad`);

            if (callbacks.adStarted) callbacks.adStarted();

            try {
                await showRewardedAd();
                if (callbacks.adFinished) callbacks.adFinished();
            } catch (error) {
                if (callbacks.adError) {
                    callbacks.adError({ code: 'other', message: error.message });
                } else if (callbacks.adFinished) {
                    callbacks.adFinished();
                }
            }
        }

        async hasAdblock() {
            return false;
        }

        get isAdPlaying() {
            return isAdActive;
        }
    }

    class CustomBannerModule {
        constructor() {
            this.renderedBanners = new Set();
        }

        async requestBanner(options) {
            console.log('[CrazyGames SDK] Banner requested - BLOCKED');
            return Promise.resolve();
        }

        async requestResponsiveBanner(containerId) {
            console.log('[CrazyGames SDK] Responsive banner requested - BLOCKED');
            return Promise.resolve();
        }

        async requestOverlayBanners(options) {
            console.log('[CrazyGames SDK] Overlay banners requested - BLOCKED');
            return Promise.resolve();
        }

        clearBanner(containerId) {
            this.renderedBanners.delete(containerId);
        }

        clearAllBanners() {
            this.renderedBanners.clear();
        }

        get activeBannersCount() {
            return this.renderedBanners.size;
        }
    }

    class CustomGameModule {
        constructor() {
            this.link = window.location.href;
            this.id = 'game';
        }

        happytime() {
            console.log('[CrazyGames SDK] Happytime');
        }

        gameplayStart() {
            console.log('[CrazyGames SDK] Gameplay start');
            unfreezeGame();
        }

        gameplayStop() {
            console.log('[CrazyGames SDK] Gameplay stop');
        }

        loadingStart() {
            console.log('[CrazyGames SDK] Loading start');
        }

        loadingStop() {
            console.log('[CrazyGames SDK] Loading stop');
            unfreezeGame();
        }

	addSettingsChangeListener(callback) {
            console.log('[CrazyGames SDK] addSettingsChangeListener called (stub)');
        }

        removeSettingsChangeListener(callback) {
            console.log('[CrazyGames SDK] removeSettingsChangeListener called (stub)');
        }

        inviteLink(params) {
            return this.link;
        }

        showInviteButton(params) {
            return this.link;
        }

        hideInviteButton() {}

        getInviteParam(key) {
            const params = new URLSearchParams(window.location.search);
            return params.get(key);
        }
    }

    class CustomUserModule {
        constructor() {
            this.user = null;
        }

        async showAuthPrompt() {
            return Promise.resolve(null);
        }

        async getUser() {
            return this.user;
        }

        async getUserToken() {
            throw new Error('User authentication not available');
        }

        async getXsollaUserToken() {
            console.warn('[CrazyGames SDK] getXsollaUserToken called but not implemented.');
            return null;
        }

        get isUserAccountAvailable() {
            return false;
        }

        get systemInfo() {
            return {
                device: { type: 'desktop' },
                browser: { name: 'unknown', version: 'unknown' },
                os: { name: 'unknown', version: 'unknown' }
            };
        }

        addAuthListener(callback) {}
        removeAuthListener(callback) {}
    }

    class CustomDataModule {
        constructor() {
            this.storage = {};
            this.loadFromLocalStorage();
        }

	syncUnityGameData() {
            console.log('[CrazyGames SDK] syncUnityGameData called (no-op)');
            //this.saveToLocalStorage();
        }

        loadFromLocalStorage() {
            try {
                const saved = localStorage.getItem('crazygames_sdk_data');
                if (saved) this.storage = JSON.parse(saved);
            } catch (e) {
                console.warn('[CrazyGames SDK] Failed to load data');
            }
        }

        saveToLocalStorage() {
            try {
                localStorage.setItem('crazygames_sdk_data', JSON.stringify(this.storage));
            } catch (e) {
                console.warn('[CrazyGames SDK] Failed to save data');
            }
        }

        getItem(key) {
            return this.storage[key] || null;
        }

        setItem(key, value) {
            this.storage[key] = String(value);
            this.saveToLocalStorage();
        }

        removeItem(key) {
            delete this.storage[key];
            this.saveToLocalStorage();
        }

        clear() {
            this.storage = {};
            this.saveToLocalStorage();
        }
    }

    class CustomAnalyticsModule {
        trackOrder(provider, orderJson) {
            console.log('[CrazyGames SDK] Track order:', provider);
        }
    }

    // Main SDK
    class CustomSDK {
        constructor() {
            this.initialized = false;
            this.adModule = new CustomAdModule();
            this.bannerModule = new CustomBannerModule();
            this.gameModule = new CustomGameModule();
            this.userModule = new CustomUserModule();
            this.dataModule = new CustomDataModule();
            this.analyticsModule = new CustomAnalyticsModule();
        }

        async init(options = {}) {
            if (this.initialized) {
                console.warn('[CrazyGames SDK] Already initialized');
                return;
            }

            console.log('[CrazyGames SDK] Initializing...');
            this.initialized = true;
            console.log('[CrazyGames SDK] ✅ Ready');
        }

        get ad() { return this.adModule; }
        get banner() { return this.bannerModule; }
        get game() { return this.gameModule; }
        get user() { return this.userModule; }
        get data() { return this.dataModule; }
        get analytics() { return this.analyticsModule; }
        get environment() { return 'crazygames'; }
        get isQaTool() { return false; }
    }

    // Expose SDK
    window.CrazyGames = {
        SDK: new CustomSDK()
    };

    injectStyles();
    loadFallbackList();
    initGPT();
    console.log("%c CrazyGames SDK V3 Ready ", "background: #222; color: #00d4ff; padding: 5px; border-radius: 3px;");
})();

