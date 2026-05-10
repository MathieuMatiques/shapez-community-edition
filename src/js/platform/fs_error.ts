/**
 * Represents a filesystem error as reported by the main process.
 */
export class FsError extends Error {
    code?: string;

    constructor(message?: string, options?: ErrorOptions) {
        super(message, options);
        Error.captureStackTrace(this, FsError);
        this.name = "FsError";

        // Take the code from the error message, quite ugly
        if (options?.cause && options.cause instanceof Error) {
            // Example message:
            // ENOENT: No such...
            this.code = options.cause.message.split(":")[0].trim();
        }
    }

    isFileNotFound(): boolean {
        return this.code === "ENOENT";
    }
}
