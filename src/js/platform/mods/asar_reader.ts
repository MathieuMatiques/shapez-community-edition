// asar-reader.ts

type DirHeader = {
    files: Record<string, EntryHeader>;
};

type FileHeader = {
    offset: string;
    size: number;
    executable: boolean;
    integrity: {
        algorithm: string;
        hash: string;
        blockSize: number;
        blocks: string[];
    };
};

type EntryHeader = FileHeader | DirHeader;

export class AsarArchive {
    private header: DirHeader;
    private headerSize: number;

    constructor(private blob: Blob) {}

    async init() {
        const sizeBuffer = await this.blob.slice(0, 8).arrayBuffer();
        const view = new DataView(sizeBuffer);
        // ASAR header size is at offset 4
        this.headerSize = view.getUint32(4, true);

        const headerBuffer = (await this.blob.slice(16, 8 + this.headerSize).text()).replaceAll("\0", "");
        // const headerString = new TextDecoder().decode(headerBuffer);
        // console.error(headerBuffer);
        this.header = JSON.parse(headerBuffer);
    }

    getEntryHeader(path: string): EntryHeader | null {
        // console.warn(this.header);
        // console.warn(path);
        // const parts = path.split("/").filter(p => p);
        // let current = this.header.files;
        // for (const part of parts) {
        //     current = current[part];
        //     if (!current) return null;
        // }
        // return current;

        // async function getFileFromDirectory(mod: FileSystemDirectoryHandle, file: string): Promise<Blob> {
        let currentDir = this.header;
        const pathRemaining = path.split("/");
        while (pathRemaining.length > 1) {
            const next = currentDir.files[pathRemaining.shift()];
            if (!next || !next.files) {
                return null;
            }
            currentDir = next as DirHeader;
        }
        const entryHeader = currentDir.files[pathRemaining[0]];
        return entryHeader ?? null;
        // }
    }

    async getFile(path: string): Promise<Blob | null> {
        const info = this.getEntryHeader(path);
        if (!info || !info.offset) return null;

        // ASAR offsets are relative to the end of the header
        const start = 8 + this.headerSize + parseInt((info as FileHeader).offset);
        const end = start + (info as FileHeader).size;
        return this.blob.slice(start, end);
    }
}
