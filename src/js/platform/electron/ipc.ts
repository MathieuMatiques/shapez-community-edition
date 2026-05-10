import { FsJob, FsJobHandler } from "./fsjob";
import { ModLoader } from "./mods/loader";

export class IpcHandler {
    private readonly savesHandler = new FsJobHandler("saves");
    private readonly modLoader: ModLoader;

    constructor(modLoader: ModLoader) {
        this.modLoader = modLoader;
    }

    install() {
        const jobs = {
            "fs-job": this.handleFsJob.bind(this),
            "get-mods": this.getMods.bind(this),
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

    private async getMods() {
        // TODO: Split mod reloads into a different IPC request
        await this.modLoader.loadMods();
        return this.modLoader.getAllMods();
    }

    private setFullscreen(flag: boolean) {
        if (!document.fullscreenElement && flag) {
            document.documentElement.requestFullscreen().catch(_ => {
                let succeeded = false;
                function fullscreen() {
                    if (!succeeded) {
                        document.documentElement.requestFullscreen().catch(_ => {});
                        succeeded = !!document.fullscreenElement;
                    }
                }
                document.addEventListener("touchstart", fullscreen, { once: true });
                document.addEventListener("touchend", fullscreen, { once: true });
                document.addEventListener("click", fullscreen, { once: true });
                document.addEventListener("keydown", fullscreen, { once: true });
            });
        } else if (document.fullscreenElement && !flag) {
            document.exitFullscreen();
        }
    }
}
