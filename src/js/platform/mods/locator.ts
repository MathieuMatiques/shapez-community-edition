// import chokidar, { FSWatcher } from "chokidar";
// import { app } from "electron";
// import fs from "node:fs/promises";
// import path from "node:path";
// import { executableDir, switches, userData } from "../config.js";

export const MOD_FILE_SUFFIX = ".asar";

const DISABLED_MODS_FILE = "disabled-mods.json";
const USER_MODS_DIR = "mods";
// const DISTRO_MODS_DIR = path.join(executableDir, "mods");

// const DEV_SWITCH = "load-mod";
// const DEV_WATCH_SWITCH = "watch";
// const DEV_USER_MOD_PREFIX = "@/";

export interface ModLocator {
    readonly priority: number;

    /**
     * Asynchronously look for mod candidates.
     *
     * @returns absolute file paths of located mods
     */
    locateMods(): Promise<FileSystemHandle[]>;

    /**
     * Mark or unmark the specified mod as disabled.
     *
     * @param id ID of the mod to disable or enable
     * @param flag whether to disable the mod
     */
    setModDisabled(id: string, flag: boolean): Promise<void>;

    /**
     * Retrieve the list of mod IDs that should not be loaded.
     *
     * @returns IDs of the disabled mods
     */
    getDisabledMods(): Promise<string[]>;
}

abstract class DirectoryModLocator implements ModLocator {
    abstract readonly priority: number;

    protected readonly directory: string;
    private readonly disabledModsFile: string;
    private disabledMods: Set<string> | null = null;

    constructor(directory: string) {
        this.directory = directory;
        this.disabledModsFile = DISABLED_MODS_FILE;
    }

    async locateMods(): Promise<FileSystemHandle[]> {
        // if (switches.safeMode) {
        //     return [];
        // }

        try {
            const data = await navigator.storage.getDirectory();
            const directoryHandle = await data.getDirectoryHandle(this.directory);
            const mods = [];
            for await (const entry of directoryHandle.values()) {
                console.error(entry);
                if (entry.name.endsWith(MOD_FILE_SUFFIX)) {
                    mods.push(entry);
                }
            }
            return mods;
        } catch (err) {
            if ((err as DOMException).name === "NotFoundError") {
                // The directory does not exist
                return [];
            }

            // Propagate all other errors
            throw err;
        }
    }

    setModDisabled(id: string, flag: boolean): Promise<void> {
        // Note: it is assumed that calling this before accessing
        // getDisabledMods will overwrite the file.
        this.disabledMods ??= new Set();

        if (flag) {
            this.disabledMods.add(id);
        } else {
            this.disabledMods.delete(id);
        }

        return this.writeDisabledModsFile();
    }

    async getDisabledMods(): Promise<string[]> {
        if (this.disabledMods === null) {
            await this.readDisabledModsFile();
        }

        return [...this.disabledMods!];
    }

    private async readDisabledModsFile(): Promise<void> {
        // TODO: Validate internal structure (once something is added for
        // mod metadata file validation)

        try {
            const data = await navigator.storage.getDirectory();
            const directoryHandle = await data.getDirectoryHandle(this.directory);
            const disabledModsFileHandle = await directoryHandle.getFileHandle(this.disabledModsFile);
            const disabledModsFile = await disabledModsFileHandle.getFile();
            const contents = await disabledModsFile.text();
            this.disabledMods = new Set(JSON.parse(contents));
        } catch (err) {
            // Ensure we don't fail twice
            this.disabledMods ??= new Set();

            if ((err as DOMException).name == "NotFoundError") {
                // Ignore error entirely if the file is missing
                return;
            }

            if (err instanceof SyntaxError) {
                // Malformed JSON, replace the file
                return this.writeDisabledModsFile();
            }

            console.warn(`Reading ${this.directory}/${this.disabledModsFile} failed:`, err);
        }
    }

    private async writeDisabledModsFile(): Promise<void> {
        try {
            const data = await navigator.storage.getDirectory();
            const directoryHandle = await data.getDirectoryHandle(this.directory, { create: true });
            const disabledModsFileHandle = await directoryHandle.getFileHandle(this.disabledModsFile, {
                create: true,
            });
            const writable = await disabledModsFileHandle.createWritable();

            const contents = JSON.stringify([...(this.disabledMods ?? new Set())]);
            await writable.write(contents);
            await writable.close();
        } catch (err: unknown) {
            // Nothing we can do
            console.warn(`Writing ${this.directory}/${this.disabledModsFile} failed:`, err);
        }
    }
}

export class UserModLocator extends DirectoryModLocator {
    readonly priority = 1;

    constructor() {
        super(USER_MODS_DIR);
    }

    async locateMods(): Promise<FileSystemHandle[]> {
        // Ensure the directory exists
        const data = await navigator.storage.getDirectory();
        await data.getDirectoryHandle(this.directory, { create: true });
        return super.locateMods();
    }
}

/*export class DistroModLocator extends DirectoryModLocator {
    readonly priority = 2;

    constructor() {
        super(DISTRO_MODS_DIR);
    }
}*/

/*export class DevelopmentModLocator implements ModLocator {
    readonly priority = 0;
    readonly fsWatcher: FSWatcher | null = null;

    private readonly modFiles: string[] = [];
    private readonly disabledMods = new Set<string>();

    constructor() {
        const switchValue = app.commandLine.getSwitchValue(DEV_SWITCH);
        if (switchValue === "") {
            // Empty string = switch not passed
            return;
        }

        const resolved = switchValue.split(",").map(f => this.resolveFile(f));
        this.modFiles.push(...resolved);

        const watchMode = app.commandLine.hasSwitch(DEV_WATCH_SWITCH);
        if (!watchMode || this.modFiles.length === 0) {
            // Skip setting up chokidar
            return;
        }

        this.fsWatcher = chokidar.watch(this.modFiles, {
            persistent: false,
            ignoreInitial: true,
        });
    }

    locateMods(): Promise<string[]> {
        return Promise.resolve(this.modFiles);
    }

    setModDisabled(id: string, flag: boolean): Promise<void> {
        if (flag) {
            this.disabledMods.add(id);
        } else {
            this.disabledMods.delete(id);
        }

        return Promise.resolve();
    }

    getDisabledMods(): Promise<string[]> {
        return Promise.resolve([...this.disabledMods]);
    }

    private resolveFile(file: string) {
        // Allow using @/*.asar to reference user mods directory
        if (file.startsWith(DEV_USER_MOD_PREFIX)) {
            file = file.slice(DEV_USER_MOD_PREFIX.length);
            return path.join(USER_MODS_DIR, file);
        }

        // Resolve mods relative to CWD, useful for development
        return path.resolve(file);
    }
}*/
