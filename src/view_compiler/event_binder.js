/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { EventHandlerVars, convertActionBinding } from '../compiler_util/expression_converter';
import { createInlineArray } from '../compiler_util/identifier_util';
import { DirectiveWrapperExpressions } from '../directive_wrapper_compiler';
import { MapWrapper } from '../facade/collection';
import { Identifiers, resolveIdentifier } from '../identifiers';
import * as o from '../output/output_ast';
import { CompileMethod } from './compile_method';
import { ViewProperties } from './constants';
import { getHandleEventMethodName } from './util';
export function bindOutputs(boundEvents, directives, compileElement, bindToRenderer) {
    var usedEvents = collectEvents(boundEvents, directives);
    if (!usedEvents.size) {
        return false;
    }
    if (bindToRenderer) {
        subscribeToRenderEvents(usedEvents, compileElement);
    }
    subscribeToDirectiveEvents(usedEvents, directives, compileElement);
    generateHandleEventMethod(boundEvents, directives, compileElement);
    return true;
}
function collectEvents(boundEvents, directives) {
    var usedEvents = new Map();
    boundEvents.forEach(function (event) { usedEvents.set(event.fullName, event); });
    directives.forEach(function (dirAst) {
        dirAst.hostEvents.forEach(function (event) { usedEvents.set(event.fullName, event); });
    });
    return usedEvents;
}
function subscribeToRenderEvents(usedEvents, compileElement) {
    var eventAndTargetExprs = [];
    usedEvents.forEach(function (event) {
        if (!event.phase) {
            eventAndTargetExprs.push(o.literal(event.name), o.literal(event.target));
        }
    });
    if (eventAndTargetExprs.length) {
        var disposableVar = o.variable("disposable_" + compileElement.view.disposables.length);
        compileElement.view.disposables.push(disposableVar);
        compileElement.view.createMethod.addStmt(disposableVar
            .set(o.importExpr(resolveIdentifier(Identifiers.subscribeToRenderElement)).callFn([
            ViewProperties.renderer, compileElement.renderNode,
            createInlineArray(eventAndTargetExprs), handleEventClosure(compileElement)
        ]))
            .toDeclStmt(o.FUNCTION_TYPE, [o.StmtModifier.Private]));
    }
}
function subscribeToDirectiveEvents(usedEvents, directives, compileElement) {
    var usedEventNames = MapWrapper.keys(usedEvents);
    directives.forEach(function (dirAst) {
        var dirWrapper = compileElement.directiveWrapperInstance.get(dirAst.directive.type.reference);
        compileElement.view.createMethod.addStmts(DirectiveWrapperExpressions.subscribe(dirAst.directive, dirAst.hostProperties, usedEventNames, dirWrapper, handleEventClosure(compileElement)));
    });
}
function generateHandleEventMethod(boundEvents, directives, compileElement) {
    var hasComponentHostListener = directives.some(function (dirAst) { return dirAst.hostEvents.some(function (event) { return dirAst.directive.isComponent; }); });
    var markPathToRootStart = hasComponentHostListener ? compileElement.appElement.prop('componentView') : o.THIS_EXPR;
    var handleEventStmts = new CompileMethod(compileElement.view);
    handleEventStmts.resetDebugInfo(compileElement.nodeIndex, compileElement.sourceAst);
    handleEventStmts.push(markPathToRootStart.callMethod('markPathToRootAsCheckOnce', []).toStmt());
    var eventNameVar = o.variable('eventName');
    var resultVar = o.variable('result');
    handleEventStmts.push(resultVar.set(o.literal(true)).toDeclStmt(o.BOOL_TYPE));
    directives.forEach(function (dirAst, dirIdx) {
        var dirWrapper = compileElement.directiveWrapperInstance.get(dirAst.directive.type.reference);
        if (dirAst.hostEvents.length > 0) {
            handleEventStmts.push(resultVar
                .set(DirectiveWrapperExpressions
                .handleEvent(dirAst.hostEvents, dirWrapper, eventNameVar, EventHandlerVars.event)
                .and(resultVar))
                .toStmt());
        }
    });
    boundEvents.forEach(function (renderEvent, renderEventIdx) {
        var evalResult = convertActionBinding(compileElement.view, compileElement.view, compileElement.view.componentContext, renderEvent.handler, "sub_" + renderEventIdx);
        var trueStmts = evalResult.stmts;
        if (evalResult.preventDefault) {
            trueStmts.push(resultVar.set(evalResult.preventDefault.and(resultVar)).toStmt());
        }
        // TODO(tbosch): convert this into a `switch` once our OutputAst supports it.
        handleEventStmts.push(new o.IfStmt(eventNameVar.equals(o.literal(renderEvent.fullName)), trueStmts));
    });
    handleEventStmts.push(new o.ReturnStatement(resultVar));
    compileElement.view.methods.push(new o.ClassMethod(getHandleEventMethodName(compileElement.nodeIndex), [
        new o.FnParam(eventNameVar.name, o.STRING_TYPE),
        new o.FnParam(EventHandlerVars.event.name, o.DYNAMIC_TYPE)
    ], handleEventStmts.finish(), o.BOOL_TYPE));
}
function handleEventClosure(compileElement) {
    var handleEventMethodName = getHandleEventMethodName(compileElement.nodeIndex);
    return o.THIS_EXPR.callMethod('eventHandler', [o.THIS_EXPR.prop(handleEventMethodName).callMethod(o.BuiltinMethod.Bind, [o.THIS_EXPR])]);
}
//# sourceMappingURL=event_binder.js.map