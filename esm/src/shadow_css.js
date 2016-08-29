/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { StringWrapper, isBlank, isPresent } from './facade/lang';
/**
 * This file is a port of shadowCSS from webcomponents.js to TypeScript.
 *
 * Please make sure to keep to edits in sync with the source file.
 *
 * Source:
 * https://github.com/webcomponents/webcomponentsjs/blob/4efecd7e0e/src/ShadowCSS/ShadowCSS.js
 *
 * The original file level comment is reproduced below
 */
/*
  This is a limited shim for ShadowDOM css styling.
  https://dvcs.w3.org/hg/webcomponents/raw-file/tip/spec/shadow/index.html#styles

  The intention here is to support only the styling features which can be
  relatively simply implemented. The goal is to allow users to avoid the
  most obvious pitfalls and do so without compromising performance significantly.
  For ShadowDOM styling that's not covered here, a set of best practices
  can be provided that should allow users to accomplish more complex styling.

  The following is a list of specific ShadowDOM styling features and a brief
  discussion of the approach used to shim.

  Shimmed features:

  * :host, :host-context: ShadowDOM allows styling of the shadowRoot's host
  element using the :host rule. To shim this feature, the :host styles are
  reformatted and prefixed with a given scope name and promoted to a
  document level stylesheet.
  For example, given a scope name of .foo, a rule like this:

    :host {
        background: red;
      }
    }

  becomes:

    .foo {
      background: red;
    }

  * encapsulation: Styles defined within ShadowDOM, apply only to
  dom inside the ShadowDOM. Polymer uses one of two techniques to implement
  this feature.

  By default, rules are prefixed with the host element tag name
  as a descendant selector. This ensures styling does not leak out of the 'top'
  of the element's ShadowDOM. For example,

  div {
      font-weight: bold;
    }

  becomes:

  x-foo div {
      font-weight: bold;
    }

  becomes:


  Alternatively, if WebComponents.ShadowCSS.strictStyling is set to true then
  selectors are scoped by adding an attribute selector suffix to each
  simple selector that contains the host element tag name. Each element
  in the element's ShadowDOM template is also given the scope attribute.
  Thus, these rules match only elements that have the scope attribute.
  For example, given a scope name of x-foo, a rule like this:

    div {
      font-weight: bold;
    }

  becomes:

    div[x-foo] {
      font-weight: bold;
    }

  Note that elements that are dynamically added to a scope must have the scope
  selector added to them manually.

  * upper/lower bound encapsulation: Styles which are defined outside a
  shadowRoot should not cross the ShadowDOM boundary and should not apply
  inside a shadowRoot.

  This styling behavior is not emulated. Some possible ways to do this that
  were rejected due to complexity and/or performance concerns include: (1) reset
  every possible property for every possible selector for a given scope name;
  (2) re-implement css in javascript.

  As an alternative, users should make sure to use selectors
  specific to the scope in which they are working.

  * ::distributed: This behavior is not emulated. It's often not necessary
  to style the contents of a specific insertion point and instead, descendants
  of the host element can be styled selectively. Users can also create an
  extra node around an insertion point and style that node's contents
  via descendent selectors. For example, with a shadowRoot like this:

    <style>
      ::content(div) {
        background: red;
      }
    </style>
    <content></content>

  could become:

    <style>
      / *@polyfill .content-container div * /
      ::content(div) {
        background: red;
      }
    </style>
    <div class="content-container">
      <content></content>
    </div>

  Note the use of @polyfill in the comment above a ShadowDOM specific style
  declaration. This is a directive to the styling shim to use the selector
  in comments in lieu of the next selector when running under polyfill.
*/
export class ShadowCss {
    constructor() {
        this.strictStyling = true;
    }
    /*
    * Shim some cssText with the given selector. Returns cssText that can
    * be included in the document via WebComponents.ShadowCSS.addCssToDocument(css).
    *
    * When strictStyling is true:
    * - selector is the attribute added to all elements inside the host,
    * - hostSelector is the attribute added to the host itself.
    */
    shimCssText(cssText, selector, hostSelector = '') {
        const sourceMappingUrl = extractSourceMappingUrl(cssText);
        cssText = stripComments(cssText);
        cssText = this._insertDirectives(cssText);
        return this._scopeCssText(cssText, selector, hostSelector) + sourceMappingUrl;
    }
    _insertDirectives(cssText) {
        cssText = this._insertPolyfillDirectivesInCssText(cssText);
        return this._insertPolyfillRulesInCssText(cssText);
    }
    /*
     * Process styles to convert native ShadowDOM rules that will trip
     * up the css parser; we rely on decorating the stylesheet with inert rules.
     *
     * For example, we convert this rule:
     *
     * polyfill-next-selector { content: ':host menu-item'; }
     * ::content menu-item {
     *
     * to this:
     *
     * scopeName menu-item {
     *
    **/
    _insertPolyfillDirectivesInCssText(cssText) {
        // Difference with webcomponents.js: does not handle comments
        return StringWrapper.replaceAllMapped(cssText, _cssContentNextSelectorRe, function (m /** TODO #9100 */) { return m[1] + '{'; });
    }
    /*
     * Process styles to add rules which will only apply under the polyfill
     *
     * For example, we convert this rule:
     *
     * polyfill-rule {
     *   content: ':host menu-item';
     * ...
     * }
     *
     * to this:
     *
     * scopeName menu-item {...}
     *
    **/
    _insertPolyfillRulesInCssText(cssText) {
        // Difference with webcomponents.js: does not handle comments
        return StringWrapper.replaceAllMapped(cssText, _cssContentRuleRe, function (m /** TODO #9100 */) {
            let rule = m[0];
            rule = StringWrapper.replace(rule, m[1], '');
            rule = StringWrapper.replace(rule, m[2], '');
            return m[3] + rule;
        });
    }
    /* Ensure styles are scoped. Pseudo-scoping takes a rule like:
     *
     *  .foo {... }
     *
     *  and converts this to
     *
     *  scopeName .foo { ... }
    */
    _scopeCssText(cssText, scopeSelector, hostSelector) {
        const unscoped = this._extractUnscopedRulesFromCssText(cssText);
        cssText = this._insertPolyfillHostInCssText(cssText);
        cssText = this._convertColonHost(cssText);
        cssText = this._convertColonHostContext(cssText);
        cssText = this._convertShadowDOMSelectors(cssText);
        if (isPresent(scopeSelector)) {
            cssText = this._scopeSelectors(cssText, scopeSelector, hostSelector);
        }
        cssText = cssText + '\n' + unscoped;
        return cssText.trim();
    }
    /*
     * Process styles to add rules which will only apply under the polyfill
     * and do not process via CSSOM. (CSSOM is destructive to rules on rare
     * occasions, e.g. -webkit-calc on Safari.)
     * For example, we convert this rule:
     *
     * @polyfill-unscoped-rule {
     *   content: 'menu-item';
     * ... }
     *
     * to this:
     *
     * menu-item {...}
     *
    **/
    _extractUnscopedRulesFromCssText(cssText) {
        // Difference with webcomponents.js: does not handle comments
        let r = '';
        let m;
        _cssContentUnscopedRuleRe.lastIndex = 0;
        while ((m = _cssContentUnscopedRuleRe.exec(cssText)) !== null) {
            let rule = m[0];
            rule = StringWrapper.replace(rule, m[2], '');
            rule = StringWrapper.replace(rule, m[1], m[3]);
            r += rule + '\n\n';
        }
        return r;
    }
    /*
     * convert a rule like :host(.foo) > .bar { }
     *
     * to
     *
     * scopeName.foo > .bar
    */
    _convertColonHost(cssText) {
        return this._convertColonRule(cssText, _cssColonHostRe, this._colonHostPartReplacer);
    }
    /*
     * convert a rule like :host-context(.foo) > .bar { }
     *
     * to
     *
     * scopeName.foo > .bar, .foo scopeName > .bar { }
     *
     * and
     *
     * :host-context(.foo:host) .bar { ... }
     *
     * to
     *
     * scopeName.foo .bar { ... }
    */
    _convertColonHostContext(cssText) {
        return this._convertColonRule(cssText, _cssColonHostContextRe, this._colonHostContextPartReplacer);
    }
    _convertColonRule(cssText, regExp, partReplacer) {
        // p1 = :host, p2 = contents of (), p3 rest of rule
        return StringWrapper.replaceAllMapped(cssText, regExp, function (m /** TODO #9100 */) {
            if (isPresent(m[2])) {
                const parts = m[2].split(','), r = [];
                for (let i = 0; i < parts.length; i++) {
                    let p = parts[i];
                    if (isBlank(p))
                        break;
                    p = p.trim();
                    r.push(partReplacer(_polyfillHostNoCombinator, p, m[3]));
                }
                return r.join(',');
            }
            else {
                return _polyfillHostNoCombinator + m[3];
            }
        });
    }
    _colonHostContextPartReplacer(host, part, suffix) {
        if (StringWrapper.contains(part, _polyfillHost)) {
            return this._colonHostPartReplacer(host, part, suffix);
        }
        else {
            return host + part + suffix + ', ' + part + ' ' + host + suffix;
        }
    }
    _colonHostPartReplacer(host, part, suffix) {
        return host + StringWrapper.replace(part, _polyfillHost, '') + suffix;
    }
    /*
     * Convert combinators like ::shadow and pseudo-elements like ::content
     * by replacing with space.
    */
    _convertShadowDOMSelectors(cssText) {
        return _shadowDOMSelectorsRe.reduce((result, pattern) => { return StringWrapper.replaceAll(result, pattern, ' '); }, cssText);
    }
    // change a selector like 'div' to 'name div'
    _scopeSelectors(cssText, scopeSelector, hostSelector) {
        return processRules(cssText, (rule) => {
            let selector = rule.selector;
            let content = rule.content;
            if (rule.selector[0] != '@' || rule.selector.startsWith('@page')) {
                selector =
                    this._scopeSelector(rule.selector, scopeSelector, hostSelector, this.strictStyling);
            }
            else if (rule.selector.startsWith('@media') || rule.selector.startsWith('@supports')) {
                content = this._scopeSelectors(rule.content, scopeSelector, hostSelector);
            }
            return new CssRule(selector, content);
        });
    }
    _scopeSelector(selector, scopeSelector, hostSelector, strict) {
        return selector.split(',')
            .map(part => part.trim().split(_shadowDeepSelectors))
            .map((deepParts) => {
            const [shallowPart, ...otherParts] = deepParts;
            const applyScope = (shallowPart) => {
                if (this._selectorNeedsScoping(shallowPart, scopeSelector)) {
                    return strict ?
                        this._applyStrictSelectorScope(shallowPart, scopeSelector, hostSelector) :
                        this._applySelectorScope(shallowPart, scopeSelector, hostSelector);
                }
                else {
                    return shallowPart;
                }
            };
            return [applyScope(shallowPart), ...otherParts].join(' ');
        })
            .join(', ');
    }
    _selectorNeedsScoping(selector, scopeSelector) {
        const re = this._makeScopeMatcher(scopeSelector);
        return !re.test(selector);
    }
    _makeScopeMatcher(scopeSelector) {
        const lre = /\[/g;
        const rre = /\]/g;
        scopeSelector = StringWrapper.replaceAll(scopeSelector, lre, '\\[');
        scopeSelector = StringWrapper.replaceAll(scopeSelector, rre, '\\]');
        return new RegExp('^(' + scopeSelector + ')' + _selectorReSuffix, 'm');
    }
    _applySelectorScope(selector, scopeSelector, hostSelector) {
        // Difference from webcomponents.js: scopeSelector could not be an array
        return this._applySimpleSelectorScope(selector, scopeSelector, hostSelector);
    }
    // scope via name and [is=name]
    _applySimpleSelectorScope(selector, scopeSelector, hostSelector) {
        // In Android browser, the lastIndex is not reset when the regex is used in String.replace()
        _polyfillHostRe.lastIndex = 0;
        if (_polyfillHostRe.test(selector)) {
            const replaceBy = this.strictStyling ? `[${hostSelector}]` : scopeSelector;
            selector = StringWrapper.replace(selector, _polyfillHostNoCombinator, replaceBy);
            return StringWrapper.replaceAll(selector, _polyfillHostRe, replaceBy + ' ');
        }
        else {
            return scopeSelector + ' ' + selector;
        }
    }
    // return a selector with [name] suffix on each simple selector
    // e.g. .foo.bar > .zot becomes .foo[name].bar[name] > .zot[name]  /** @internal */
    _applyStrictSelectorScope(selector, scopeSelector, hostSelector) {
        const isRe = /\[is=([^\]]*)\]/g;
        scopeSelector = scopeSelector.replace(isRe, (_, ...parts) => parts[0]);
        const attrName = '[' + scopeSelector + ']';
        const _scopeSelectorPart = (p) => {
            var scopedP = p.trim();
            if (scopedP.length == 0) {
                return '';
            }
            if (p.indexOf(_polyfillHostNoCombinator) > -1) {
                scopedP = this._applySimpleSelectorScope(p, scopeSelector, hostSelector);
            }
            else {
                // remove :host since it should be unnecessary
                var t = p.replace(_polyfillHostRe, '');
                if (t.length > 0) {
                    const matches = t.match(/([^:]*)(:*)(.*)/);
                    if (matches !== null) {
                        scopedP = matches[1] + attrName + matches[2] + matches[3];
                    }
                }
            }
            return scopedP;
        };
        const sep = /( |>|\+|~)\s*/g;
        const scopeAfter = selector.indexOf(_polyfillHostNoCombinator);
        let scoped = '';
        let startIndex = 0;
        let res;
        while ((res = sep.exec(selector)) !== null) {
            const separator = res[1];
            const part = selector.slice(startIndex, res.index).trim();
            // if a selector appears before :host-context it should not be shimmed as it
            // matches on ancestor elements and not on elements in the host's shadow
            const scopedPart = startIndex >= scopeAfter ? _scopeSelectorPart(part) : part;
            scoped += `${scopedPart} ${separator} `;
            startIndex = sep.lastIndex;
        }
        return scoped + _scopeSelectorPart(selector.substring(startIndex));
    }
    _insertPolyfillHostInCssText(selector) {
        return selector.replace(_colonHostContextRe, _polyfillHostContext)
            .replace(_colonHostRe, _polyfillHost);
    }
}
const _cssContentNextSelectorRe = /polyfill-next-selector[^}]*content:[\s]*?['"](.*?)['"][;\s]*}([^{]*?){/gim;
const _cssContentRuleRe = /(polyfill-rule)[^}]*(content:[\s]*['"](.*?)['"])[;\s]*[^}]*}/gim;
const _cssContentUnscopedRuleRe = /(polyfill-unscoped-rule)[^}]*(content:[\s]*['"](.*?)['"])[;\s]*[^}]*}/gim;
const _polyfillHost = '-shadowcsshost';
// note: :host-context pre-processed to -shadowcsshostcontext.
const _polyfillHostContext = '-shadowcsscontext';
const _parenSuffix = ')(?:\\((' +
    '(?:\\([^)(]*\\)|[^)(]*)+?' +
    ')\\))?([^,{]*)';
const _cssColonHostRe = new RegExp('(' + _polyfillHost + _parenSuffix, 'gim');
const _cssColonHostContextRe = new RegExp('(' + _polyfillHostContext + _parenSuffix, 'gim');
const _polyfillHostNoCombinator = _polyfillHost + '-no-combinator';
const _shadowDOMSelectorsRe = [
    /::shadow/g,
    /::content/g,
    // Deprecated selectors
    /\/shadow-deep\//g,
    /\/shadow\//g,
];
const _shadowDeepSelectors = /(?:>>>)|(?:\/deep\/)/g;
const _selectorReSuffix = '([>\\s~+\[.,{:][\\s\\S]*)?$';
const _polyfillHostRe = /-shadowcsshost/gim;
const _colonHostRe = /:host/gim;
const _colonHostContextRe = /:host-context/gim;
const _commentRe = /\/\*\s*[\s\S]*?\*\//g;
function stripComments(input) {
    return StringWrapper.replaceAllMapped(input, _commentRe, (_ /** TODO #9100 */) => '');
}
// all comments except inline source mapping ("/* #sourceMappingURL= ... */")
const _sourceMappingUrlRe = /[\s\S]*(\/\*\s*#\s*sourceMappingURL=[\s\S]+?\*\/)\s*$/;
function extractSourceMappingUrl(input) {
    const matcher = input.match(_sourceMappingUrlRe);
    return matcher ? matcher[1] : '';
}
const _ruleRe = /(\s*)([^;\{\}]+?)(\s*)((?:{%BLOCK%}?\s*;?)|(?:\s*;))/g;
const _curlyRe = /([{}])/g;
const OPEN_CURLY = '{';
const CLOSE_CURLY = '}';
const BLOCK_PLACEHOLDER = '%BLOCK%';
export class CssRule {
    constructor(selector, content) {
        this.selector = selector;
        this.content = content;
    }
}
export function processRules(input, ruleCallback) {
    const inputWithEscapedBlocks = escapeBlocks(input);
    let nextBlockIndex = 0;
    return StringWrapper.replaceAllMapped(inputWithEscapedBlocks.escapedString, _ruleRe, function (m /** TODO #9100 */) {
        const selector = m[2];
        let content = '';
        let suffix = m[4];
        let contentPrefix = '';
        if (isPresent(m[4]) && m[4].startsWith('{' + BLOCK_PLACEHOLDER)) {
            content = inputWithEscapedBlocks.blocks[nextBlockIndex++];
            suffix = m[4].substring(BLOCK_PLACEHOLDER.length + 1);
            contentPrefix = '{';
        }
        const rule = ruleCallback(new CssRule(selector, content));
        return `${m[1]}${rule.selector}${m[3]}${contentPrefix}${rule.content}${suffix}`;
    });
}
class StringWithEscapedBlocks {
    constructor(escapedString, blocks) {
        this.escapedString = escapedString;
        this.blocks = blocks;
    }
}
function escapeBlocks(input) {
    const inputParts = StringWrapper.split(input, _curlyRe);
    const resultParts = [];
    const escapedBlocks = [];
    let bracketCount = 0;
    let currentBlockParts = [];
    for (let partIndex = 0; partIndex < inputParts.length; partIndex++) {
        const part = inputParts[partIndex];
        if (part == CLOSE_CURLY) {
            bracketCount--;
        }
        if (bracketCount > 0) {
            currentBlockParts.push(part);
        }
        else {
            if (currentBlockParts.length > 0) {
                escapedBlocks.push(currentBlockParts.join(''));
                resultParts.push(BLOCK_PLACEHOLDER);
                currentBlockParts = [];
            }
            resultParts.push(part);
        }
        if (part == OPEN_CURLY) {
            bracketCount++;
        }
    }
    if (currentBlockParts.length > 0) {
        escapedBlocks.push(currentBlockParts.join(''));
        resultParts.push(BLOCK_PLACEHOLDER);
    }
    return new StringWithEscapedBlocks(resultParts.join(''), escapedBlocks);
}
//# sourceMappingURL=shadow_css.js.map