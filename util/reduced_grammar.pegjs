// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

{
    function take(array, idx) {
        return array.map(function(v) { return v[idx]; });
    }

    function postprocess(prog) {
        if (prog.action !== undefined && prog.action.name.id === 'tt:builtin.notify' && prog.action.args.length === 0)
            prog.action = undefined;
        var parts = 0;
        if (prog.trigger)
            parts++;
        if (prog.query)
            parts++;
        if (prog.action)
            parts++;
        if (parts > 1)
            return { rule: prog };
        else if (prog.trigger)
            return { trigger: prog.trigger };
        else if (prog.query)
            return { query: prog.query };
        else if (prog.action)
            return { action: prog.action };
        else
            throw new TypeError();
    }
}

program = prog:(command / rule) {
    return postprocess(prog);
}

rule = first:rule_part_list _ '=>' _ second:rule_part_list _ third:('=>' _ rule_part_list)? {
    var obj = { trigger: first };
    if (third !== null) {
        obj.query = second;
        obj.action = third[2];
    } else {
        obj.query = undefined;
        obj.action = second;
    }
    return obj;
}
rule_part_list = invocation:invocation _ conditions:(',' _ condition _)* {
    return { name: invocation.name, args: take(conditions, 2) };
}
command = '$now' _ '=>' _ second:rule_part_list _ third:('=>' _ rule_part_list)? {
    if (third !== null)
        return { trigger: undefined, query: second, action: third[2] };
    else
        return { trigger: undefined, query: undefined, action: second };
}

invocation = name:(channel_spec / builtin_spec) _ args:channel_param_list {
    return { name: name, args: args };
}
channel_spec = '@' kind:genident _ '.' _ name:ident {
    return { id: 'tt:' + kind + '.' + name };
}
builtin_spec = '@$' name:ident {
    return { id: 'tt:builtin.' + name };
}
channel_param_list = '(' _ ')' { return []; } /
    '(' _ first:(null_expression / ident) _ rest:(',' _ (null_expression / ident) _)* ')' {
        return [first].concat(take(rest, 2));
    }
null_expression = '_' { return null; }

condition = varName:ident _ op:comparator _ value:value {
    return { type: value.type, operator: op, value: value.value, name: { id: 'tt:param.' + varName } };
} / func:bool_function _ '(' _ varName:ident _ ',' _ value:value _ ')' {
    return { type: value.type, operator: func, value: value.value, name: { id: 'tt:param.' + varName } };
}

bool_function = '$contains' { return 'has'; }
comparator "comparator" = '>=' / '<=' / '>' / '<' / '=~' { return 'contains'; } / ('=' !'>') { return 'is'; } / '!='

value =
        bool_value /
        var_ref_value /
        event_value /
        measure_value /
        number_value /
        date_value /
        time_value /
        location_value /
        enum_value /
        email_value /
        phone_value /
        username_value /
        hashtag_value /
        url_value /
        string_value

var_ref_value = name:ident { return { type: 'VarRef', value: { id: 'tt:param.' + name } }; }
measure_value = num:literal_number unit:ident { return { type: 'Measure', value: { value: num, unit: unit } }; }
number_value = v:literal_number { return { type: 'Number', value: { value: v } }; }
date_value = '$makeDate' _ '(' year:literal_number _ ',' _ month:literal_number _ ',' _ day:literal_number _ ')' {
    return { type: 'Date', value: { year: year, month: month, day: day } };
}
time_value = '$makeTime' _ '(' hour:literal_number _ ',' _ minute:literal_number _ ')' {
    return { type: 'Time', value: { year: -1, month: -1, day: -1, hour: hour, minute: minute, second: 0 } };
}
bool_value = v:literal_bool { return { type: 'Bool', value: { value: v } }; }
location_value = '$makeLocation' _ '(' _ lat:literal_number _ ',' _ lon:literal_number _ ')' {
    return { type: 'Location', value: { relativeTag: 'absolute', latitude: lat, longitude: lon } };
} / '$home' {
    return { type: 'Location', value: { relativeTag: 'rel_home', latitude: -1, longitude: -1 } };
} / '$work' {
    return { type: 'Location', value: { relativeTag: 'rel_work', latitude: -1, longitude: -1 } };
} / '$here' {
    return { type: 'Location', value: { relativeTag: 'rel_current_location', latitude: -1, longitude: -1 } };
}
email_value = '$makeEmailAddress' _ '(' _ v:literal_string _ ')' {
    return { type: 'EmailAddress', value: { value: v } };
}
phone_value = '$makePhoneNumber' _ '(' _ v:literal_string _ ')' {
    return { type: 'PhoneNumber', value: { value: v } };
}
url_value = '$makeURL' _ '(' _ v:literal_string _ ')' {
    return { type: 'URL', value: { value: v } };
}
username_value = '$makeUsername' _ '(' _ v:literal_string _ ')' {
    return { type: 'Username', value: { value: v } };
}
hashtag_value = '$makeHashtag' _ '(' _ v:literal_string _ ')' {
    return { type: 'Hashtag', value: { value: v } };
}
enum_value = '$enum' _ '(' _ v:ident _ ')' {
    return { type: 'Enum', value: { value: v } };
}
string_value = v:literal_string {
    return { type: 'String', value: { value: v } };
}
event_value = v:$('$event' ('.' ('title' / 'body'))?) {
    return { type: 'VarRef', value: { id: 'tt:param.' + v } };
}

literal_bool = true_bool { return true; } / false_bool { return false; }
true_bool = 'on' / 'true'
false_bool = 'off' / 'false'

// dqstrchar = double quote string char
// sqstrchar = single quote string char
dqstrchar = [^\\\"] / "\\\"" { return '"'; } / "\\n" { return '\n'; } / "\\'" { return '\''; } / "\\\\" { return '\\'; }
sqstrchar = [^\\\'] / "\\\"" { return '"'; } / "\\n" { return '\n'; } / "\\'" { return '\''; } / "\\\\" { return '\\'; }
literal_string "string" = '"' chars:dqstrchar* '"' { return chars.join(''); }
    / "'" chars:sqstrchar* "'" { return chars.join(''); }
digit "digit" = [0-9]
literal_number "number" =
    num:$(digit+ '.' digit* ('e' digit+)?) { return parseFloat(num); } /
    num:$('.' digit+ ('e' digit+)?) { return parseFloat(num); } /
    num:$(digit+ ('e' digit+)?) { return parseFloat(num); }

identstart = [A-Za-z_]
identchar = [A-Za-z0-9_]
genidentchar = [A-Z-a-z0-9_\-]
ident "ident" = $(identstart identchar*)
genident "genident" = $(identstart genidentchar*)

_ = (whitespace / comment)*
__ = whitespace _
whitespace "whitespace" = [ \r\n\t\v]
comment "comment" = '/*' ([^*] / '*'[^/])* '*/' / '//' [^\n]* '\n'
