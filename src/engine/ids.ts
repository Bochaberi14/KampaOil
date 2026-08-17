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
export const generateSyncTaskId = () => next('SYNC');
export const generateAllocationId = () => next('ALLOC');
export const generateReturnId = () => next('RETURN');
export const generateReleaseId = () => next('RELEASE');
export const generateVerificationId = () => next('VERIFY');
export const generateTruckId = () => next('TRK');
export const generateVehicleBarcodeId = () => next('VEH');

export const generateBatchId = (productionOrderId: string) =>
  `BATCH-${productionOrderId}`;
