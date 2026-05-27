export type ExistingDataCounts = {
  classes: number;
  lessons: number;
  paymentConfirmations: number;
};

export function hasExistingUserData(counts: ExistingDataCounts) {
  return counts.classes > 0 || counts.lessons > 0 || counts.paymentConfirmations > 0;
}
