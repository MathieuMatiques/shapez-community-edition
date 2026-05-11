// import { attachFS } from "@zenfs/core";
import { IpcHandler } from "./ipc";
// import { ModLoader } from "./mods/webworkers/loader";
// import { ModProtocolHandler } from "./mods/webworkers/protocol_handler";

// const modLoader = new ModLoader();
// const modProtocol = new ModProtocolHandler(modLoader);
const ipc = new IpcHandler();

async function createWindow() {
    // The protocol can only be handled after "ready" event
    // modProtocol.install();

    // modLoader.on("forcereload", () => {
    //     //     // TODO: Find a better way to manage cache when force
    //     //     // reloading (use a non-persistent session?)
    //     //     window.webContents.session.clearData({ dataTypes: ["cache"] }).then(() => window.reload());
    //     window.location.reload(true);
    // });

    // attachFS(navigator.serviceWorker.controller, )

    await navigator.serviceWorker
        .register(new URL("./mods/webworkers/protocol_handler", import.meta.url))
        .then(reg => console.log("SW registered!", reg))
        .catch(err => console.error("SW registration failed:", err));

    navigator.serviceWorker.addEventListener("message", event => {
        if (event.data.type === "forcereload") {
            window.location.reload(true);
        }
    });

    await navigator.serviceWorker.ready;
    console.log("im ready!");

    ipc.install();

    await import("@/start");
}

createWindow();
