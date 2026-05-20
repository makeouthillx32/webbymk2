import {
  Endpoint,
  EndpointType,
  resourceControlId,
  Stack,
  StackStatus,
  StackType,
} from "../../../portainer";

export interface StackMigratePayload {
  EndpointID: number;
  SwarmID: string;
  Name: string;
}

export interface StackMigrationContext {
  targetEndpoint: Endpoint;
  existingTargetStackNames?: string[];
  isNameUnique?: (name: string) => boolean;
}

export interface StackMigrationPlan {
  stack: Stack;
  targetEndpoint: Endpoint;
  transactional: false;
  action: "compose" | "swarm";
  resourceControlResourceIDBefore: string;
  resourceControlResourceIDAfter: string;
  steps: ["deploy-target", "delete-source"];
}

export function validateStackMigration(payload: StackMigratePayload): void {
  if (!payload.EndpointID || payload.EndpointID <= 0) {
    throw new Error("Invalid environment identifier. Must be a positive number");
  }
}

function isKubernetesStack(stack: Stack): boolean {
  return stack.Type === StackType.KubernetesStack;
}

function determineAction(stack: Stack): "compose" | "swarm" {
  return stack.Type === StackType.DockerSwarmStack ? "swarm" : "compose";
}

function nextStackName(stack: Stack, payload: StackMigratePayload): string {
  return payload.Name || stack.Name;
}

function isUniqueName(name: string, context: StackMigrationContext): boolean {
  if (context.isNameUnique) {
    return context.isNameUnique(name);
  }

  return !context.existingTargetStackNames?.includes(name);
}

export function planStackMigration(stack: Stack, payload: StackMigratePayload, context: StackMigrationContext): StackMigrationPlan {
  validateStackMigration(payload);

  if (isKubernetesStack(stack)) {
    throw new Error("Migrating a kubernetes stack is not supported");
  }

  const migratedName = nextStackName(stack, payload);
  if (!isUniqueName(migratedName, context)) {
    throw new Error(`A stack with the name '${migratedName}' is already running on endpoint '${context.targetEndpoint.Name}'`);
  }

  const resourceControlResourceIDBefore = resourceControlId(stack.EndpointID, stack.Name);
  const resourceControlResourceIDAfter = resourceControlId(payload.EndpointID, migratedName);

  const nextStack: Stack = {
    ...stack,
    EndpointID: payload.EndpointID,
    SwarmID: payload.SwarmID || stack.SwarmID,
    Name: migratedName,
    Status: StackStatus.Deploying,
  };

  return {
    stack: nextStack,
    targetEndpoint: context.targetEndpoint,
    transactional: false,
    action: determineAction(stack),
    resourceControlResourceIDBefore,
    resourceControlResourceIDAfter,
    steps: ["deploy-target", "delete-source"],
  };
}

export function applySuccessfulMigration(plan: StackMigrationPlan): Stack {
  return {
    ...plan.stack,
    Status: StackStatus.Active,
  };
}

export function migrationIsAllowedOnEndpoint(endpoint: Endpoint): boolean {
  return endpoint.Type !== EndpointType.AzureEnvironment && endpoint.Type !== EndpointType.KubernetesLocalEnvironment;
}
