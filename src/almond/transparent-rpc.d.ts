// TODO move to upstream repository

declare module 'transparent-rpc' {
    import * as events from 'events';

    class SocketClosedError extends Error {
        code : 'ERR_SOCKET_CLOSED';
    }

    class InvalidObjectError extends Error {
        code : 'ENXIO';
        objectId : number;
    }

    export interface Stubbable<Methods extends string = string> {
        $rpcId ?: number;
        $rpcMethods : ReadonlyArray<Methods & keyof this>;
    }

    export type RpcId = number;

    interface StreamLike extends events.EventEmitter {
        write(obj : unknown, cb : (err ?: Error|null) => void) : void;
    }

    export class Socket extends events.EventEmitter {
        constructor(socket : StreamLike);

        end(callback ?: (err ?: Error) => void) : void;
        destroy() : void;

        addStub<T extends Stubbable>(obj : T) : RpcId;

        call(id : RpcId, method : string, args : unknown[]) : Promise<unknown>;

        freeProxy(id : RpcId) : void;
        getProxy(id : RpcId) : Proxy<unknown>|undefined;
    }

    /**
     * The type of a value, as returned by an RPC call.
     *
     * Stubbable objects turn into proxies. Everything else goes through JSON;
     * we note this fact by removing properties that have function type.
     */
    type RpcMarshalOut<T> = T extends Stubbable<any> ? Proxy<T>
        : T extends null | undefined | string | number ? T
        : T extends Promise<infer T1> ? RpcMarshalOut<T1>
        : { [K in keyof T] : (T[K] extends ((...args : any[]) => any) ? never : T[K]) };

    /**
     * The type of a value that can be passed to an RPC call.
     *
     * Stubbable objects turn into proxies. Either a proxy or the original object
     * can be passed.
     */
    type RpcMarshalIn<T> = T extends Stubbable ? (T|Proxy<T>) :
        T extends Proxy<infer Inner> ? (Inner|Proxy<Inner>) : T;

    type RpcMarshalArgs<Args extends unknown[]> = {
        [K in keyof Args] : RpcMarshalIn<Args[K]>
    } & unknown[];

    /**
     * The methods of an object that can be accessed as a proxy.
     *
     * This is potentially an over-approximation which can include all methods of T
     */
    type Methods<T> = T extends Stubbable<infer M> ? (keyof T & M) : keyof T;

    /**
     * The type of a field on the proxy.
     *
     * If the underlying type is a function, this is a function with the same parameters
     * and a modified return type.
     * Otherwise, it is a promise of the getter.
     */
    type ProxyField<T, K extends keyof T> =
        T[K] extends ((...args : any[]) => any) ?
            (this : Proxy<T>, ...args : RpcMarshalArgs<Parameters<T[K]>>) => Promise<RpcMarshalOut<ReturnType<T[K]>>> :
            Promise<T[K]>;

    export type Proxy<T> = {
        [K in Exclude<Methods<T>, '$free'>] : ProxyField<T, K>;
    } & {
        $free() : void;
    }
}
