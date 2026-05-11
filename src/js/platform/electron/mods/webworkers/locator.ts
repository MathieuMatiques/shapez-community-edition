import * as fs from "@zenfs/core/promises";
import path from "path";
import { switches, userData } from "../../config";
import { mounts, umount, resolveMountConfig, mount } from "@zenfs/core";
import { IndexedDB } from "@zenfs/dom";
// import { fileOpen } from "browser-fs-access";
// import { extractAll, getHeader } from "@banou/asar";
import { Zip } from "@zenfs/archives";
// import { resolveMetadata } from "./metadata";

export const MOD_FILE_SUFFIX = ".asar";

const DISABLED_MODS_FILE = "disabled-mods.json";
const MNT_MODS_DIR = path.join(userData, "mnt", "mods");
const USER_MODS_DIR = path.join(userData, "mods");

export interface ModLocator {
    readonly priority: number;

    /**
     * Asynchronously look for mod candidates.
     *
     * @returns absolute file paths of located mods
     */
    locateMods(): Promise<string[]>;

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
        this.disabledModsFile = path.join(directory, DISABLED_MODS_FILE);
    }

    async locateMods(): Promise<string[]> {
        if (switches.safeMode) {
            return [];
        }

        // await configure({
        //     mounts: {
        //         [USER_MODS_DIR]: IndexedDB,
        //     },
        // });
        // mount(USER_MODS_DIR, await resolveMountConfig({ backend: IndexedDB, storeName: USER_MODS_DIR }));
        // await configure({
        //     mounts: {
        //         [USER_MODS_DIR]: { backend: IndexedDB, storeName: USER_MODS_DIR },
        //     },
        // });

        await fs.mkdir(this.directory, { recursive: true });

        // try {
        const dir = await fs.readdir(this.directory, { withFileTypes: true });
        console.warn("iza me", this.directory, dir);
        return (
            dir
                // .filter(entry => entry.name.endsWith(MOD_FILE_SUFFIX))
                .map(entry => path.join(this.directory, entry.name))
        );
        // } catch (err) {
        // if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        //     // The directory does not exist
        //     return [];
        // }

        // Propagate all other errors
        //     throw err;
        // }
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
            const contents = await fs.readFile(this.disabledModsFile, "utf-8");
            this.disabledMods = new Set(JSON.parse(contents));
        } catch (err) {
            // Ensure we don't fail twice
            this.disabledMods ??= new Set();

            if ((err as NodeJS.ErrnoException).code == "ENOENT") {
                // Ignore error entirely if the file is missing
                return;
            }

            if (err instanceof SyntaxError) {
                // Malformed JSON, replace the file
                return this.writeDisabledModsFile();
            }

            console.warn(`Reading ${this.disabledModsFile} failed:`, err);
        }
    }

    private async writeDisabledModsFile(): Promise<void> {
        try {
            const contents = JSON.stringify([...(this.disabledMods ?? new Set())]);
            await fs.writeFile(this.disabledModsFile, contents, "utf-8");
        } catch (err: unknown) {
            // Nothing we can do
            console.warn(`Writing ${this.disabledModsFile} failed:`, err);
        }
    }
}

export class UserModLocator extends DirectoryModLocator {
    readonly priority = 1;

    constructor() {
        super(MNT_MODS_DIR);
    }

    async locateMods(): Promise<string[]> {
        // console.warn("plz");
        // Ensure the directory exists
        // await configure({
        //     mounts: {
        //         [USER_MODS_DIR]: { backend: IndexedDB, storeName: USER_MODS_DIR },
        //     },
        // });
        if (!mounts.has(USER_MODS_DIR)) {
            mount(USER_MODS_DIR, await resolveMountConfig({ backend: IndexedDB, storeName: USER_MODS_DIR }));
        }

        // await fs.rm(this.directory, { force: true, recursive: true });
        await fs.mkdir(this.directory, { recursive: true });
        // await fs.mkdir(USER_MODS_DIR, { recursive: true });
        // console.warn(await fs.readdir(USER_MODS_DIR));
        const mods: string[] = [];
        for (const mod of await fs.readdir(USER_MODS_DIR, { withFileTypes: true })) {
            // console.log(mod);
            // umount(path.join(MNT_MODS_DIR, mod.name));
            const modfs = await resolveMountConfig({
                backend: Zip,
                data: await fs.readFile(path.join(USER_MODS_DIR, mod.name)),
            });
            console.warn("mounted", path.join(MNT_MODS_DIR, mod.name));
            console.warn(mounts);
            if (!mounts.has(path.join(MNT_MODS_DIR, mod.name))) {
                mount(path.join(MNT_MODS_DIR, mod.name), modfs);
            }

            mods.push(path.join(MNT_MODS_DIR, mod.name));
        }
        // console.log(mounts);

        // return super.locateMods();

        // return (
        //     await fs.readdir(USER_MODS_DIR, { withFileTypes: true })
        // ).map(async mod => {
        //     console.log(mod);
        //     // umount(path.join(MNT_MODS_DIR, mod.name));
        //     const modfs = await resolveMountConfig({
        //         backend: Zip,
        //         data: await fs.readFile(path.join(USER_MODS_DIR, mod.name)),
        //     });
        //     mount(path.join(MNT_MODS_DIR, mod.name), modfs);
        //     return path.join(MNT_MODS_DIR, mod.name);
        // });
        return mods;
    }
}
