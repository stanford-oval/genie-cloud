declare module 'markdown-it-table-of-contents' {
    import { PluginWithOptions } from 'markdown-it';

    const plugin : PluginWithOptions<{
        includeLevel ?: number[]
    }>;
    export = plugin;
}
