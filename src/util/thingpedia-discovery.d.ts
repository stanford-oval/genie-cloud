// TODO move to upstream repository
declare module 'thingpedia-discovery' {
    export interface DiscoveryDatabase<RowType extends { id : number }> {
        getByPrimaryKind(kind : string) : Promise<RowType>;
        getByAnyKind(kind : string) : Promise<RowType[]>;
        getAllKinds(id : number) : Promise<Array<{ kind : string }>>;
    }

    export class Server<RowType extends { id : number }> {
        constructor(db : DiscoveryDatabase<RowType>);

        decode(data : {
            kind : 'upnp'|'bluetooth',
            [key : string] : unknown
        }) : Promise<RowType>;
    }
}
