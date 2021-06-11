declare module 'cacheable-middleware' {
    import { RequestHandler, Request, Response, NextFunction } from 'express';
    import * as moment from 'moment';

    function Cacheable(duration ?: number, durationKey ?: moment.unitOfTime.DurationConstructor) : RequestHandler;
    namespace Cacheable {
        function cachedResponse(ms : number, req : Request, res : Response, next : NextFunction) : void;

        function cacheFor(this : Response, ms : number) : Response;
    }

    export = Cacheable;
}
declare namespace Express {
    interface Response {
        cacheFor(duration : moment.Duration) : this;
        cacheFor(value : number, durationKey ?: moment.unitOfTime.DurationConstructor) : this;
    }
}
