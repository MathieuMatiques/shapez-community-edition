/**
 * @this {import('@rspack/core').LoaderContext<{start?: string, end?: string}>}
 * @param {string} content
 * @returns {string}
 */
export default function StripBlockLoader(content) {
    const options = this.getOptions();
    const startComment = options.start || "develblock:start";
    const endComment = options.end || "develblock:end";

    const regexPattern = new RegExp(
        `[\\t ]*\\/\\* ?${startComment} ?\\*\\/[\\s\\S]*?\\/\\* ?${endComment} ?\\*\\/[\\t ]*\\n?`
    );

    this.cacheable(true);

    return content.replaceAll(regexPattern, "");
}
