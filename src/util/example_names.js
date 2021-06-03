// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>


const { Ast } = require('thingtalk');

function camelCase(string) {
    return string.split(/[\s,."'!?_()]+/g).map((t) => t ? (t[0].toUpperCase() + t.substring(1)) : '').join('');
}

function getExampleNameInvocation(invocation) {
    let name = camelCase(invocation.channel);
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

    let lhs = filter.isAtom ? filter.name : getScalarExpressionName(filter.lhs);
    let rhs = filter.rhs || filter.value;

    let name = `By` + camelCase(lhs);
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

    if (rhs.isEnum)
        return name + camelCase(rhs.value);
    return name;
}

function getScalarExpressionName(ast) {
    if (ast instanceof Ast.VarRefValue)
        return ast.name;
    if (ast instanceof Ast.ComputationValue && /^[a-zA-Z0-9]+$/.test(ast.op))
        return ast.op;
    else if (ast instanceof Ast.FilterValue || ast instanceof Ast.ArrayFieldValue)
        return getScalarExpressionName(ast.value);
    else
        return 'result';
}

function getExampleNameExpression(expression) {
    if (expression instanceof Ast.FunctionCallExpression) {
        return camelCase(expression.name);
    } else if (expression instanceof Ast.InvocationExpression) {
        return getExampleNameInvocation(expression.invocation);
    } else if (expression instanceof Ast.FilterExpression) {
        return getExampleNameExpression(expression.expression) + getExampleNameFilter(expression.filter);
    } else if (expression instanceof Ast.ProjectionExpression) {
        return expression.args.map(camelCase).join('') +
            expression.computations.map((c) => camelCase(getScalarExpressionName)).join('')
             + `Of` + getExampleNameExpression(expression.expression);
    } else if (expression instanceof Ast.AggregationExpression) {
        return camelCase(expression.operator) + (expression.field === '*' ? '' : camelCase(expression.field)) + `Of` + getExampleNameExpression(expression.expression);
    } else if (expression instanceof Ast.SortExpression) {
        return `Sort` + camelCase(getScalarExpressionName(expression.field)) +
            camelCase(expression.direction) + getExampleNameExpression(expression.expression);
    } else if (expression instanceof Ast.MonitorExpression) {
        return `Monitor` + getExampleNameExpression(expression.expression);
    } else if (expression instanceof Ast.IndexExpression ||
               expression instanceof Ast.SliceExpression ||
               expression instanceof Ast.AliasExpression) {
        return getExampleNameExpression(expression.expression);
    } else if (expression instanceof Ast.ChainExpression) {
        return expression.expressions.map(getExampleNameExpression).join('And');
    } else {
        throw new TypeError();
    }
}

module.exports = function getExampleName(ex) {
    return getExampleNameExpression(ex.value);
};
