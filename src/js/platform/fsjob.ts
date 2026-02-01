/// <reference types="@types/wicg-file-system-access" />
// import { BrowserWindow, dialog, FileFilter } from "electron";
// import fs from "fs/promises";
// import path from "path";
// import { userData } from "./config.js";
import { Logger } from "@/core/logging";
const logger = new Logger("fsjob");
interface GenericFsJob {
    id: string;
}

export type InitializeFsJob = GenericFsJob & { type: "initialize" };
type ListFsJob = GenericFsJob & { type: "list"; filename: string };
type ReadFsJob = GenericFsJob & { type: "read"; filename: string };
type WriteFsJob = GenericFsJob & { type: "write"; filename: string; contents: Uint8Array };
type DeleteFsJob = GenericFsJob & { type: "delete"; filename: string };

type OpenExternalFsJob = GenericFsJob & { type: "open-external"; extension: string };
type SaveExternalFsJob = GenericFsJob & { type: "save-external"; filename: string; contents: Uint8Array };

export type FsJob =
    | InitializeFsJob
    | ListFsJob
    | ReadFsJob
    | WriteFsJob
    | DeleteFsJob
    | OpenExternalFsJob
    | SaveExternalFsJob;
type FsJobResult = Uint8Array | string[] | void;

export class FsJobHandler {
    private rootHandle: FileSystemDirectoryHandle | null = null;
    readonly subDir: string;
    private initialized = false;

    constructor(subDir: string) {
        this.subDir = subDir;
    }

    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        // Create the directory so that users know where to put files
        navigator.storage.persist().then(persistent => {
            logger.warn("Am I persistent?", persistent);
        });
        const root = await navigator.storage.getDirectory();
        this.rootHandle = await root.getDirectoryHandle(this.subDir, { create: true });
        this.initialized = true;
    }

    handleJob(job: FsJob): Promise<FsJobResult> {
        switch (job.type) {
            case "initialize":
                return this.initialize();
            case "open-external":
                return this.openExternal(job.extension);
            case "save-external":
                return this.saveExternal(job.filename, job.contents);
        }

        // const filename = this.safeFileName(job.filename);
        const filename = job.filename;

        switch (job.type) {
            case "list":
                return this.list(filename);
            case "read":
                return this.read(filename);
            case "write":
                return this.write(filename, job.contents);
            case "delete":
                return this.delete(filename);
        }

        // @ts-expect-error this method can actually receive garbage
        throw new Error(`Unknown FS job type: ${job.type}`);
    }

    private async openExternal(extension: string): Promise<Uint8Array | undefined> {
        // const filters = this.getFileDialogFilters(extension === "*" ? undefined : extension);
        // const window = BrowserWindow.getAllWindows()[0]!;

        // const result = await dialog.showOpenDialog(window, { filters, properties: ["openFile"] });
        // if (result.canceled) {
        //     return undefined;
        // }

        // return await fs.readFile(result.filePaths[0]);
        const accept = this.getFileDialogFilters(extension);

        try {
            const [handle] = await window.showOpenFilePicker({
                types: [{ accept }],
                multiple: false,
            });
            const file = await handle.getFile();
            return new Uint8Array(await file.arrayBuffer());
        } catch (e) {
            return undefined; // Handles user cancellation
        }
    }

    private async saveExternal(filename: string, contents: Uint8Array): Promise<void> {
        // Try to guess extension
        const extension = filename.indexOf(".") < 1 ? filename.split(".").at(-1)! : undefined;
        const accept = this.getFileDialogFilters(extension);

        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{ accept }],
            });
            const writable = await handle.createWritable();
            await writable.write(contents);
            await writable.close();
        } catch (e) {
            // User cancelled
        }
    }

    private getFileDialogFilters(
        extension?: string
    ): Record<`${string}/${string}`, `.${string}`> | undefined {
        let accept: Record<`${string}/${string}`, `.${string}`> | undefined;
        if (extension && extension !== "*") {
            accept = {};
            accept[`application/${extension}`] = `.${extension}`;
        }

        return accept;
    }

    private async list(subdir: string): Promise<string[]> {
        const dirHandle = await this.rootHandle!.getDirectoryHandle(subdir);
        const names: string[] = [];
        for await (const name of dirHandle.keys()) {
            names.push(name);
        }
        return names;
    }

    private async read(file: string): Promise<Uint8Array> {
        const fileHandle = await this.rootHandle!.getFileHandle(file);
        logger.warn("my file", fileHandle);
        const file_ = await fileHandle.getFile();
        logger.warn("my file aghen", file_);
        return new Uint8Array(await file_.arrayBuffer());
    }

    private async write(file: string, contents: Uint8Array): Promise<void> {
        const fileHandle = await this.rootHandle!.getFileHandle(file, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(contents);
        await writable.close();
    }

    private async delete(entry: string): Promise<void> {
        return this.rootHandle!.removeEntry(entry);
    }

    // private safeFileName(name: string) {
    //     // TODO: Rather than restricting file names, attempt to resolve everything
    //     // relative to the data directory (i.e. normalize the file path, then join)
    //     const relative = name.replace(/[^a-z.0-9_-]/gi, "_");
    //     return path.join(this.rootDir, relative);
    // }
}

export class IpcHandler {
    private readonly savesHandler = new FsJobHandler("saves");
    invoke(channel: "fs-job", message: FsJob) {
        return this.handleFsJob(message);

        // Not implemented
        // ipcMain.handle("open-mods-folder", ...)
    }
    private handleFsJob(job: FsJob) {
        if (job.id !== "saves") {
            throw new Error("Storages other than saves/ are not implemented yet");
        }

        return this.savesHandler.handleJob(job);
    }
}

export const fsHandler = new IpcHandler();
