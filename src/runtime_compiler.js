/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
"use strict";
var core_1 = require('@angular/core');
var exceptions_1 = require('../src/facade/exceptions');
var lang_1 = require('../src/facade/lang');
var collection_1 = require('../src/facade/collection');
var async_1 = require('../src/facade/async');
var compile_metadata_1 = require('./compile_metadata');
var style_compiler_1 = require('./style_compiler');
var view_compiler_1 = require('./view_compiler/view_compiler');
var template_parser_1 = require('./template_parser');
var directive_normalizer_1 = require('./directive_normalizer');
var metadata_resolver_1 = require('./metadata_resolver');
var config_1 = require('./config');
var ir = require('./output/output_ast');
var output_jit_1 = require('./output/output_jit');
var output_interpreter_1 = require('./output/output_interpreter');
var interpretive_view_1 = require('./output/interpretive_view');
var xhr_1 = require('./xhr');
var RuntimeCompiler = (function () {
    function RuntimeCompiler(_metadataResolver, _templateNormalizer, _templateParser, _styleCompiler, _viewCompiler, _xhr, _genConfig) {
        this._metadataResolver = _metadataResolver;
        this._templateNormalizer = _templateNormalizer;
        this._templateParser = _templateParser;
        this._styleCompiler = _styleCompiler;
        this._viewCompiler = _viewCompiler;
        this._xhr = _xhr;
        this._genConfig = _genConfig;
        this._styleCache = new Map();
        this._hostCacheKeys = new Map();
        this._compiledTemplateCache = new Map();
    }
    RuntimeCompiler.prototype.resolveComponent = function (component) {
        if (lang_1.isString(component)) {
            return async_1.PromiseWrapper.reject(new exceptions_1.BaseException("Cannot resolve component using '" + component + "'."), null);
        }
        return this._loadAndCompileHostComponent(component).done;
    };
    RuntimeCompiler.prototype.clearCache = function () {
        this._styleCache.clear();
        this._compiledTemplateCache.clear();
        this._hostCacheKeys.clear();
    };
    RuntimeCompiler.prototype._loadAndCompileHostComponent = function (componentType) {
        var compMeta = this._metadataResolver.getDirectiveMetadata(componentType);
        var hostCacheKey = this._hostCacheKeys.get(compMeta.type.runtime);
        if (lang_1.isBlank(hostCacheKey)) {
            hostCacheKey = new Object();
            this._hostCacheKeys.set(compMeta.type.runtime, hostCacheKey);
            assertComponent(compMeta);
            var hostMeta = compile_metadata_1.createHostComponentMeta(compMeta.type, compMeta.selector);
            this._loadAndCompileComponent(hostCacheKey, hostMeta, [compMeta], [], []);
        }
        var compTemplate = this._compiledTemplateCache.get(hostCacheKey);
        return new CompileHostTemplate(compTemplate, compMeta);
    };
    RuntimeCompiler.prototype._loadAndCompileComponent = function (cacheKey, compMeta, viewDirectives, pipes, compilingComponentsPath) {
        var _this = this;
        var compiledTemplate = this._compiledTemplateCache.get(cacheKey);
        if (lang_1.isBlank(compiledTemplate)) {
            var done = async_1.PromiseWrapper
                .all([this._compileComponentStyles(compMeta)].concat(viewDirectives.map(function (dirMeta) { return _this._templateNormalizer.normalizeDirective(dirMeta); })))
                .then(function (stylesAndNormalizedViewDirMetas) {
                var normalizedViewDirMetas = stylesAndNormalizedViewDirMetas.slice(1);
                var styles = stylesAndNormalizedViewDirMetas[0];
                var parsedTemplate = _this._templateParser.parse(compMeta, compMeta.template.template, normalizedViewDirMetas, pipes, compMeta.type.name);
                var childPromises = [];
                compiledTemplate.init(_this._compileComponent(compMeta, parsedTemplate, styles, pipes, compilingComponentsPath, childPromises));
                return async_1.PromiseWrapper.all(childPromises).then(function (_) { return compiledTemplate; });
            });
            compiledTemplate = new CompiledTemplate(done);
            this._compiledTemplateCache.set(cacheKey, compiledTemplate);
        }
        return compiledTemplate;
    };
    RuntimeCompiler.prototype._compileComponent = function (compMeta, parsedTemplate, styles, pipes, compilingComponentsPath, childPromises) {
        var _this = this;
        var compileResult = this._viewCompiler.compileComponent(compMeta, parsedTemplate, new ir.ExternalExpr(new compile_metadata_1.CompileIdentifierMetadata({ runtime: styles })), pipes);
        compileResult.dependencies.forEach(function (dep) {
            if (dep instanceof view_compiler_1.ViewFactoryDependency) {
                var childCompilingComponentsPath_1 = collection_1.ListWrapper.clone(compilingComponentsPath);
                var childCacheKey = dep.comp.type.runtime;
                var childViewDirectives = _this._metadataResolver.getViewDirectivesMetadata(dep.comp.type.runtime);
                var childViewPipes = _this._metadataResolver.getViewPipesMetadata(dep.comp.type.runtime);
                var childIsRecursive = childCompilingComponentsPath_1.indexOf(childCacheKey) > -1 ||
                    childViewDirectives.some(function (dir) { return childCompilingComponentsPath_1.indexOf(dir.type.runtime) > -1; });
                childCompilingComponentsPath_1.push(childCacheKey);
                var childComp = _this._loadAndCompileComponent(dep.comp.type.runtime, dep.comp, childViewDirectives, childViewPipes, childCompilingComponentsPath_1);
                dep.placeholder.runtime = childComp.proxyViewFactory;
                dep.placeholder.name = "viewFactory_" + dep.comp.type.name;
                if (!childIsRecursive) {
                    // Only wait for a child if it is not a cycle
                    childPromises.push(childComp.done);
                }
            }
            else if (dep instanceof view_compiler_1.ComponentFactoryDependency) {
                var childComp = _this._loadAndCompileHostComponent(dep.comp.runtime);
                dep.placeholder.runtime = childComp.componentFactory;
                dep.placeholder.name = "compFactory_" + dep.comp.name;
                childPromises.push(childComp.done);
            }
        });
        var factory;
        if (lang_1.IS_DART || !this._genConfig.useJit) {
            factory = output_interpreter_1.interpretStatements(compileResult.statements, compileResult.viewFactoryVar, new interpretive_view_1.InterpretiveAppViewInstanceFactory());
        }
        else {
            factory = output_jit_1.jitStatements(compMeta.type.name + ".template.js", compileResult.statements, compileResult.viewFactoryVar);
        }
        return factory;
    };
    RuntimeCompiler.prototype._compileComponentStyles = function (compMeta) {
        var compileResult = this._styleCompiler.compileComponent(compMeta);
        return this._resolveStylesCompileResult(compMeta.type.name, compileResult);
    };
    RuntimeCompiler.prototype._resolveStylesCompileResult = function (sourceUrl, result) {
        var _this = this;
        var promises = result.dependencies.map(function (dep) { return _this._loadStylesheetDep(dep); });
        return async_1.PromiseWrapper.all(promises)
            .then(function (cssTexts) {
            var nestedCompileResultPromises = [];
            for (var i = 0; i < result.dependencies.length; i++) {
                var dep = result.dependencies[i];
                var cssText = cssTexts[i];
                var nestedCompileResult = _this._styleCompiler.compileStylesheet(dep.moduleUrl, cssText, dep.isShimmed);
                nestedCompileResultPromises.push(_this._resolveStylesCompileResult(dep.moduleUrl, nestedCompileResult));
            }
            return async_1.PromiseWrapper.all(nestedCompileResultPromises);
        })
            .then(function (nestedStylesArr) {
            for (var i = 0; i < result.dependencies.length; i++) {
                var dep = result.dependencies[i];
                dep.valuePlaceholder.runtime = nestedStylesArr[i];
                dep.valuePlaceholder.name = "importedStyles" + i;
            }
            if (lang_1.IS_DART || !_this._genConfig.useJit) {
                return output_interpreter_1.interpretStatements(result.statements, result.stylesVar, new interpretive_view_1.InterpretiveAppViewInstanceFactory());
            }
            else {
                return output_jit_1.jitStatements(sourceUrl + ".css.js", result.statements, result.stylesVar);
            }
        });
    };
    RuntimeCompiler.prototype._loadStylesheetDep = function (dep) {
        var cacheKey = "" + dep.moduleUrl + (dep.isShimmed ? '.shim' : '');
        var cssTextPromise = this._styleCache.get(cacheKey);
        if (lang_1.isBlank(cssTextPromise)) {
            cssTextPromise = this._xhr.get(dep.moduleUrl);
            this._styleCache.set(cacheKey, cssTextPromise);
        }
        return cssTextPromise;
    };
    /** @nocollapse */
    RuntimeCompiler.decorators = [
        { type: core_1.Injectable },
    ];
    /** @nocollapse */
    RuntimeCompiler.ctorParameters = [
        { type: metadata_resolver_1.CompileMetadataResolver, },
        { type: directive_normalizer_1.DirectiveNormalizer, },
        { type: template_parser_1.TemplateParser, },
        { type: style_compiler_1.StyleCompiler, },
        { type: view_compiler_1.ViewCompiler, },
        { type: xhr_1.XHR, },
        { type: config_1.CompilerConfig, },
    ];
    return RuntimeCompiler;
}());
exports.RuntimeCompiler = RuntimeCompiler;
var CompileHostTemplate = (function () {
    function CompileHostTemplate(_template, compMeta) {
        var _this = this;
        this.componentFactory = new core_1.ComponentFactory(compMeta.selector, _template.proxyViewFactory, compMeta.type.runtime);
        this.done = _template.done.then(function (_) { return _this.componentFactory; });
    }
    return CompileHostTemplate;
}());
var CompiledTemplate = (function () {
    function CompiledTemplate(done) {
        var _this = this;
        this.done = done;
        this._viewFactory = null;
        this.proxyViewFactory =
            function (viewUtils /** TODO #9100 */, childInjector /** TODO #9100 */, contextEl /** TODO #9100 */) {
                return _this._viewFactory(viewUtils, childInjector, contextEl);
            };
    }
    CompiledTemplate.prototype.init = function (viewFactory) { this._viewFactory = viewFactory; };
    return CompiledTemplate;
}());
function assertComponent(meta) {
    if (!meta.isComponent) {
        throw new exceptions_1.BaseException("Could not compile '" + meta.type.name + "' because it is not a component.");
    }
}
//# sourceMappingURL=runtime_compiler.js.map