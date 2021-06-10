declare module 'passport-totp' {
    import passport from 'passport';

    type SetupFunction = (user : Express.User, cb : (err : Error|null, key ?: string|Buffer, window ?: number) => void) => void;

    export class Strategy extends passport.Strategy {
        constructor(options : { codeField ?: string, window ?: number }, setup : SetupFunction);
        constructor(setup : SetupFunction);
    }
}
