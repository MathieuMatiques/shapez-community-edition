import { fileOpen } from "browser-fs-access";
import { type FsJob, FsJobHandler } from "./fsjob";
import type { IpcMod } from "./mods/webworkers/loader";

export class IpcHandler {
    private readonly savesHandler = new FsJobHandler("saves");
    // private readonly modLoader: ModLoader;

    constructor() {
        // this.modLoader = modLoader;
    }

    install() {
        const jobs = {
            "fs-job": this.handleFsJob.bind(this),
            "get-mods": this.getMods.bind(this),
            "install-mod": this.installMod.bind(this),
            "delete-mod": this.deleteMod.bind(this),
            "set-fullscreen": this.setFullscreen.bind(this),
        };

        window.ipcRenderer = {
            invoke<Event extends keyof typeof jobs>(
                event: Event,
                ...args: Parameters<(typeof jobs)[Event]>
            ): ReturnType<(typeof jobs)[Event]> {
                return jobs[event](...args);
            },
        };

        // Not implemented
        // "open-mods-folder"
    }

    private handleFsJob(job: FsJob) {
        if (job.id !== "saves") {
            throw new Error("Storages other than saves/ are not implemented yet");
        }

        return this.savesHandler.handleJob(job);
    }

    private async getMods(): Promise<IpcMod[]> {
        // TODO: Split mod reloads into a different IPC request
        // await this.modLoader.loadMods();
        // return this.modLoader.getAllMods();
        // navigator.serviceWorker.controller.
        return await sendMessage({ type: "get-mods" });
    }

    private async installMod(): Promise<void> {
        // await this.modLoader.installMod();
        const filters = {
            // description: `ASAR files`,
            extensions: [".zip"],
        };
        let file: File;
        try {
            file = await fileOpen(filters);
        } catch (e) {
            if (e instanceof DOMException && e.name === "AbortError") {
                return;
            } else {
                throw e;
            }
        }

        const buffer = await file.arrayBuffer();
        navigator.serviceWorker.controller.postMessage({ type: "install-mod", buffer }, [buffer]);
    }

    private async deleteMod(id: string) {
        // await this.modLoader.loadMods();
        // await this.modLoader.deleteMod(id);
        navigator.serviceWorker.controller.postMessage({ type: "delete-mod", id });
    }

    private setFullscreen(flag: boolean) {
        // let succeeded = false;
        // async function fullscreen() {
        //     if (!document.fullscreenElement) {
        //         await document.documentElement.requestFullscreen().catch(_ => {});
        //         succeeded = true;
        //     }
        // }
        if (flag) {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(_ => {
                    // document.addEventListener("touchstart", fullscreen, { once: true });
                    // document.addEventListener("touchend", fullscreen, { once: true });
                    // document.addEventListener("click", fullscreen, { once: true });
                    // document.addEventListener("keydown", fullscreen, { once: true });
                });
            }
        } else {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            }
            // document.removeEventListener("touchstart", fullscreen);
            // document.removeEventListener("touchend", fullscreen);
            // document.removeEventListener("click", fullscreen);
            // document.removeEventListener("keydown", fullscreen);
        }
    }
}

async function sendMessage(message) {
    return new Promise((resolve, reject) => {
        // 1. Create a communication channel
        const channel = new MessageChannel();

        // 2. Set up the reply listener
        channel.port1.onmessage = event => {
            if (event.data.error) {
                reject(event.data.error);
            } else {
                resolve(event.data);
            }
        };

        // 3. Send the message + the second port to the SW
        navigator.serviceWorker.controller.postMessage(message, [channel.port2]);
    });
}
