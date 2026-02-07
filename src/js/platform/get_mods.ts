import { ModLoaderPlatform as ModLoader } from "./mods/loader";
import { Logger } from "@/core/logging";
export const modLoader = new ModLoader();
const logger = new Logger("get_mods");

export async function getMods() {
    // TODO: Split mod reloads into a different IPC request
    // await installMod();
    await modLoader.loadMods();
    return modLoader.getAllMods();
}

export async function installMod(): Promise<void> {
    try {
        const [handle] = await window.showOpenFilePicker({
            multiple: false,
        });
        const file = await handle.getFile();
        let modFile = new Uint8Array(await file.arrayBuffer());
        const data = await navigator.storage.getDirectory();
        const mods = await data.getDirectoryHandle("mods");
        const outputFile = await mods.getFileHandle(file.name, { create: true });
        const writable = await outputFile.createWritable();
        writable.write(modFile);
        writable.close();
    } catch (e) {
        logger.warn("my error", e);
    }
}

export async function deleteMod(id: string): Promise<void> {
    try {
        const data = await navigator.storage.getDirectory();
        const mods = await data.getDirectoryHandle("mods");
        await mods.removeEntry(id + ".asar");
    } catch (e) {
        logger.warn("my error", e);
    }
}
