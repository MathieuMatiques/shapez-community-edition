/**
 * Represents a filesystem error as reported by the main process.
 */
export class FsError extends Error {
    code?: string;

    constructor(message?: string, options?: ErrorOptions) {
        super(message, options);
        Error.captureStackTrace(this, FsError);
        this.name = "FsError";

        if (options?.cause && options.cause instanceof Error) {
            this.code = options.cause.name;
        }
    }

    isFileNotFound(): boolean {
        return this.code === "NotFoundError";
    }
}
