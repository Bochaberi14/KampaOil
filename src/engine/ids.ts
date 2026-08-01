let counter = 0;

function next(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export const generateLoadId = () => next('LOAD');
export const generateMovementId = () => next('MOV');
export const generatePickTaskId = () => next('PICK');
export const generateManifestId = () => next('MANIFEST');
export const generateHoldId = () => next('HOLD');
export const generateRecallCaseId = () => next('RECALL');
export const generateApprovalId = () => next('APPROVAL');
export const generateDriverConfirmationId = () => next('DRVCONF');
export const generateSyncTaskId = () => next('SYNC');

export const generateBatchId = (productionOrderId: string) =>
  `BATCH-${productionOrderId}`;
