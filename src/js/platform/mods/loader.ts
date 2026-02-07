// import EventEmitter from "node:events";
// import fs from "node:fs/promises";
// import path from "node:path";
import { AsarArchive } from "./asar_reader";
import { /*DevelopmentModLocator, DistroModLocator,*/ ModLocator, UserModLocator } from "./locator";
import { IpcModMetadata, ModMetadata } from "./metadata";

type ModSource = "user" | "distro" | "dev";

type ModLocation = {
    source: ModSource;
    file: FileSystemHandle;
};

type DisabledMod = {
    source: ModSource;
    id: string;
};

type IpcMod = Omit<ModLocation, "file"> & {
    file: string;
    disabled: boolean;
    metadata: IpcModMetadata;
};

const METADATA_FILE = "mod.json";

class Mod {
    readonly source: ModSource;
    readonly file: FileSystemHandle;
    readonly metadata: ModMetadata;

    disabled = false;

    constructor(source: ModSource, file: FileSystemHandle, metadata: ModMetadata) {
        this.source = source;
        this.file = file;
        this.metadata = metadata;
    }

    toJSON(): IpcMod {
        return {
            source: this.source,
            file: this.file.name,
            disabled: this.disabled,
            metadata: {
                ...this.metadata,
                version: this.metadata.version.format(),
            },
        };
    }
}

export class ModLoaderPlatform {
    private mods: Mod[] = [];
    private readonly locators = new Map<ModSource, ModLocator>();

    constructor() {
        // super();

        this.locators.set("user", new UserModLocator());
        // this.locators.set("distro", new DistroModLocator());

        // const devLocator = new DevelopmentModLocator();
        // this.locators.set("dev", devLocator);

        // // If requested, restart automatically when dev mods are modified
        // devLocator.fsWatcher?.on("all", this.delayedForceReload());
    }

    /**
     * Resets modloader state and reloads all mods, then triggers page reload.
     */
    // async forceReload() {
    //     await this.loadMods();
    //     this.emit("forcereload");
    // }

    async loadMods(): Promise<void> {
        const mods: Mod[] = [];
        this.mods = mods;

        const locations = await this.locateAllMods();
        console.error(locations);
        for (const location of locations) {
            const metadata = await this.resolveMetadata(location);
            if (metadata === null) {
                continue;
            }
            console.warn(metadata);

            // TODO: Only check this after applying disabled state
            if (this.isModPresent(metadata.id)) {
                console.warn(`Ignoring duplicate mod ${location.source}::${location.file}`);
                continue;
            }

            mods.push(new Mod(location.source, location.file, metadata));
            console.error("we made it!", location.file);
        }

        // Check for mods that should be disabled
        for (const { source, id } of await this.collectDisabledMods()) {
            const target = mods.find(m => m.source === source && m.metadata.id === id);
            if (target !== undefined) {
                console.error("disabled?!", target.file);
                target.disabled = true;
            }
        }
        this.mods = mods;
        console.warn("please be my mods", this.mods);
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

    /*private delayedForceReload() {
        // Debounce the force reload manually as chokidar won't aggregate events the way we want
        // NOTE: The delay chosen here (250ms) is quite arbitrary!
        let timeout: NodeJS.Timeout | undefined = undefined;
        return () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => this.forceReload(), 250);
        };
    }*/

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
        // const filePath = path.join(mod.file, METADATA_FILE);
        try {
            const metadata = await getFileFromAsarOrDirectory(mod.file, METADATA_FILE);
            // const metadataFile = mod.file;
            // const contents = await fs.readFile(metadataFile, "utf-8");
            const contents = await metadata.text();
            console.warn(contents);
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
}

export async function getFileFromAsarOrDirectory(entry: FileSystemHandle, name: string): Promise<Blob> {
    switch (entry.kind) {
        case "file": {
            const asar = new AsarArchive(await (entry as FileSystemFileHandle).getFile());
            await asar.init();
            return await asar.getFile(name);
        }
        case "directory": {
            const metadataFileHandle = await (entry as FileSystemDirectoryHandle).getFileHandle(name);
            return await metadataFileHandle.getFile();
        }
    }
}
