declare module 'img-color-extractor' {
    import * as stream from 'stream';

    export interface Options {
        background ?: string;
        alphaMin ?: number;
        dist ?: number;
        greyVa ?: number;
    }
    export interface Color {
        color : string;
        n : number;
        r : number;
    }

    export function extract(readable : stream.Readable, opts ?: Options) : Promise<Color[]>;
}
