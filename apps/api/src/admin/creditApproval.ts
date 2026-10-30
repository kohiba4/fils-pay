import { ConflictError } from "../lib/errors.js";

/** An operator on one side of a credit's two-person control. */
export interface CreditActor {
  adminUserId: string;
  displayName: string;
}

/** Two-person control: the operator who approves a credit must not be the one who requested it. */
export function assertDistinctApprover(requester: CreditActor, approver: CreditActor): void {
  // AUD-039: identity is the admin_users id. display_name is not unique and
  // can change, so comparing names refused two colleagues who share a name
  // and let a requester who was renamed approve their own credit.
  if (approver.adminUserId === requester.adminUserId) {
    throw new ConflictError("self_approval_forbidden");
  }
}
