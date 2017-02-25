/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { ViewEncapsulation, ɵViewType as ViewType } from '@angular/core';
import * as o from '../output/output_ast';
export declare class ViewTypeEnum {
    static fromValue(value: ViewType): o.Expression;
}
export declare class ViewEncapsulationEnum {
    static fromValue(value: ViewEncapsulation): o.Expression;
}
export declare class ChangeDetectorStatusEnum {
    static fromValue(value: ChangeDetectorStatusEnum): o.Expression;
}
export declare class ViewConstructorVars {
    static viewUtils: o.ReadVarExpr;
    static parentView: o.ReadVarExpr;
    static parentIndex: o.ReadVarExpr;
    static parentElement: o.ReadVarExpr;
}
export declare class ViewProperties {
    static renderer: o.ReadPropExpr;
    static viewUtils: o.ReadPropExpr;
    static throwOnChange: o.ReadPropExpr;
}
export declare class InjectMethodVars {
    static token: o.ReadVarExpr;
    static requestNodeIndex: o.ReadVarExpr;
    static notFoundResult: o.ReadVarExpr;
}
