import { resourceControlId, Stack, StackStatus } from "../../../portainer";

export interface StackAssociatePayload {
  endpointId: number;
  swarmId: string;
  orphanedRunning: boolean;
  userName: string;
}

export interface StackAssociateResult {
  stack: Stack;
  resourceControlResourceID?: string;
}

function sanitizeGitPassword(stack: Stack): void {
  if (stack.GitConfig?.Authentication?.Password) {
    stack.GitConfig.Authentication.Password = "";
  }
}

export function associateStack(stack: Stack, payload: StackAssociatePayload): StackAssociateResult {
  const updatedStack: Stack = {
    ...stack,
    EndpointID: payload.endpointId,
    SwarmID: payload.swarmId,
    Status: payload.orphanedRunning ? StackStatus.Active : StackStatus.Inactive,
    CreationDate: Math.floor(Date.now() / 1000),
    CreatedBy: payload.userName,
    UpdateDate: 0,
    UpdatedBy: "",
    ResourceControl: stack.ResourceControl ? { ...stack.ResourceControl, ResourceID: resourceControlId(payload.endpointId, stack.Name) } : stack.ResourceControl,
    GitConfig: stack.GitConfig ? { ...stack.GitConfig } : stack.GitConfig,
  };

  sanitizeGitPassword(updatedStack);

  return {
    stack: updatedStack,
    resourceControlResourceID: updatedStack.ResourceControl?.ResourceID,
  };
}
