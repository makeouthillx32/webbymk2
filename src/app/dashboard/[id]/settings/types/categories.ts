// Shared enums for the product compliance rule engine.
// ProductCategory should line up with however a product is classified
// (currently just used by the peptide rule set — extend as other verticals
// get their own compliance rules, e.g. SARMs, supplements).

export enum ProductCategory {
  PEPTIDE = "PEPTIDE",
  SARM = "SARM",
  SUPPLEMENT = "SUPPLEMENT",
  RESEARCH_CHEMICAL = "RESEARCH_CHEMICAL",
  OTHER = "OTHER",
}

export enum ComplianceStatus {
  COMPLIANT = "COMPLIANT",
  REQUIRES_REVIEW = "REQUIRES_REVIEW",
  NON_COMPLIANT = "NON_COMPLIANT",
}

export enum RuleSeverity {
  BLOCKER = "BLOCKER",
  WARNING = "WARNING",
  INFO = "INFO",
}

export enum RuleStatus {
  ACTIVE = "ACTIVE",
  DRAFT = "DRAFT",
  DISABLED = "DISABLED",
}

export enum Jurisdiction {
  US_FEDERAL = "US_FEDERAL",
  US_STATE = "US_STATE",
  EU = "EU",
  INTERNATIONAL = "INTERNATIONAL",
}
