/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { ComponentFactory, ComponentResolver } from '@angular/core';
import { Type } from '../src/facade/lang';
import { StyleCompiler } from './style_compiler';
import { ViewCompiler } from './view_compiler/view_compiler';
import { TemplateParser } from './template_parser';
import { DirectiveNormalizer } from './directive_normalizer';
import { CompileMetadataResolver } from './metadata_resolver';
import { CompilerConfig } from './config';
import { XHR } from './xhr';
/**
 * An internal module of the Angular compiler that begins with component types,
 * extracts templates, and eventually produces a compiled version of the component
 * ready for linking into an application.
 */
export declare class RuntimeCompiler implements ComponentResolver {
    private _metadataResolver;
    private _templateNormalizer;
    private _templateParser;
    private _styleCompiler;
    private _viewCompiler;
    private _xhr;
    private _genConfig;
    private _styleCache;
    private _hostCacheKeys;
    private _compiledTemplateCache;
    constructor(_metadataResolver: CompileMetadataResolver, _templateNormalizer: DirectiveNormalizer, _templateParser: TemplateParser, _styleCompiler: StyleCompiler, _viewCompiler: ViewCompiler, _xhr: XHR, _genConfig: CompilerConfig);
    resolveComponent(component: Type | string): Promise<ComponentFactory<any>>;
    clearCache(): void;
    private _loadAndCompileHostComponent(componentType);
    private _loadAndCompileComponent(cacheKey, compMeta, viewDirectives, pipes, compilingComponentsPath);
    private _compileComponent(compMeta, parsedTemplate, styles, pipes, compilingComponentsPath, childPromises);
    private _compileComponentStyles(compMeta);
    private _resolveStylesCompileResult(sourceUrl, result);
    private _loadStylesheetDep(dep);
}
