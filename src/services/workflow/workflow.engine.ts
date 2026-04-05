/**
 * Workflow Engine
 * Core engine for creating, executing, and managing multi-step workflows.
 *
 * Workflows are composed of ordered steps, each executing a tool action.
 * The engine handles:
 * - Step sequencing with conditional execution
 * - Input resolution with $ref syntax for chaining step outputs
 * - Failure handling (skip, abort, retry)
 * - Real-time progress events via Socket.IO
 */

import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { executeTool } from '../chat/tools/index';
import { workflowQueue } from '../../jobs/queues';
import {
  emitWorkflowStarted,
  emitWorkflowStepStarted,
  emitWorkflowStepProgress,
  emitWorkflowStepCompleted,
  emitWorkflowStepFailed,
  emitWorkflowStepSkipped,
  emitWorkflowCompleted,
  emitWorkflowFailed,
  emitWorkflowCancelled,
} from '../../config/websocket';

const activeAbortControllers = new Map<string, AbortController>();

// ==================== TYPES ====================

/** Value is taken from `CreateWorkflowInput.runtimeParams` at execution (not `$ref`-chainable). */
export type WorkflowRuntimeParamRef = { $runtimeParam: string };

/** Reference to a previous step output (resolved at execution). */
export type WorkflowParamRef = { $ref: string };

/**
 * Allowed shapes in `WorkflowPlanStep.params` (literals, $ref, $runtimeParam, nesting).
 */
export type WorkflowPlanParamValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | WorkflowParamRef
  | WorkflowRuntimeParamRef
  | WorkflowPlanParamValue[]
  | { [key: string]: WorkflowPlanParamValue };

export interface WorkflowPlanStep {
  name: string;
  action: string;
  /**
   * Step inputs. Values follow {@link WorkflowPlanParamValue} (literals, {@link WorkflowParamRef},
   * {@link WorkflowRuntimeParamRef}, nesting). Stored as JSON; typed loosely for Prisma compatibility.
   */
  params: Record<string, any>;
  onFailure?: 'skip' | 'abort' | 'retry';
  maxRetries?: number;
  condition?: {
    /** Reference to a previous step output field, e.g. "step_1.output.success" */
    ref: string;
    /** Operator for comparison */
    operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'truthy' | 'falsy';
    /** Value to compare against (not needed for truthy/falsy) */
    value?: any;
  };
}

export interface CreateWorkflowInput {
  conversationId?: string;
  name: string;
  description?: string;
  steps: WorkflowPlanStep[];
  runtimeParams?: Record<string, any>;
}

// ==================== ENGINE ====================

class WorkflowEngine {
  /**
   * Create a new workflow with steps and enqueue it for execution
   */
  async createWorkflow(data: CreateWorkflowInput): Promise<any> {
    logger.info({ name: data.name, stepCount: data.steps.length }, 'Creating workflow');

    // Validate plan
    if (!data.steps || data.steps.length === 0) {
      throw new Error('Workflow must have at least one step');
    }

    for (let i = 0; i < data.steps.length; i++) {
      const step = data.steps[i];
      if (!step.name || !step.action) {
        throw new Error(`Step ${i + 1} is missing required fields (name, action)`);
      }
    }

    // Create workflow + steps in a transaction
    const workflow = await prisma.workflow.create({
      data: {
        conversationId: data.conversationId || null,
        name: data.name,
        description: data.description || null,
        status: 'PENDING',
        plan: { steps: data.steps, runtimeParams: data.runtimeParams } as any,
        totalSteps: data.steps.length,
        completedSteps: 0,
        steps: {
          create: data.steps.map((step, index) => ({
            order: index + 1,
            name: step.name,
            action: step.action,
            params: step.params || {},
            onFailure: step.onFailure || 'skip',
            condition: step.condition ? (step.condition as any) : null,
            status: 'PENDING',
            progress: 0,
          })),
        },
      },
      include: { steps: { orderBy: { order: 'asc' } } },
    });

    logger.info({ workflowId: workflow.id, totalSteps: workflow.totalSteps }, 'Workflow created');

    // Enqueue for execution
    await workflowQueue.add(
      `workflow-${workflow.id}`,
      { workflowId: workflow.id },
      { jobId: `workflow-${workflow.id}` }
    );

    return workflow;
  }

  /**
   * Main execution loop for a workflow
   */
  async executeWorkflow(workflowId: string): Promise<void> {
    const workflowLogger = logger.child({ workflowId });

    // Load workflow with steps
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: { steps: { orderBy: { order: 'asc' } } },
    });

    if (!workflow) {
      workflowLogger.error('Workflow not found');
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Guard: only execute PENDING workflows
    if (workflow.status !== 'PENDING') {
      workflowLogger.warn({ status: workflow.status }, 'Workflow is not in PENDING status, skipping execution');
      return;
    }

    // Mark workflow as RUNNING
    await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    const abortController = new AbortController();
    activeAbortControllers.set(workflowId, abortController);

    const conversationId = workflow.conversationId || '';

    emitWorkflowStarted(conversationId, {
      workflowId,
      name: workflow.name,
      totalSteps: workflow.totalSteps,
    });

    workflowLogger.info({ name: workflow.name, totalSteps: workflow.totalSteps }, 'Workflow execution started');

    const runtimeParams = (workflow.plan as any)?.runtimeParams || {};

    // Collect step outputs for $ref resolution
    const stepOutputs: Record<number, any> = {};
    let completedCount = 0;

    try {
      for (const step of workflow.steps) {
        // Re-check workflow status (it may have been cancelled externally)
        const currentWorkflow = await prisma.workflow.findUnique({
          where: { id: workflowId },
          select: { status: true },
        });

        if (!currentWorkflow || currentWorkflow.status === 'CANCELLED' || abortController.signal.aborted) {
          workflowLogger.info('Workflow was cancelled during execution');
          activeAbortControllers.delete(workflowId);
          return;
        }

        if (currentWorkflow.status === 'PAUSED') {
          workflowLogger.info('Workflow is paused, stopping execution');
          activeAbortControllers.delete(workflowId);
          return;
        }

        // Check condition (if present)
        if (step.condition) {
          const conditionMet = this.evaluateCondition(step.condition as any, stepOutputs);
          if (!conditionMet) {
            workflowLogger.info({ stepOrder: step.order, stepName: step.name }, 'Step condition not met, skipping');

            await prisma.workflowStep.update({
              where: { id: step.id },
              data: { status: 'SKIPPED' },
            });

            emitWorkflowStepSkipped(conversationId, {
              workflowId,
              stepOrder: step.order,
              reason: 'Condition not met',
            });

            continue;
          }
        }

        // Resolve input: merge params with $ref references from previous step outputs
        const resolvedInput = this.resolveInput(
          step.params as Record<string, any>,
          stepOutputs,
          runtimeParams
        );

        // Validate that $ref resolution didn't produce undefined for params that look required
        const undefinedRefs = this.findUndefinedRefs(step.params as Record<string, any>, resolvedInput);
        if (undefinedRefs.length > 0) {
          const msg = `Unresolved $ref(s): ${undefinedRefs.join(', ')} resolved to undefined`;
          workflowLogger.warn({ stepOrder: step.order, stepName: step.name, undefinedRefs }, msg);

          const onFailure = step.onFailure || 'skip';
          if (onFailure === 'abort') {
            throw new Error(msg);
          }
        }

        // Mark step as RUNNING
        await prisma.workflowStep.update({
          where: { id: step.id },
          data: {
            status: 'RUNNING',
            input: resolvedInput as any,
            startedAt: new Date(),
          },
        });

        emitWorkflowStepStarted(conversationId, {
          workflowId,
          stepOrder: step.order,
          stepName: step.name,
          action: step.action,
        });

        workflowLogger.info({ stepOrder: step.order, stepName: step.name, action: step.action }, 'Executing step');

        try {
          const result = await executeTool(step.action, resolvedInput, {
            conversationId: conversationId || undefined,
            signal: abortController.signal,
          });

          if (!result.success) {
            throw new Error(result.error || `Tool ${step.action} returned failure`);
          }

          // Mark step as COMPLETED
          await prisma.workflowStep.update({
            where: { id: step.id },
            data: {
              status: 'COMPLETED',
              output: result.data as any,
              progress: 100,
              completedAt: new Date(),
            },
          });

          stepOutputs[step.order] = result.data;
          completedCount++;

          // Update workflow progress
          await prisma.workflow.update({
            where: { id: workflowId },
            data: { completedSteps: completedCount },
          });

          emitWorkflowStepCompleted(conversationId, {
            workflowId,
            stepOrder: step.order,
            output: result.data,
          });

          emitWorkflowStepProgress(conversationId, {
            workflowId,
            stepOrder: step.order,
            progress: completedCount,
            progressTotal: workflow.totalSteps,
          });

          workflowLogger.info({ stepOrder: step.order, stepName: step.name }, 'Step completed');

        } catch (stepError: any) {
          const errorMessage = stepError instanceof Error ? stepError.message : String(stepError);
          const onFailure = step.onFailure || 'skip';

          workflowLogger.error(
            { stepOrder: step.order, stepName: step.name, error: errorMessage, onFailure },
            'Step execution failed'
          );

          emitWorkflowStepFailed(conversationId, {
            workflowId,
            stepOrder: step.order,
            error: errorMessage,
            onFailure,
          });

          if (onFailure === 'abort') {
            // Mark step as FAILED
            await prisma.workflowStep.update({
              where: { id: step.id },
              data: {
                status: 'FAILED',
                error: errorMessage,
                completedAt: new Date(),
              },
            });

            // Mark remaining steps as SKIPPED
            await prisma.workflowStep.updateMany({
              where: {
                workflowId,
                status: 'PENDING',
              },
              data: { status: 'SKIPPED' },
            });

            // Mark workflow as FAILED
            await prisma.workflow.update({
              where: { id: workflowId },
              data: {
                status: 'FAILED',
                error: `Step ${step.order} (${step.name}) failed: ${errorMessage}`,
                completedSteps: completedCount,
                completedAt: new Date(),
              },
            });

            emitWorkflowFailed(conversationId, {
              workflowId,
              error: `Step ${step.order} (${step.name}) failed: ${errorMessage}`,
            });

            return;

          } else if (onFailure === 'retry') {
            // Get current retry count from DB
            const currentStep = await prisma.workflowStep.findUnique({
              where: { id: step.id },
              select: { retryCount: true },
            });
            const currentRetryCount = (currentStep?.retryCount || 0) + 1;
            const planJson = workflow.plan as any;
            const planStep = (
              Array.isArray(planJson) ? planJson[step.order - 1] : planJson?.steps?.[step.order - 1]
            ) as WorkflowPlanStep | undefined;
            const maxStepRetries = planStep?.maxRetries ?? 3;

            if (currentRetryCount > maxStepRetries) {
              workflowLogger.warn(
                { stepOrder: step.order, stepName: step.name, retryCount: currentRetryCount, maxRetries: maxStepRetries },
                'Step max retries exceeded, aborting workflow'
              );

              await prisma.workflowStep.update({
                where: { id: step.id },
                data: {
                  status: 'FAILED',
                  error: `${errorMessage} (failed after ${currentRetryCount - 1} retries)`,
                  completedAt: new Date(),
                },
              });

              await prisma.workflowStep.updateMany({
                where: {
                  workflowId,
                  status: 'PENDING',
                },
                data: { status: 'SKIPPED' },
              });

              await prisma.workflow.update({
                where: { id: workflowId },
                data: {
                  status: 'FAILED',
                  error: `Step ${step.order} (${step.name}) failed after ${currentRetryCount - 1} retries: ${errorMessage}`,
                  completedSteps: completedCount,
                  completedAt: new Date(),
                },
              });

              emitWorkflowFailed(conversationId, {
                workflowId,
                error: `Step ${step.order} (${step.name}) failed after ${currentRetryCount - 1} retries: ${errorMessage}`,
              });

              activeAbortControllers.delete(workflowId);
              return;
            }

            // Increment retry count and re-enqueue with exponential backoff
            await prisma.workflowStep.update({
              where: { id: step.id },
              data: {
                status: 'PENDING',
                error: errorMessage,
                retryCount: currentRetryCount,
              },
            });

            const retryDelay = 5000 * Math.pow(2, currentRetryCount - 1);
            workflowLogger.info(
              { stepOrder: step.order, retryCount: currentRetryCount, maxRetries: maxStepRetries, delay: retryDelay },
              'Step marked for retry with exponential backoff'
            );

            // Set to PENDING *before* enqueuing so the worker's PENDING guard passes
            await prisma.workflow.update({
              where: { id: workflowId },
              data: { status: 'PENDING' },
            });

            await workflowQueue.add(
              `workflow-retry-${workflowId}-step-${step.order}`,
              { workflowId, stepOrder: step.order },
              {
                delay: retryDelay,
                jobId: `workflow-retry-${workflowId}-${Date.now()}`,
              }
            );

            activeAbortControllers.delete(workflowId);
            workflowLogger.info({ stepOrder: step.order }, 'Step marked for retry, workflow re-enqueued');
            return;

          } else {
            // onFailure === 'skip' (default)
            await prisma.workflowStep.update({
              where: { id: step.id },
              data: {
                status: 'SKIPPED',
                error: errorMessage,
                completedAt: new Date(),
              },
            });

            emitWorkflowStepSkipped(conversationId, {
              workflowId,
              stepOrder: step.order,
              reason: `Failed: ${errorMessage}`,
            });

            // Store null output so downstream $ref won't break
            stepOutputs[step.order] = null;

            workflowLogger.info({ stepOrder: step.order }, 'Step skipped after failure');
          }
        }
      }

      // All steps processed - collect final result
      const finalResult = {
        completedSteps: completedCount,
        totalSteps: workflow.totalSteps,
        stepOutputs,
      };

      await prisma.workflow.update({
        where: { id: workflowId },
        data: {
          status: 'COMPLETED',
          result: finalResult as any,
          completedSteps: completedCount,
          completedAt: new Date(),
        },
      });

      emitWorkflowCompleted(conversationId, {
        workflowId,
        result: finalResult,
      });

      activeAbortControllers.delete(workflowId);
      workflowLogger.info({ completedSteps: completedCount }, 'Workflow completed');

    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      workflowLogger.error({ error: errorMessage }, 'Workflow execution failed unexpectedly');

      await prisma.workflow.update({
        where: { id: workflowId },
        data: {
          status: 'FAILED',
          error: errorMessage,
          completedSteps: completedCount,
          completedAt: new Date(),
        },
      });

      emitWorkflowFailed(conversationId, {
        workflowId,
        error: errorMessage,
      });

      activeAbortControllers.delete(workflowId);
    }
  }

  /**
   * Cancel a running or pending workflow
   */
  async cancelWorkflow(workflowId: string): Promise<any> {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: { steps: true },
    });

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (workflow.status === 'COMPLETED' || workflow.status === 'CANCELLED') {
      logger.warn({ workflowId, status: workflow.status }, 'Cannot cancel workflow in terminal state');
      return workflow;
    }

    // Abort in-flight tool execution
    const controller = activeAbortControllers.get(workflowId);
    if (controller) {
      controller.abort();
      activeAbortControllers.delete(workflowId);
    }

    // Remove pending BullMQ job so the worker doesn't pick it up again
    try {
      const bullJobId = `workflow-${workflowId}`;
      const job = await workflowQueue.getJob(bullJobId);
      if (job) {
        await job.remove();
        logger.debug({ workflowId, bullJobId }, 'Removed BullMQ job on cancel');
      }
    } catch (err) {
      logger.warn({ err, workflowId }, 'Could not remove BullMQ job during cancel (may already be active)');
    }

    // Mark remaining pending/running steps as SKIPPED
    await prisma.workflowStep.updateMany({
      where: {
        workflowId,
        status: { in: ['PENDING', 'RUNNING'] },
      },
      data: { status: 'SKIPPED' },
    });

    // Mark workflow as CANCELLED
    const updated = await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
      include: { steps: { orderBy: { order: 'asc' } } },
    });

    const conversationId = workflow.conversationId || '';
    emitWorkflowCancelled(conversationId, { workflowId });

    logger.info({ workflowId }, 'Workflow cancelled');
    return updated;
  }

  /**
   * Get the full status of a workflow including all steps
   */
  async getWorkflowStatus(workflowId: string): Promise<any> {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: { steps: { orderBy: { order: 'asc' } } },
    });

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    return workflow;
  }

  /**
   * Resume a paused workflow (e.g., after a retry delay)
   */
  async resumeWorkflow(workflowId: string): Promise<void> {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { status: true },
    });

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (workflow.status !== 'PAUSED') {
      logger.warn({ workflowId, status: workflow.status }, 'Cannot resume workflow that is not paused');
      return;
    }

    // Set back to PENDING so the execute loop can pick it up
    await prisma.workflow.update({
      where: { id: workflowId },
      data: { status: 'PENDING' },
    });

    // Re-enqueue
    await workflowQueue.add(
      `workflow-resume-${workflowId}`,
      { workflowId },
      { jobId: `workflow-resume-${workflowId}-${Date.now()}` }
    );

    logger.info({ workflowId }, 'Workflow resumed');
  }

  /**
   * Recover workflows stuck in RUNNING/PAUSED status after a server crash.
   * Called once at server startup.
   */
  async recoverStuckWorkflows(): Promise<{ failed: number; resumed: number }> {
    const stuckWorkflows = await prisma.workflow.findMany({
      where: { status: { in: ['RUNNING', 'PAUSED'] } },
      select: { id: true, name: true, status: true, startedAt: true },
    });

    if (stuckWorkflows.length === 0) return { failed: 0, resumed: 0 };

    logger.warn(
      { count: stuckWorkflows.length, ids: stuckWorkflows.map((w) => w.id) },
      'Found stuck workflows after server restart — marking as FAILED'
    );

    let failed = 0;
    for (const wf of stuckWorkflows) {
      await prisma.workflow.update({
        where: { id: wf.id },
        data: {
          status: 'FAILED',
          error: `Server restarted while workflow was ${wf.status}. Marked FAILED during crash recovery.`,
          completedAt: new Date(),
        },
      });

      await prisma.workflowStep.updateMany({
        where: { workflowId: wf.id, status: { in: ['RUNNING', 'PENDING'] } },
        data: { status: 'SKIPPED', error: 'Skipped due to server restart crash recovery' },
      });

      failed++;
    }

    logger.info({ failed }, 'Workflow crash recovery complete');
    return { failed, resumed: 0 };
  }

  // ==================== PRIVATE HELPERS ====================

  /**
   * Evaluate a step condition against collected step outputs.
   * Returns true if the condition is met, false otherwise.
   */
  private evaluateCondition(
    condition: { ref: string; operator: string; value?: any },
    stepOutputs: Record<number, any>
  ): boolean {
    try {
      const resolved = this.resolveRef(condition.ref, stepOutputs);

      switch (condition.operator) {
        case 'eq':
          return resolved === condition.value;
        case 'neq':
          return resolved !== condition.value;
        case 'gt':
          return resolved > condition.value;
        case 'lt':
          return resolved < condition.value;
        case 'gte':
          return resolved >= condition.value;
        case 'lte':
          return resolved <= condition.value;
        case 'truthy':
          return !!resolved;
        case 'falsy':
          return !resolved;
        default:
          logger.warn({ operator: condition.operator }, 'Unknown condition operator, defaulting to true');
          return true;
      }
    } catch (error) {
      logger.warn({ condition, error }, 'Failed to evaluate condition, defaulting to true');
      return true;
    }
  }

  /**
   * Resolve $ref references in step params.
   * Supports syntax like: { "$ref": "step_1.output.contactIds" }
   * or string values like: "$ref:step_1.output.contactIds"
   */
  private resolveInput(
    params: Record<string, any>,
    stepOutputs: Record<number, any>,
    runtimeParams: Record<string, any>
  ): Record<string, any> {
    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      if (value && typeof value === 'object' && '$ref' in value) {
        // Object-style $ref: { "$ref": "step_1.output.contactIds" }
        resolved[key] = this.resolveRef(value.$ref, stepOutputs);
      } else if (value && typeof value === 'object' && '$runtimeParam' in value) {
        resolved[key] = runtimeParams[value.$runtimeParam] ?? value.$runtimeParam;
      } else if (typeof value === 'string' && value.startsWith('$ref:')) {
        // String-style $ref: "$ref:step_1.output.contactIds"
        resolved[key] = this.resolveRef(value.substring(5), stepOutputs);
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recurse into nested objects
        resolved[key] = this.resolveInput(value, stepOutputs, runtimeParams);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * Find params whose original value was a $ref but resolved to undefined.
   */
  private findUndefinedRefs(
    originalParams: Record<string, any>,
    resolvedParams: Record<string, any>
  ): string[] {
    const result: string[] = [];
    for (const [key, value] of Object.entries(originalParams)) {
      const isRef =
        (value && typeof value === 'object' && '$ref' in value) ||
        (typeof value === 'string' && value.startsWith('$ref:'));

      if (isRef && resolvedParams[key] === undefined) {
        const refPath = typeof value === 'string' ? value : value.$ref;
        result.push(`${key} (${refPath})`);
      }
    }
    return result;
  }

  /**
   * Resolve a dot-notation reference path against step outputs.
   * E.g., "step_1.output.contactIds" -> stepOutputs[1].contactIds
   *
   * Expected format: step_<N>.<path>
   * The "output" segment is optional since stepOutputs already stores the output directly.
   */
  private resolveRef(refPath: string, stepOutputs: Record<number, any>): any {
    const parts = refPath.split('.');

    // Extract step number from "step_N"
    const stepPart = parts[0]; // e.g., "step_1"
    const stepMatch = stepPart.match(/^step_(\d+)$/);
    if (!stepMatch) {
      logger.warn({ refPath }, 'Invalid $ref path: expected step_N format');
      return undefined;
    }

    const stepNumber = parseInt(stepMatch[1], 10);
    let current = stepOutputs[stepNumber];

    // Navigate remaining path parts (skip "output" if present since we already have the output)
    let pathStart = 1;
    if (parts[1] === 'output') {
      pathStart = 2;
    }

    for (let i = pathStart; i < parts.length; i++) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[parts[i]];
    }

    return current;
  }
}

// Export singleton
export const workflowEngine = new WorkflowEngine();
