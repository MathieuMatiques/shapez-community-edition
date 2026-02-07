// import { net, protocol } from "electron";
// import { lstat, readdir } from "node:fs/promises";
// import path from "node:path";
// import { pathToFileURL } from "node:url";
import { ModLoaderPlatform as ModLoader } from "./loader";
import { AsarArchive } from "./asar_reader";
// import { modLoader } from "../get_mods";
// import { Logger } from "@/core/logging";
// const logger = new Logger("protocol_handler");

export const MOD_PROTOCOL = "mod:";

export class ModProtocolHandler {
    private modLoader: ModLoader;

    constructor(modLoader: ModLoader) {
        this.modLoader = modLoader;
        modLoader.loadMods();

        // protocol.registerSchemesAsPrivileged([
        //     {
        //         scheme: MOD_PROTOCOL,
        //         privileges: {
        //             allowServiceWorkers: true,
        //             bypassCSP: true,
        //             secure: true,
        //             standard: true,
        //             stream: true,
        //             supportFetchAPI: true,
        //         },
        //     },
        // ]);
    }

    // install() {
    //     protocol.handle(MOD_SCHEME, this.handler.bind(this));
    // }

    async handler(modId: string, file: string): Promise<Response> {
        // console.warn(modId, file);
        // logger.error("my 2nd url", file);
        // const url = new URL(request.url);

        let mod;
        try {
            this.modLoader.loadMods();
            mod = this.modLoader.getModById(modId);
            console.warn(this.modLoader.getAllMods());
            console.warn(mod);
        } catch (e) {
            console.error("what went wrong?!?!", e);
            return new Response("what went wrong?!?!" + e, { status: 405 });
        }
        if (mod === undefined) {
            return new Response("Mod Not Found Bruh", { status: 410 });
        }

        // const fileUrl = this.getFileUrlForRequest(request);
        // if (fileUrl === undefined) {
        //     return Response.error();
        // }

        try {
            // return await net.fetch(fileUrl.toString());
            const fileBlob = await getFileFromMod(mod.file, file);
            const mimeType = getMimeType(file);
            return new Response(fileBlob, {
                headers: { "Content-Type": mimeType },
            });
        } catch (err) {
            // Check if this is a directory request
            // const directoryIndex = await this.getDirectoryIndex(fileUrl);
            // if (directoryIndex !== null) {
            //     return directoryIndex;
            // }

            console.error("Failed to fetch:", err);
            return new Response("Not Found Bruh", { status: 408 });
        }
    }

    /*private async getDirectoryIndex(fileUrl: URL): Promise<Response | null> {
        if (!fileUrl.pathname.endsWith("/")) {
            return null;
        }

        // Remove the trailing slash
        fileUrl.pathname = fileUrl.pathname.slice(0, -1);

        try {
            const stats = await lstat(fileUrl);
            if (!stats.isDirectory()) {
                return null;
            }

            const dir = await readdir(fileUrl, { withFileTypes: true });
            const result = dir.map(entry => entry.name + (entry.isDirectory() ? "/" : ""));

            return Response.json(result);
        } catch (err) {
            console.error("Failed to get directory index:", err);
            return null;
        }
    }*/

    /*private getFileUrlForRequest(request: Request): URL | undefined {
        // mod://mod-id/path/to/file
        const modUrl = new URL(request.url);
        const mod = this.modLoader.getModById(modUrl.hostname);
        if (mod === undefined) {
            return undefined;
        }

        const bundle = mod.file;
        const filePath = path.join(bundle, modUrl.pathname);

        // Check if the path escapes the bundle as per Electron example
        // NOTE: this means file names cannot start with ..
        const relative = path.relative(bundle, filePath);
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
            return undefined;
        }

        return pathToFileURL(filePath);
    }*/
}

async function getFileFromMod(mod: FileSystemHandle, file: string): Promise<Blob> {
    switch (mod.kind) {
        case "file":
            return await getFileFromAsar(mod as FileSystemFileHandle, file);
        case "directory":
            return await getFileFromDirectory(mod as FileSystemDirectoryHandle, file);
    }
}

async function getFileFromAsar(mod: FileSystemFileHandle, file: string): Promise<Blob> {
    const asar = new AsarArchive(await mod.getFile());
    await asar.init();
    return await asar.getFile(file);
}

async function getFileFromDirectory(mod: FileSystemDirectoryHandle, file: string): Promise<Blob> {
    let currentDir = mod;
    const pathRemaining = file.split("/");
    while (pathRemaining.length > 1) {
        currentDir = await currentDir.getDirectoryHandle(pathRemaining.shift());
    }
    const fileHandle = await currentDir.getFileHandle(pathRemaining[0]);
    return await fileHandle.getFile();
}

const MIME_MAP = {
    // Critical (Browser will break if these are wrong)
    js: "text/javascript",
    mjs: "text/javascript",
    css: "text/css",
    json: "application/json",
    wasm: "application/wasm",

    // Media (Nice to have, helps with hardware acceleration)
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    wav: "audio/wav",
};

function getMimeType(filename: string): string {
    const ext = filename.split(".").pop().toLowerCase();
    return MIME_MAP[ext] || "application/octet-stream";
}

const modLoader = new ModLoader();
// await modLoader.loadMods();
const modProtocolHandle = new ModProtocolHandler(modLoader);

self.addEventListener("fetch", (event: FetchEvent) => {
    const url = new URL(event.request.url);
    console.error("my oth url", url);

    // We intercept mod:// (or a proxy like https://app.local/mods/)
    if (url.pathname.startsWith("/virtual-mod/")) {
        console.error("my first url", url);
        let newPath = url.pathname.replace("/virtual-mod/", "").split("/");
        event.respondWith(modProtocolHandle.handler(newPath[0], newPath.slice(1).join("/")));
    }
});

self.addEventListener("install", () => {
    self.skipWaiting();
});

// Force the SW to take control of all open tabs (clients) immediately
self.addEventListener("activate", event => {
    event.waitUntil(clients.claim());
    console.log("Service Worker activated and claiming clients!");
});
