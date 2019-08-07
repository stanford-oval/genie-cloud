// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";


function camelCase(string) {
    return string.split(/[\s,."'!?_()]+/g).map((t) => t[0].toUpperCase() + t.substring(1)).join('');
}

function getExampleNameInvocation(invocation) {
    if (invocation.selector.isBuiltin)
        return camelCase(invocation.channel);
    let name = camelCase(invocation.schema.canonical);
    for (let in_param of invocation.in_params) {
        if (in_param.value.isUndefined && in_param.name in invocation.schema.inReq)
            continue;
        if (in_param.value.isEnum)
            name += 'With' + camelCase(in_param.name) + camelCase(in_param.value.value);
        else
            name += 'With' + camelCase(in_param.name);
    }
    return name;
}

function getExampleNameFilter(filter) {
    if (filter.isTrue)
        return `True`;
    if (filter.isFalse)
        return `False`;
    if (filter.isNot)
        return `Not` + getExampleNameFilter(filter.expr);
    if (filter.isAnd)
        return filter.operands.map(getExampleNameFilter).join(`And`);
    if (filter.isOr)
        return filter.operands.map(getExampleNameFilter).join(`Or`);
    if (filter.isExternal)
        return `With` + getExampleNameInvocation(filter);

    let name = `By` + camelCase(filter.name);
    switch (filter.operator) {
    case '>=':
        name += 'GreaterThan';
        break;
    case '<=':
        name += 'LessThan';
        break;
    case 'starts_with':
    case 'ends_with':
        name += camelCase(filter.operator);
    }

    if (filter.value.isEnum)
        return name + camelCase(filter.value.value);
    return name;
}

function getExampleNameTable(table) {
    if (table.isVarRef)
        return camelCase(table.name);
    else if (table.isInvocation)
        return getExampleNameInvocation(table.invocation);
    else if (table.isFilter)
        return getExampleNameTable(table.table) + getExampleNameFilter(table.filter);
    else if (table.isProjection)
        return table.args.map(camelCase).join('') + `Of` + getExampleNameTable(table.table);
    else if (table.isAggregation)
        return camelCase(table.operator) + (table.field === '*' ? '' : camelCase(table.field)) + `Of` + getExampleNameTable(table.table);
    else if (table.isSort)
        return `Sort` + camelCase(table.field) + camelCase(table.direction) + getExampleNameTable(table.table);
    else if (table.isIndex || table.isSlice || table.isHistory || table.isSequence || table.isCompute || table.isAlias)
        return getExampleNameTable(table.table);
    else if (table.isWindow || table.isTimeSeries)
        return getExampleNameStream(table.stream);
    else if (table.isJoin)
        return getExampleNameTable(table.lhs) + 'And' + getExampleNameTable(table.rhs);
    else
        throw new TypeError();
}
function getExampleNameStream(stream) {
    if (stream.isVarRef)
        return camelCase(stream.name);
    else if (stream.isTimer || stream.isAtTimer)
        return `Timer`;
    else if (stream.isMonitor)
        return `Monitor` + getExampleNameTable(stream.table);
    else if (stream.isEdgeFilter || stream.isFilter)
        return getExampleNameStream(stream.stream) + getExampleNameFilter(stream.filter);
    else if (stream.isProjection)
        return stream.args.map(camelCase).join('') + `Of` + getExampleNameStream(stream.stream);
    else if (stream.isEdgeNew || stream.isCompute || stream.isAlias)
        return getExampleNameStream(stream.stream);
    else if (stream.isJoin)
        return getExampleNameStream(stream.stream) + 'Then' + getExampleNameTable(stream.table);
    else
        throw new TypeError();
}
function getExampleNameAction(action) {
    if (action.isVarRef)
        return camelCase(action.name);
    else
        return getExampleNameInvocation(action.invocation);
}
function getExampleNameProgram(program) {
    return program.rules.map((r) => {
        if (r.isAssignment)
            return getExampleNameTable(r.value);
        else if (r.stream)
            return getExampleNameStream(r.stream) + 'Then' + r.actions.map(getExampleNameAction).join('And');
        else if (r.table)
            return getExampleNameTable(r.table) + 'Then' + r.actions.map(getExampleNameAction).join('And');
        else
            return r.actions.map(getExampleNameAction).join('And');
    }).join('And');
}

module.exports = function getExampleName(ex) {
    switch (ex.type) {
    case 'query':
        return getExampleNameTable(ex.value);
    case 'stream':
        return getExampleNameStream(ex.value);
    case 'action':
        return getExampleNameAction(ex.value);
    case 'program':
        return getExampleNameProgram(ex.value);
    default:
        throw new TypeError(`Invalid example type ${ex.type}`);
    }
};
