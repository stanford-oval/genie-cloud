declare module 'thirty-two' {
    export function encode(buffer : string|Buffer) : string;

    export function decode(string : string|Buffer) : Buffer;
}
