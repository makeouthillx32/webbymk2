/**
 * Peptide Compliance Rules
 * 
 * Required Documents:
 * - Lab Report (COA)
 * - HPLC Purity Analysis
 * - Mass Spectrometry Verification
 * 
 * Hard Rules:
 * - Purity must be within ±5% of declared
 * - No medical claims allowed
 * - Research use disclaimer required
 * - Must not be on DEA controlled list
 * - Sequence verification required
 */

import { ComplianceRule } from '../types/rule-schema';
import { ProductCategory, ComplianceStatus, RuleSeverity, RuleStatus, Jurisdiction } from '../types/categories';

const now = new Date().toISOString();

export const PEPTIDE_RULES: ComplianceRule[] = [
  // ============================================
  // DOCUMENT REQUIREMENTS
  // ============================================
  {
    ruleId: 'PEPTIDE_COA_REQUIRED',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.BLOCKER,
    status: RuleStatus.ACTIVE,
    description: 'Peptides require a Certificate of Analysis (COA)',
    when: { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
    condition: { '!': { 'var': 'documents.hasCOA' } },
    failure: {
      status: ComplianceStatus.REQUIRES_REVIEW,
      reasonCode: 'MISSING_COA',
      message: 'Certificate of Analysis (COA) is required for peptide products',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'Research Chemical Standards',
      appliesAt: 'BATCH_LEVEL',
    },
    createdAt: now,
    createdBy: 'system',
  },
  {
    ruleId: 'PEPTIDE_HPLC_REQUIRED',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.BLOCKER,
    status: RuleStatus.ACTIVE,
    description: 'Peptides require HPLC purity analysis',
    when: { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
    condition: { '!': { 'var': 'documents.hasHplcAnalysis' } },
    failure: {
      status: ComplianceStatus.REQUIRES_REVIEW,
      reasonCode: 'MISSING_HPLC_ANALYSIS',
      message: 'HPLC purity analysis is required to verify peptide purity',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'Research Chemical Standards',
      appliesAt: 'BATCH_LEVEL',
    },
    createdAt: now,
    createdBy: 'system',
  },
  {
    ruleId: 'PEPTIDE_MASS_SPEC_REQUIRED',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.BLOCKER,
    status: RuleStatus.ACTIVE,
    description: 'Peptides require mass spectrometry verification',
    when: { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
    condition: { '!': { 'var': 'documents.hasMassSpec' } },
    failure: {
      status: ComplianceStatus.REQUIRES_REVIEW,
      reasonCode: 'MISSING_MASS_SPEC',
      message: 'Mass spectrometry verification is required to confirm peptide identity',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'Research Chemical Standards',
      appliesAt: 'BATCH_LEVEL',
    },
    createdAt: now,
    createdBy: 'system',
  },

  // ============================================
  // PURITY REQUIREMENTS
  // ============================================
  {
    ruleId: 'PEPTIDE_PURITY_VARIANCE',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.BLOCKER,
    status: RuleStatus.ACTIVE,
    description: 'Peptide purity must be within ±5% of declared purity',
    when: {
      'and': [
        { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
        { '!=': [{ 'var': 'lab.purityPercent' }, null] },
        { '!=': [{ 'var': 'product.declaredPurity' }, null] },
      ],
    },
    condition: {
      '>': [
        {
          'abs': {
            '-': [
              { '/': [{ 'var': 'lab.purityPercent' }, { 'var': 'product.declaredPurity' }] },
              1,
            ],
          },
        },
        0.05, // 5% variance
      ],
    },
    failure: {
      status: ComplianceStatus.NON_COMPLIANT,
      reasonCode: 'PURITY_VARIANCE_EXCEEDS_LIMIT',
      message: 'Peptide purity differs from declared value by more than ±5%',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'Research Chemical Standards',
      appliesAt: 'BATCH_LEVEL',
    },
    createdAt: now,
    createdBy: 'system',
  },
  {
    ruleId: 'PEPTIDE_MINIMUM_PURITY',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.BLOCKER,
    status: RuleStatus.ACTIVE,
    description: 'Peptide purity must meet minimum 95% threshold',
    when: {
      'and': [
        { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
        { '!=': [{ 'var': 'lab.purityPercent' }, null] },
      ],
    },
    condition: {
      '<': [{ 'var': 'lab.purityPercent' }, 95],
    },
    failure: {
      status: ComplianceStatus.NON_COMPLIANT,
      reasonCode: 'PURITY_BELOW_MINIMUM',
      message: 'Peptide purity is below 95% minimum threshold for research-grade material',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'Research Chemical Standards',
      appliesAt: 'BATCH_LEVEL',
    },
    createdAt: now,
    createdBy: 'system',
  },
  {
    ruleId: 'PEPTIDE_PURITY_MISSING',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.BLOCKER,
    status: RuleStatus.ACTIVE,
    description: 'Purity percentage must be present on lab report',
    when: { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
    condition: { '==': [{ 'var': 'lab.purityPercent' }, null] },
    failure: {
      status: ComplianceStatus.REQUIRES_REVIEW,
      reasonCode: 'PURITY_MISSING',
      message: 'Purity percentage is missing from lab report',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'Research Chemical Standards',
      appliesAt: 'BATCH_LEVEL',
    },
    createdAt: now,
    createdBy: 'system',
  },

  // ============================================
  // SEQUENCE VERIFICATION
  // ============================================
  {
    ruleId: 'PEPTIDE_SEQUENCE_MATCH',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.BLOCKER,
    status: RuleStatus.ACTIVE,
    description: 'Peptide sequence on lab report must match declared sequence',
    when: {
      'and': [
        { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
        { '!!': { 'var': 'lab.sequence' } },
        { '!!': { 'var': 'product.declaredSequence' } },
      ],
    },
    condition: {
      '!=': [{ 'var': 'lab.sequence' }, { 'var': 'product.declaredSequence' }],
    },
    failure: {
      status: ComplianceStatus.NON_COMPLIANT,
      reasonCode: 'SEQUENCE_MISMATCH',
      message: 'Lab-verified peptide sequence does not match declared product sequence',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'Research Chemical Standards',
      appliesAt: 'BATCH_LEVEL',
    },
    createdAt: now,
    createdBy: 'system',
  },
  {
    ruleId: 'PEPTIDE_MOLECULAR_WEIGHT_VERIFICATION',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.BLOCKER,
    status: RuleStatus.ACTIVE,
    description: 'Mass spec molecular weight must match expected weight for sequence',
    when: {
      'and': [
        { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
        { '!=': [{ 'var': 'lab.molecularWeight' }, null] },
        { '!=': [{ 'var': 'product.expectedMolecularWeight' }, null] },
      ],
    },
    condition: {
      '>': [
        {
          'abs': {
            '-': [{ 'var': 'lab.molecularWeight' }, { 'var': 'product.expectedMolecularWeight' }],
          },
        },
        1, // 1 Da tolerance
      ],
    },
    failure: {
      status: ComplianceStatus.NON_COMPLIANT,
      reasonCode: 'MOLECULAR_WEIGHT_MISMATCH',
      message: 'Mass spectrometry molecular weight does not match expected value for peptide sequence',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'Research Chemical Standards',
      appliesAt: 'BATCH_LEVEL',
    },
    createdAt: now,
    createdBy: 'system',
  },

  // ============================================
  // LABELING & CLAIMS REQUIREMENTS
  // ============================================
  {
    ruleId: 'PEPTIDE_NO_MEDICAL_CLAIMS',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.BLOCKER,
    status: RuleStatus.ACTIVE,
    description: 'Peptide products cannot make medical claims',
    when: { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
    condition: { '==': [{ 'var': 'product.hasMedicalClaims' }, true] },
    failure: {
      status: ComplianceStatus.NON_COMPLIANT,
      reasonCode: 'ILLEGAL_MEDICAL_CLAIMS',
      message: 'Product makes medical claims which are not allowed for research peptides',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'FDA FD&C Act',
      appliesAt: 'BATCH_LEVEL',
      notes: 'Research peptides cannot claim to diagnose, treat, cure, or prevent any disease',
    },
    createdAt: now,
    createdBy: 'system',
  },
  {
    ruleId: 'PEPTIDE_RESEARCH_DISCLAIMER_REQUIRED',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.BLOCKER,
    status: RuleStatus.ACTIVE,
    description: 'Research use only disclaimer is required',
    when: { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
    condition: { '!=': [{ 'var': 'product.hasResearchDisclaimer' }, true] },
    failure: {
      status: ComplianceStatus.NON_COMPLIANT,
      reasonCode: 'MISSING_RESEARCH_DISCLAIMER',
      message: 'Product must include "For Research Use Only - Not for Human Consumption" disclaimer',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'FDA FD&C Act / Research Chemical Standards',
      appliesAt: 'BATCH_LEVEL',
    },
    createdAt: now,
    createdBy: 'system',
  },
  {
    ruleId: 'PEPTIDE_NO_HUMAN_CONSUMPTION_CLAIMS',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.BLOCKER,
    status: RuleStatus.ACTIVE,
    description: 'Product cannot be marketed for human consumption',
    when: { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
    condition: { '==': [{ 'var': 'product.marketedForHumanUse' }, true] },
    failure: {
      status: ComplianceStatus.NON_COMPLIANT,
      reasonCode: 'ILLEGAL_HUMAN_USE_MARKETING',
      message: 'Research peptides cannot be marketed for human consumption',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'FDA FD&C Act',
      appliesAt: 'BATCH_LEVEL',
    },
    createdAt: now,
    createdBy: 'system',
  },

  // ============================================
  // CONTROLLED SUBSTANCE CHECKS
  // ============================================
  {
    ruleId: 'PEPTIDE_NOT_DEA_CONTROLLED',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.BLOCKER,
    status: RuleStatus.ACTIVE,
    description: 'Peptide must not be on DEA controlled substances list',
    when: { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
    condition: { '==': [{ 'var': 'product.isDeaControlled' }, true] },
    failure: {
      status: ComplianceStatus.NON_COMPLIANT,
      reasonCode: 'DEA_CONTROLLED_SUBSTANCE',
      message: 'This peptide is a DEA controlled substance and requires special licensing',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'DEA Controlled Substances Act',
      appliesAt: 'BATCH_LEVEL',
    },
    createdAt: now,
    createdBy: 'system',
  },
  {
    ruleId: 'PEPTIDE_NOT_FDA_BANNED',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.BLOCKER,
    status: RuleStatus.ACTIVE,
    description: 'Peptide must not be on FDA banned list',
    when: { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
    condition: { '==': [{ 'var': 'product.isFdaBanned' }, true] },
    failure: {
      status: ComplianceStatus.NON_COMPLIANT,
      reasonCode: 'FDA_BANNED_PEPTIDE',
      message: 'This peptide has been banned by the FDA and cannot be sold',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'FDA Banned Substances List',
      appliesAt: 'BATCH_LEVEL',
    },
    createdAt: now,
    createdBy: 'system',
  },

  // ============================================
  // BATCH & TRACEABILITY
  // ============================================
  {
    ruleId: 'PEPTIDE_COA_BATCH_MATCH',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.BLOCKER,
    status: RuleStatus.ACTIVE,
    description: 'Lab report batch ID must match the product batch',
    when: {
      'and': [
        { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
        { '!!': { 'var': 'lab.batchIdOnReport' } },
      ],
    },
    condition: {
      '!=': [{ 'var': 'lab.batchIdOnReport' }, { 'var': 'batch.batchNumber' }],
    },
    failure: {
      status: ComplianceStatus.NON_COMPLIANT,
      reasonCode: 'BATCH_ID_MISMATCH',
      message: 'Lab report batch ID does not match the product batch number',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'Research Chemical Standards',
      appliesAt: 'BATCH_LEVEL',
    },
    createdAt: now,
    createdBy: 'system',
  },

  // ============================================
  // STERILITY & SAFETY
  // ============================================
  {
    ruleId: 'PEPTIDE_STERILITY_IF_LYOPHILIZED',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.BLOCKER,
    status: RuleStatus.ACTIVE,
    description: 'Lyophilized peptides should be sterile filtered before freeze-drying',
    when: {
      'and': [
        { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
        { '==': [{ 'var': 'product.isLyophilized' }, true] },
      ],
    },
    condition: { '!=': [{ 'var': 'lab.sterileFiltered' }, true] },
    failure: {
      status: ComplianceStatus.REQUIRES_REVIEW,
      reasonCode: 'NOT_STERILE_FILTERED',
      message: 'Lyophilized peptide was not sterile filtered. This may affect research applications.',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'Research Chemical Standards',
      appliesAt: 'BATCH_LEVEL',
    },
    createdAt: now,
    createdBy: 'system',
  },
  {
    ruleId: 'PEPTIDE_ENDOTOXIN_LEVELS',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.WARNING,
    status: RuleStatus.ACTIVE,
    description: 'Endotoxin levels should be tested and below safe limits',
    when: { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
    condition: { '==': [{ 'var': 'lab.endotoxinExceedsLimit' }, true] },
    failure: {
      status: ComplianceStatus.REQUIRES_REVIEW,
      reasonCode: 'ENDOTOXIN_HIGH',
      message: 'Endotoxin levels exceed recommended limits for research applications',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'Research Chemical Standards',
      appliesAt: 'BATCH_LEVEL',
    },
    createdAt: now,
    createdBy: 'system',
  },

  // ============================================
  // STORAGE & STABILITY
  // ============================================
  {
    ruleId: 'PEPTIDE_STORAGE_CONDITIONS_SPECIFIED',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.WARNING,
    status: RuleStatus.ACTIVE,
    description: 'Storage conditions should be specified on product',
    when: { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
    condition: { '!': { 'var': 'product.storageConditions' } },
    failure: {
      status: ComplianceStatus.REQUIRES_REVIEW,
      reasonCode: 'MISSING_STORAGE_CONDITIONS',
      message: 'Storage conditions should be specified (typically -20°C or below for peptides)',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'Research Chemical Standards',
      appliesAt: 'BATCH_LEVEL',
    },
    createdAt: now,
    createdBy: 'system',
  },
  {
    ruleId: 'PEPTIDE_COA_AGE_6_MONTHS',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.WARNING,
    status: RuleStatus.ACTIVE,
    description: 'Lab report should be issued within the last 6 months',
    when: {
      'and': [
        { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
        { '!!': { 'var': 'documents.coaIssuedAt' } },
      ],
    },
    condition: {
      '>': [
        { '-': [{ 'var': 'evaluatedAt' }, { 'var': 'documents.coaIssuedAt' }] },
        15778800000, // 6 months in milliseconds
      ],
    },
    failure: {
      status: ComplianceStatus.REQUIRES_REVIEW,
      reasonCode: 'COA_AGING',
      message: 'Lab report is older than 6 months. Consider retesting for current purity.',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'Research Chemical Standards',
      appliesAt: 'BATCH_LEVEL',
    },
    createdAt: now,
    createdBy: 'system',
  },

  // ============================================
  // CONTAMINANTS
  // ============================================
  {
    ruleId: 'PEPTIDE_TFA_CONTENT',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.WARNING,
    status: RuleStatus.ACTIVE,
    description: 'TFA (trifluoroacetic acid) content should be minimized',
    when: {
      'and': [
        { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
        { '!=': [{ 'var': 'lab.tfaContentPercent' }, null] },
      ],
    },
    condition: {
      '>': [{ 'var': 'lab.tfaContentPercent' }, 5], // More than 5% TFA is high
    },
    failure: {
      status: ComplianceStatus.REQUIRES_REVIEW,
      reasonCode: 'HIGH_TFA_CONTENT',
      message: 'TFA content is higher than typical (>5%). Consider TFA removal for sensitive applications.',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'Research Chemical Standards',
      appliesAt: 'BATCH_LEVEL',
    },
    createdAt: now,
    createdBy: 'system',
  },
  {
    ruleId: 'PEPTIDE_CONTAMINANTS_DETECTED',
    version: 1,
    category: ProductCategory.PEPTIDE,
    severity: RuleSeverity.BLOCKER,
    status: RuleStatus.ACTIVE,
    description: 'No unexpected contaminants should be detected',
    when: {
      'and': [
        { '==': [{ 'var': 'product.category' }, 'PEPTIDE'] },
        { '!!': { 'var': 'lab.contaminantsDetected' } },
      ],
    },
    condition: {
      '>': [{ 'var': 'lab.contaminantsDetected.length' }, 0],
    },
    failure: {
      status: ComplianceStatus.NON_COMPLIANT,
      reasonCode: 'CONTAMINANTS_DETECTED',
      message: 'Unexpected contaminants were detected in lab testing',
    },
    metadata: {
      jurisdiction: Jurisdiction.US_FEDERAL,
      source: 'Research Chemical Standards',
      appliesAt: 'BATCH_LEVEL',
    },
    createdAt: now,
    createdBy: 'system',
  },
];

export default PEPTIDE_RULES;
