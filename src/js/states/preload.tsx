import { CHANGELOG } from "@/changelog";
import { globalConfig } from "@/core/config";
import { GameState } from "@/core/game_state";
import { Logger } from "@/core/logging";
import { getRandomHint } from "@/game/hints";
import { HUDModalDialogs } from "@/game/hud/parts/modal_dialogs";
import { T, autoDetectLanguageId, updateApplicationLanguage } from "@/translations";

const logger = new Logger("state/preload");

export class PreloadState extends GameState {
    dialogs: HUDModalDialogs;
    hintsText: HTMLElement;
    lastHintShown: number;
    nextHintDuration: number;
    statusText: HTMLElement;
    progressElement: HTMLElement;
    currentStatus: string;

    constructor() {
        super("PreloadState");
    }

    getThemeMusic() {
        return null;
    }

    getHasFadeIn() {
        return false;
    }

    getRemovePreviousContent() {
        return false;
    }

    onEnter() {
        this.dialogs = new HUDModalDialogs(null, this.app);
        const dialogsElement = document.body.querySelector(".modalDialogParent");
        this.dialogs.initializeToElement(dialogsElement);

        this.hintsText = this.htmlElement.querySelector("#preload_ll_text");
        this.lastHintShown = -1000;
        this.nextHintDuration = 0;

        this.statusText = this.htmlElement.querySelector("#ll_preload_status");
        this.progressElement = this.htmlElement.querySelector("#ll_progressbar span");

        this.startLoading();
    }

    onLeave() {
        // this.dialogs.cleanup();
    }

    async startLoading() {
        try {
            this.setStatus("Booting", NaN);

            this.setStatus("Creating platform wrapper", 3);
            await this.app.platformWrapper.initialize();

            this.setStatus("Creating storage", 9);
            await this.app.storage.initialize();

            this.setStatus("Initializing settings", 20);
            await this.app.settings.initialize();

            // Initialize fullscreen
            if (this.app.platformWrapper.getSupportsFullscreen()) {
                this.app.platformWrapper.setFullscreen(this.app.settings.getIsFullScreen());
            }

            this.setStatus("Initializing language", 25);
            if (this.app.settings.getLanguage() === "auto-detect") {
                const language = autoDetectLanguageId();
                logger.log("Setting language to", language);
                await this.app.settings.updateLanguage(language);
            }
            document.documentElement.setAttribute("lang", this.app.settings.getLanguage());

            const language = this.app.settings.getLanguage();
            await updateApplicationLanguage(language);

            this.setStatus("Initializing sounds", 30);
            await this.app.sound.initialize();

            this.setStatus("Initializing savegames", 38);
            try {
                this.app.savegameMgr.initialize();
            } catch (err) {
                logger.error("Failed to initialize savegames:", err);
                alert(
                    "Your savegames failed to load, it seems your data files got corrupted. I'm so sorry!\n\n(This can happen if your pc crashed while a game was saved).\n\nYou can try re-importing your savegames."
                );
                await this.app.savegameMgr.writeAsync();
            }

            this.setStatus("Downloading resources", 40);
            this.app.backgroundResourceLoader.resourceStateChangedSignal.add(({ progress }) => {
                this.setStatus(
                    `Downloading resources (${(progress * 100.0).toFixed(1)} %)`,
                    40 + progress * 50
                );
            });
            try {
                await this.app.backgroundResourceLoader.getMainMenuPromise();
            } catch (err) {
                logger.error("Failed to load resources:", err);
                this.app.backgroundResourceLoader.showLoaderError(this.dialogs, err);
            }
            this.app.backgroundResourceLoader.resourceStateChangedSignal.removeAll();

            this.setStatus("Checking changelog", 95);
            if (!(G_IS_DEV && globalConfig.debug.disableUpgradeNotification)) {
                const version = await this.app.storage.readFileAsync("lastversion.bin").catch(err => {
                    logger.warn("Failed to read lastversion:", err);
                    return G_BUILD_VERSION;
                });
                logger.log("Last version:", version, "App version:", G_BUILD_VERSION);
                await this.app.storage.writeFileAsync("lastversion.bin", G_BUILD_VERSION);

                const changelogEntries: typeof CHANGELOG = [];
                logger.log("Last seen version:", version);

                for (let i = 0; i < CHANGELOG.length; ++i) {
                    if (CHANGELOG[i].version === version) {
                        break;
                    }
                    changelogEntries.push(CHANGELOG[i]);
                }
                if (changelogEntries.length !== 0) {
                    let dialogHtml = T.dialogs.updateSummary.desc;
                    for (let i = 0; i < changelogEntries.length; ++i) {
                        const entry = changelogEntries[i];
                        dialogHtml += `
                            <div class="changelogDialogEntry">
                                <span class="version">${entry.version}</span>
                                <span class="date">${entry.date}</span>
                                <ul class="changes">
                                    ${entry.entries.map(text => `<li>${text}</li>`).join("")}
                                </ul>
                            </div>
                        `;
                    }

                    await new /** @type {typeof Promise<void>} */ Promise(resolve => {
                        this.dialogs.showInfo(T.dialogs.updateSummary.title, dialogHtml).ok.add(resolve);
                    });
                }
            }

            this.setStatus("Launching", 99);
            this.moveToState("MainMenuState");
        } catch (err) {
            this.showFailMessage(err);
        }
    }

    update() {
        const now = performance.now();
        if (now - this.lastHintShown > this.nextHintDuration) {
            this.lastHintShown = now;
            const hintText = getRandomHint();

            this.hintsText.innerHTML = hintText;

            /**
             * Compute how long the user will need to read the hint.
             * We calculate with 130 words per minute, with an average of 5 chars
             * that is 650 characters / minute
             */
            this.nextHintDuration = Math.max(2500, (hintText.length / 650) * 60 * 1000);
        }
    }

    onRender() {
        this.update();
    }

    onBackgroundTick() {
        this.update();
    }

    setStatus(text: string, progress: number) {
        logger.log("✅ " + text);

        this.currentStatus = text;
        this.statusText.innerText = text;
        this.progressElement.style.width = 80 + (progress / 100) * 20 + "%";
    }

    showFailMessage(text) {
        logger.error("App init failed:", text);

        const resetBtn = <button class="resetApp styledButton">Reset App</button>;
        this.trackClicks(resetBtn, this.showResetConfirm);

        const subElement = (
            <div class="failureBox">
                <div class="logo">
                    <img src="res/logo.png" alt="Shapez.io Logo" />
                </div>
                <div class="failureInner">
                    <div class="errorHeader">Failed to initialize application!</div>
                    <div class="errorMessage">
                        {`${this.currentStatus} failed:`}
                        <br />
                        {text}
                    </div>
                    <div class="lower">
                        {resetBtn}
                        <i>{`Build ${G_BUILD_VERSION} @ ${G_BUILD_COMMIT_HASH}`}</i>
                    </div>
                </div>
            </div>
        );

        this.htmlElement.classList.add("failure");
        this.htmlElement.appendChild(subElement);

        this.hintsText.remove();
    }

    async showResetConfirm() {
        if (confirm("Are you sure you want to reset the app? This will delete all your savegames!")) {
            await this.resetApp();
        }
    }

    async resetApp() {
        await this.app.settings.resetEverythingAsync();
        await this.app.savegameMgr.resetEverythingAsync();
        await this.app.settings.resetEverythingAsync();
        window.location.reload();
    }
}
