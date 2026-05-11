// import { net, protocol } from "electron";
// import { configure, Port } from "@zenfs/core";
import { lstat, readdir } from "@zenfs/core/promises";
import * as fs from "@zenfs/core/promises";
// import { IndexedDB } from "@zenfs/dom";
import path from "path";
// import { pathToFileURL } from "url";
import { ModLoader } from "./loader";

export const MOD_SCHEME = "mod";

export class ModProtocolHandler {
    private modLoader: ModLoader;

    constructor(modLoader: ModLoader) {
        this.modLoader = modLoader;
        // protocol.registerSchemesAsPrivileged([
        //     {
        //         scheme: MOD_SCHEME,
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

    async install() {
        self.addEventListener("message", async event => {
            switch (event.data.type) {
                case "get-mods": {
                    await this.modLoader.loadMods();
                    event.ports[0].postMessage(this.modLoader.getAllMods());
                    break;
                }
                case "install-mod": {
                    await this.modLoader.installMod(event.data.buffer);
                    break;
                }
                case "delete-mod": {
                    await this.modLoader.loadMods();
                    await this.modLoader.deleteMod(event.data.id);
                    break;
                }
            }

            // // Check if a port was sent
            // if (event.ports && event.ports[0]) {
            //     // Do some work...
            //     const result = { status: "success", data: "Secret info" };

            //     // Reply directly on that port
            //     event.ports[0].postMessage(result);
            // }
        });

        // await configure({ mounts: { "/mods": { backend: IndexedDB, storeName: "/mods" } } });
        // console.warn("heya", await fs.readdir("/mods"));
        // protocol.handle(MOD_SCHEME, this.handler.bind(this));

        self.addEventListener("fetch", (event: FetchEvent) => {
            const url = new URL(event.request.url);
            console.log("i see u!", url);
            if (url.pathname.startsWith("/mods/")) {
                console.log("we did it", event.request.url);
                event.respondWith(this.handler(event.request));
            }
        });

        self.addEventListener("install", () => {
            self.skipWaiting();
        });

        // Force the SW to take control of all open tabs (clients) immediately
        self.addEventListener("activate", event => {
            event.waitUntil(clients.claim());
            console.log("Service Worker activated and claiming clients!");
            // self.postMessage("worker-activated");
        });
    }

    private async handler(request: Request): Promise<Response> {
        // await this.modLoader.loadMods();
        console.warn("i can get here");
        const fileUrl = this.getFileUrlForRequest(request);
        if (fileUrl === undefined) {
            console.warn("why no file url?");
            return Response.error();
        }

        // try {
        // return await fetch(fileUrl.toString());
        console.warn("almost there", await fs.exists(fileUrl));
        const file = await fs.readFile(fileUrl);
        const response = new Response(file, {
            headers: {
                "Content-Type": getMimeType(fileUrl),
            },
        });
        return response;
        // } catch (err) {
        //     console.log("hey yo", err);
        //     // Check if this is a directory request
        //     // const directoryIndex = await this.getDirectoryIndex(fileUrl);
        //     // if (directoryIndex !== null) {
        //     //     return directoryIndex;
        //     // }

        //     console.error("Failed to fetch:", err);
        //     return Response.error();
        // }
    }

    private async getDirectoryIndex(fileUrl: URL): Promise<Response | null> {
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
    }

    private getFileUrlForRequest(request: Request): string | undefined {
        // mod://mod-id/path/to/file
        const modUrl = new URL(request.url);
        // console.warn(modUrl.pathname.split("/"));
        const urlParts = modUrl.pathname.split("/").slice(2);

        const mod = this.modLoader.getModById(urlParts[0]);
        if (mod === undefined) {
            console.warn("iz undefined", urlParts);
            console.warn(this.modLoader.getAllMods());
            return undefined;
        }
        console.warn("we made it!");

        const bundle = mod.file;
        const filePath = path.join(bundle, ...urlParts.slice(1));

        // Check if the path escapes the bundle as per Electron example
        // NOTE: this means file names cannot start with ..
        const relative = path.relative(bundle, filePath);
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
            return undefined;
        }

        // return pathToFileURL(filePath);
        console.log(filePath);
        // return new URL(filePath);
        return filePath;
    }
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

async function main() {
    const modLoader = new ModLoader();

    const modProtocal = new ModProtocolHandler(modLoader);
    await modProtocal.install();
    await modLoader.loadMods();
    // clients
}
main();
