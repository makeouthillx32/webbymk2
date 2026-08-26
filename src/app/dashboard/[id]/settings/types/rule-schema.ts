// Schema for the product compliance rule engine (currently used by
// peptide.rules.ts, sibling to this folder's owner). Rules are evaluated
// against a "facts" object assembled from product + lab (COA) + document +
// batch data — see research_lab_reports / research_lab_report_results for
// where lab.* facts (purityPercent, sequence, molecularWeight, etc.) would
// be sourced from once this is wired up to an actual evaluator.
//
// `when` / `condition` are JSON-Logic expression trees (https://jsonlogic.com):
//   when      — the rule only applies if this evaluates truthy
//   condition — the rule FAILS (fires) if this evaluates truthy
// Kept as loosely-typed JSON rather than a fixed shape since JSON-Logic
// expressions are arbitrarily nested. Note: some rules use non-standard
// operators (e.g. "abs") that aren't part of stock json-logic-js — whichever
// evaluator consumes this will need `jsonLogic.add_operation("abs", Math.abs)`
// registered before evaluating those rules.

import type {
  ProductCategory,
  ComplianceStatus,
  RuleSeverity,
  RuleStatus,
  Jurisdiction,
} from "./categories";

export type JsonLogicExpression = any;

export interface ComplianceRuleFailure {
  status: ComplianceStatus;
  reasonCode: string;
  message: string;
}

export interface ComplianceRuleMetadata {
  jurisdiction: Jurisdiction;
  source: string;
  appliesAt: "BATCH_LEVEL" | "PRODUCT_LEVEL" | "VARIANT_LEVEL";
  notes?: string;
}

export interface ComplianceRule {
  ruleId: string;
  version: number;
  category: ProductCategory;
  severity: RuleSeverity;
  status: RuleStatus;
  description: string;
  when: JsonLogicExpression;
  condition: JsonLogicExpression;
  failure: ComplianceRuleFailure;
  metadata: ComplianceRuleMetadata;
  createdAt: string;
  createdBy: string;
}
