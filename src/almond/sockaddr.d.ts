// TODO move to upstream repository

declare module 'sockaddr' {
    function sockaddr(address : string, options ?: {
        defaultPort : number
    }) : sockaddr.SocketAddress;

    namespace sockaddr {
        export type SocketAddress = {
            host : string;
            port : number;
        } | {
            path : string;
        }
    }

    export = sockaddr;
}
