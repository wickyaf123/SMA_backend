/**
 * Workflow Service
 * CRUD operations and query helpers for workflows.
 * For execution logic, see workflow.engine.ts
 */

import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

class WorkflowService {
  /**
   * List workflows with optional filters
   */
  async listWorkflows(options?: {
    conversationId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ workflows: any[]; total: number }> {
    const where: Record<string, any> = {};

    if (options?.conversationId) {
      where.conversationId = options.conversationId;
    }
    if (options?.status) {
      where.status = options.status;
    }

    const limit = options?.limit || 20;
    const offset = options?.offset || 0;

    const [workflows, total] = await Promise.all([
      prisma.workflow.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          steps: {
            orderBy: { order: 'asc' },
            select: {
              id: true,
              order: true,
              name: true,
              action: true,
              status: true,
              progress: true,
              progressTotal: true,
              error: true,
              startedAt: true,
              completedAt: true,
            },
          },
        },
      }),
      prisma.workflow.count({ where }),
    ]);

    return { workflows, total };
  }

  /**
   * Get a single workflow by ID with full step details
   */
  async getWorkflow(workflowId: string): Promise<any> {
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
   * Delete a workflow (only if not currently running)
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { status: true },
    });

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (workflow.status === 'RUNNING') {
      throw new Error('Cannot delete a running workflow. Cancel it first.');
    }

    await prisma.workflow.delete({ where: { id: workflowId } });
    logger.info({ workflowId }, 'Workflow deleted');
  }

  /**
   * Get workflows for a specific conversation
   */
  async getConversationWorkflows(conversationId: string): Promise<any[]> {
    return prisma.workflow.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      include: {
        steps: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            order: true,
            name: true,
            action: true,
            status: true,
            progress: true,
            error: true,
          },
        },
      },
    });
  }

  /**
   * Get summary statistics for workflows
   */
  async getWorkflowStats(): Promise<{
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    const grouped = await prisma.workflow.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const stats = {
      total: 0,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const group of grouped) {
      const count = group._count.status;
      stats.total += count;
      const key = group.status.toLowerCase() as keyof typeof stats;
      if (key in stats && key !== 'total') {
        stats[key] = count;
      }
    }

    return stats;
  }
}

// Export singleton
export const workflowService = new WorkflowService();
