declare module '@fragaria/address-formatter' {
    export function format(address : Record<string, string>, options : {
        abbreviate ?: boolean;
        appendCountry ?: boolean;
        countryCode ?: string;
        fallbackCountryCode ?: string;
        output : 'array'
    }) : string[];
    export function format(address : Record<string, string>, options ?: {
        abbreviate ?: boolean;
        appendCountry ?: boolean;
        countryCode ?: string;
        fallbackCountryCode ?: string;
    }) : string;
}
