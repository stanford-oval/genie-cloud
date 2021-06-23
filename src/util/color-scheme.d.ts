declare module 'color-scheme' {
    class ColorScheme {
        constructor();

        from_hue(hue : number) : this;
        from_hex(hex : string) : this;

        scheme(s ?: 'mono' | 'contrast' | 'triade' | 'tetrade' | 'analogic') : this;
        variation(v : 'default' | 'pastel' | 'soft' | 'light' | 'hard' | 'pale') : this;
        distance(d : number) : this;
        add_complement(b : boolean) : this;
        web_safe(b : boolean) : this;

        colors() : string[];
        colorset() : string[][];
    }

    export = ColorScheme;
}
