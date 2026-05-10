import { IpcHandler } from "./ipc";
import { ModLoader } from "./mods/loader";
// import { ModProtocolHandler } from "./mods/protocol_handler";

const modLoader = new ModLoader();
// const modProtocol = new ModProtocolHandler(modLoader);
const ipc = new IpcHandler(modLoader);

function createWindow() {
    // The protocol can only be handled after "ready" event
    // modProtocol.install();

    ipc.install();

    // modLoader.on("forcereload", () => {
    //     //     // TODO: Find a better way to manage cache when force
    //     //     // reloading (use a non-persistent session?)
    //     //     window.webContents.session.clearData({ dataTypes: ["cache"] }).then(() => window.reload());
    // });
}

createWindow();
