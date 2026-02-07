async function initSW() {
    const root = await navigator.storage.getDirectory();

    await navigator.serviceWorker
        .register(new URL("./platform/mods/protocol_handler", import.meta.url))
        .then(reg => console.log("SW registered!", reg))
        .catch(err => console.error("SW registration failed:", err));

    await navigator.serviceWorker.ready;

    // 3. CRITICAL: If this is the very first load, the page might not
    // have a "controller" yet. We wait until it does.
    if (!navigator.serviceWorker.controller) {
        await new Promise(resolve => {
            navigator.serviceWorker.addEventListener(
                "controllerchange",
                () => {
                    resolve();
                },
                { once: true }
            );
        });
    }

    console.log("Service Worker is now controlling the page. Loading mods...");
}

// import "./mods/modloader";
async function run() {
    await import("./mods/modloader");

    await import("./core/assert");
    await import("./core/polyfills");

    const { Application } = await import("./application");
    const { Logger, logSection } = await import("./core/logging");
    const { initComponentRegistry } = await import("./game/component_registry");
    const { initGameModeRegistry } = await import("./game/game_mode_registry");
    const { initItemRegistry } = await import("./game/item_registry");
    const { initMetaBuildingRegistry } = await import("./game/meta_building_registry");

    const logger = new Logger("main");

    console.log(
        `%cshapez.io ️%c\n© 2022 tobspr Games\nCommit %c${G_BUILD_COMMIT_HASH}%c on %c${new Date(
            G_BUILD_TIME
        ).toLocaleString()}\n`,
        "font-size: 35px; font-family: Arial;font-weight: bold; padding: 10px 0;",
        "color: #aaa",
        "color: #7f7",
        "color: #aaa",
        "color: #7f7"
    );

    console.log("Environment: %c" + G_APP_ENVIRONMENT, "color: #fff");

    if (G_IS_DEV) {
        console.log("\n%c🛑 DEBUG ENVIRONMENT 🛑\n", "color: #f77");
    }

    /* typehints:start */
    // @ts-ignore
    // throw new Error("typehints built in, this should never be the case!");
    /* typehints:end */

    /* dev:start */
    console.log("%cDEVCODE BUILT IN", "color: #f77");
    /* dev:end */

    logSection("Boot Process", "#f9a825");

    initComponentRegistry();
    initItemRegistry();
    initMetaBuildingRegistry();
    initGameModeRegistry();

    let app = null;

    async function bootApp() {
        logger.log("Page Loaded");

        app = new Application();
        app.boot();
    }

    window.addEventListener("load", bootApp);
}

initSW().then(() => run());
