/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
"use strict";
var core_1 = require('@angular/core');
var compile_metadata_1 = require('./compile_metadata');
var collection_1 = require('./facade/collection');
var exceptions_1 = require('./facade/exceptions');
var o = require('./output/output_ast');
var util_1 = require('./util');
var view_compiler_1 = require('./view_compiler/view_compiler');
var _COMPONENT_FACTORY_IDENTIFIER = new compile_metadata_1.CompileIdentifierMetadata({
    name: 'ComponentFactory',
    runtime: core_1.ComponentFactory,
    moduleUrl: util_1.assetUrl('core', 'linker/component_factory')
});
var SourceModule = (function () {
    function SourceModule(moduleUrl, source) {
        this.moduleUrl = moduleUrl;
        this.source = source;
    }
    return SourceModule;
}());
exports.SourceModule = SourceModule;
var StyleSheetSourceWithImports = (function () {
    function StyleSheetSourceWithImports(source, importedUrls) {
        this.source = source;
        this.importedUrls = importedUrls;
    }
    return StyleSheetSourceWithImports;
}());
exports.StyleSheetSourceWithImports = StyleSheetSourceWithImports;
var NormalizedComponentWithViewDirectives = (function () {
    function NormalizedComponentWithViewDirectives(component, directives, pipes) {
        this.component = component;
        this.directives = directives;
        this.pipes = pipes;
    }
    return NormalizedComponentWithViewDirectives;
}());
exports.NormalizedComponentWithViewDirectives = NormalizedComponentWithViewDirectives;
var OfflineCompiler = (function () {
    function OfflineCompiler(_directiveNormalizer, _templateParser, _styleCompiler, _viewCompiler, _outputEmitter, _xhr) {
        this._directiveNormalizer = _directiveNormalizer;
        this._templateParser = _templateParser;
        this._styleCompiler = _styleCompiler;
        this._viewCompiler = _viewCompiler;
        this._outputEmitter = _outputEmitter;
        this._xhr = _xhr;
    }
    OfflineCompiler.prototype.normalizeDirectiveMetadata = function (directive) {
        return this._directiveNormalizer.normalizeDirective(directive);
    };
    OfflineCompiler.prototype.compileTemplates = function (components) {
        var _this = this;
        if (components.length === 0) {
            throw new exceptions_1.BaseException('No components given');
        }
        var statements = [];
        var exportedVars = [];
        var moduleUrl = _ngfactoryModuleUrl(components[0].component.type);
        components.forEach(function (componentWithDirs) {
            var compMeta = componentWithDirs.component;
            _assertComponent(compMeta);
            var compViewFactoryVar = _this._compileComponent(compMeta, componentWithDirs.directives, componentWithDirs.pipes, statements);
            exportedVars.push(compViewFactoryVar);
            var hostMeta = compile_metadata_1.createHostComponentMeta(compMeta.type, compMeta.selector);
            var hostViewFactoryVar = _this._compileComponent(hostMeta, [compMeta], [], statements);
            var compFactoryVar = _componentFactoryName(compMeta.type);
            statements.push(o.variable(compFactoryVar)
                .set(o.importExpr(_COMPONENT_FACTORY_IDENTIFIER, [o.importType(compMeta.type)])
                .instantiate([
                o.literal(compMeta.selector), o.variable(hostViewFactoryVar),
                o.importExpr(compMeta.type)
            ], o.importType(_COMPONENT_FACTORY_IDENTIFIER, [o.importType(compMeta.type)], [o.TypeModifier.Const])))
                .toDeclStmt(null, [o.StmtModifier.Final]));
            exportedVars.push(compFactoryVar);
        });
        return this._codegenSourceModule(moduleUrl, statements, exportedVars);
    };
    OfflineCompiler.prototype.loadAndCompileStylesheet = function (stylesheetUrl, shim, suffix) {
        var _this = this;
        return this._xhr.get(stylesheetUrl).then(function (cssText) {
            var compileResult = _this._styleCompiler.compileStylesheet(stylesheetUrl, cssText, shim);
            var importedUrls = [];
            compileResult.dependencies.forEach(function (dep) {
                importedUrls.push(dep.moduleUrl);
                dep.valuePlaceholder.moduleUrl = _stylesModuleUrl(dep.moduleUrl, dep.isShimmed, suffix);
            });
            return new StyleSheetSourceWithImports(_this._codgenStyles(stylesheetUrl, shim, suffix, compileResult), importedUrls);
        });
    };
    OfflineCompiler.prototype._compileComponent = function (compMeta, directives, pipes, targetStatements) {
        var styleResult = this._styleCompiler.compileComponent(compMeta);
        var parsedTemplate = this._templateParser.parse(compMeta, compMeta.template.template, directives, pipes, compMeta.type.name);
        var viewResult = this._viewCompiler.compileComponent(compMeta, parsedTemplate, o.variable(styleResult.stylesVar), pipes);
        collection_1.ListWrapper.addAll(targetStatements, _resolveStyleStatements(compMeta.type.moduleUrl, styleResult));
        collection_1.ListWrapper.addAll(targetStatements, _resolveViewStatements(viewResult));
        return viewResult.viewFactoryVar;
    };
    OfflineCompiler.prototype._codgenStyles = function (inputUrl, shim, suffix, stylesCompileResult) {
        return this._codegenSourceModule(_stylesModuleUrl(inputUrl, shim, suffix), stylesCompileResult.statements, [stylesCompileResult.stylesVar]);
    };
    OfflineCompiler.prototype._codegenSourceModule = function (moduleUrl, statements, exportedVars) {
        return new SourceModule(moduleUrl, this._outputEmitter.emitStatements(moduleUrl, statements, exportedVars));
    };
    return OfflineCompiler;
}());
exports.OfflineCompiler = OfflineCompiler;
function _resolveViewStatements(compileResult) {
    compileResult.dependencies.forEach(function (dep) {
        if (dep instanceof view_compiler_1.ViewFactoryDependency) {
            dep.placeholder.moduleUrl = _ngfactoryModuleUrl(dep.comp.type);
        }
        else if (dep instanceof view_compiler_1.ComponentFactoryDependency) {
            dep.placeholder.name = _componentFactoryName(dep.comp);
            dep.placeholder.moduleUrl = _ngfactoryModuleUrl(dep.comp);
        }
    });
    return compileResult.statements;
}
function _resolveStyleStatements(containingModuleUrl, compileResult) {
    var containingSuffix = _splitSuffix(containingModuleUrl)[1];
    compileResult.dependencies.forEach(function (dep) {
        dep.valuePlaceholder.moduleUrl =
            _stylesModuleUrl(dep.moduleUrl, dep.isShimmed, containingSuffix);
    });
    return compileResult.statements;
}
function _ngfactoryModuleUrl(comp) {
    var urlWithSuffix = _splitSuffix(comp.moduleUrl);
    return urlWithSuffix[0] + ".ngfactory" + urlWithSuffix[1];
}
function _componentFactoryName(comp) {
    return comp.name + "NgFactory";
}
function _stylesModuleUrl(stylesheetUrl, shim, suffix) {
    return shim ? stylesheetUrl + ".shim" + suffix : "" + stylesheetUrl + suffix;
}
function _assertComponent(meta) {
    if (!meta.isComponent) {
        throw new exceptions_1.BaseException("Could not compile '" + meta.type.name + "' because it is not a component.");
    }
}
function _splitSuffix(path) {
    var lastDot = path.lastIndexOf('.');
    if (lastDot !== -1) {
        return [path.substring(0, lastDot), path.substring(lastDot)];
    }
    else {
        return [path, ''];
    }
}
//# sourceMappingURL=offline_compiler.js.map