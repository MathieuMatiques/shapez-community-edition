import EventEmitter from "events";
import * as fs from "@zenfs/core/promises";
import path from "path";
// import { fileOpen } from "browser-fs-access";
import { Zip } from "@zenfs/archives";
import { umount, mounts, resolveMountConfig, mount } from "@zenfs/core";
import { ModLocator, UserModLocator } from "./locator";
import { IpcModMetadata, ModMetadata } from "./metadata";
import { userData } from "../../config";
import { IndexedDB } from "@zenfs/dom";

type ModSource = "user";
const USER_MODS_DIR = path.join(userData, "mods");

interface ModLocation {
    source: ModSource;
    file: string;
}

interface DisabledMod {
    source: ModSource;
    id: string;
}

export interface IpcMod extends ModLocation {
    disabled: boolean;
    metadata: IpcModMetadata;
}

const METADATA_FILE = "mod.json";

class Mod {
    readonly source: ModSource;
    readonly file: string;
    readonly metadata: ModMetadata;

    disabled = false;

    constructor(source: ModSource, file: string, metadata: ModMetadata) {
        this.source = source;
        this.file = file;
        this.metadata = metadata;
    }

    toJSON(): IpcMod {
        return {
            source: this.source,
            file: this.file,
            disabled: this.disabled,
            metadata: {
                ...this.metadata,
                version: this.metadata.version.format(),
            },
        };
    }
}

export class ModLoader extends EventEmitter {
    private mods: Mod[] = [];
    private readonly locators = new Map<ModSource, ModLocator>();

    constructor() {
        super();

        this.locators.set("user", new UserModLocator());
    }

    /**
     * Resets modloader state and reloads all mods, then triggers page reload.
     */
    async forceReload() {
        // await this.loadMods();
        // this.emit("forcereload");
        for (const client of await clients.matchAll()) {
            client.postMessage({ type: "forcereload" });
        }
    }

    async loadMods(): Promise<void> {
        const mods: Mod[] = [];
        this.mods = mods;

        const locations = await this.locateAllMods();
        for (const location of locations) {
            console.warn(locations);
            const metadata = await this.resolveMetadata(location);
            if (metadata === null) {
                console.warn("bad metadata");
                continue;
            }

            // TODO: Only check this after applying disabled state
            if (this.isModPresent(metadata.id)) {
                console.warn(`Ignoring duplicate mod ${location.source}::${location.file}`);
                continue;
            }

            mods.push(new Mod(location.source, location.file, metadata));
        }
        console.warn("my mods", mods);

        // Check for mods that should be disabled
        for (const { source, id } of await this.collectDisabledMods()) {
            const target = mods.find(m => m.source === source && m.metadata.id === id);
            if (target !== undefined) {
                target.disabled = true;
            }
        }
    }

    getAllMods(): IpcMod[] {
        return this.mods.map(mod => mod.toJSON());
    }

    isModPresent(id: string): boolean {
        return this.mods.some(mod => mod.metadata.id === id);
    }

    getModById(id: string): Mod | undefined {
        return this.mods.find(mod => mod.metadata.id === id);
    }

    private async locateAllMods(): Promise<ModLocation[]> {
        // Sort locators by priority, lowest number is highest priority
        const locators = [...this.locators.entries()].sort(([, a], [, b]) => a.priority - b.priority);
        const result: ModLocation[] = [];

        for (const [source, locator] of locators) {
            for (const file of await locator.locateMods()) {
                result.push({ source, file });
            }
        }

        return result;
    }

    private async resolveMetadata(mod: ModLocation): Promise<ModMetadata | null> {
        // TODO: This function might call validation routines
        const filePath = path.join(mod.file, METADATA_FILE);
        try {
            const contents = await fs.readFile(filePath, "utf-8");
            return ModMetadata.parse(JSON.parse(contents));
        } catch (err) {
            // TODO: Collect mod errors, show to the user once all mods are loaded
            console.error("Failed to read mod metadata", err);
            return null;
        }
    }

    private async collectDisabledMods(): Promise<DisabledMod[]> {
        const result: DisabledMod[] = [];

        for (const [source, locator] of this.locators.entries()) {
            for (const id of await locator.getDisabledMods()) {
                result.push({ source, id });
            }
        }

        return result;
    }

    async installMod(buffer: ArrayBuffer): Promise<void> {
        // const filters = {
        //     // description: `ASAR files`,
        //     extensions: [".zip"],
        // };
        // let file: File;
        // try {
        //     file = await fileOpen(filters);
        // } catch (e) {
        //     if (e instanceof DOMException && e.name === "AbortError") {
        //         return;
        //     } else {
        //         throw e;
        //     }
        // }

        // const buffer = await file.arrayBuffer();
        const zipfs = await resolveMountConfig({ backend: Zip, data: buffer });
        mount("/mnt/zip", zipfs);

        const metadata = await this.resolveMetadata({
            source: "user",
            file: "/mnt/zip",
        });
        console.log(metadata);

        if (metadata) {
            if (!mounts.has(USER_MODS_DIR)) {
                mount(
                    USER_MODS_DIR,
                    await resolveMountConfig({ backend: IndexedDB, storeName: USER_MODS_DIR })
                );
            }
            await fs.mkdir(USER_MODS_DIR, { recursive: true });
            fs.writeFile(path.join(USER_MODS_DIR, metadata.id), new DataView(buffer));
            console.warn(await fs.readdir(USER_MODS_DIR));
        }
        umount("/mnt/zip");
        console.warn("mounts in install mod", mounts);

        this.forceReload();
    }

    async deleteMod(id: string): Promise<void> {
        const mod = this.mods.find(mod => mod.metadata.id === id);
        switch (mod.source) {
            case "user": {
                umount(mod.file);
                // await fs.rmdir(mod.file);
                console.warn(await fs.readdir("/mnt/mods"));
                await fs.rm(path.join(USER_MODS_DIR, path.relative("/mnt/mods", mod.file)));
                console.warn(await fs.readdir("/mods"));
            }
        }
        this.forceReload();
    }
}
