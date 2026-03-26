import { ToolDefinition, ToolHandler, ToolRegistry, ToolErrorCode } from './types';
import { workflowEngine } from '../../workflow/workflow.engine';
import { getAllPresets, getPresetById } from '../../workflow/workflow-presets';

const definitions: ToolDefinition[] = [
  {
    name: 'create_workflow',
    description:
      'Create and start a multi-step workflow. Each step can perform an action with parameters, handle failures, and have conditions.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Workflow name' },
        steps: {
          type: 'array',
          description: 'Array of workflow steps to execute in order',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Step name' },
              action: { type: 'string', description: 'Action to perform (tool name or custom action)' },
              params: {
                type: 'object',
                description: 'Parameters for the action',
              },
              onFailure: {
                type: 'string',
                description: 'What to do on failure: skip, stop, or retry (default: stop)',
              },
              condition: {
                type: 'string',
                description: 'Optional condition expression to evaluate before running this step',
              },
            },
            required: ['name', 'action'],
          },
        },
      },
      required: ['name', 'steps'],
    },
  },
  {
    name: 'get_workflow_status',
    description:
      'Get the status and step details of a workflow by ID.',
    input_schema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string', description: 'The workflow ID' },
      },
      required: ['workflowId'],
    },
  },
  {
    name: 'cancel_workflow',
    description: 'Cancel a running workflow by ID.',
    input_schema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string', description: 'The workflow ID to cancel' },
      },
      required: ['workflowId'],
    },
  },
  {
    name: 'list_workflow_presets',
    description: 'List available workflow presets with descriptions and trigger hints',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'run_workflow_preset',
    description: 'Run a workflow preset by ID with optional parameters',
    input_schema: {
      type: 'object',
      properties: {
        presetId: { type: 'string', description: 'The preset ID to run (e.g., "weekly-prospecting", "monthly-review")' },
        params: {
          type: 'object',
          description: 'Optional override parameters for step params (e.g., city, geoId, batchSize)',
        },
      },
      required: ['presetId'],
    },
  },
];

const handlers: Record<string, ToolHandler> = {
  create_workflow: async (input) => {
    // Pre-validate: check all step actions reference known tools
    const { toolDefinitions } = await import('./index');
    const knownTools = new Set(toolDefinitions.map((d) => d.name));
    const steps = input.steps || [];
    for (const step of steps) {
      if (step.action && !knownTools.has(step.action)) {
        return {
          success: false,
          error: `Cannot create workflow -- step "${step.name}" references unknown tool: ${step.action}`,
          code: 'PRECONDITION' as ToolErrorCode,
        };
      }
    }

    const workflow = await workflowEngine.createWorkflow({
      conversationId: input.conversationId,
      name: input.name,
      description: input.description,
      steps: steps.map((step: any) => ({
        name: step.name,
        action: step.action,
        params: step.params || {},
        onFailure: step.onFailure || 'skip',
        condition: step.condition || undefined,
      })),
    });

    return {
      success: true,
      data: {
        workflowId: workflow.id,
        name: workflow.name,
        status: workflow.status,
        totalSteps: workflow.totalSteps,
        message: `Workflow "${workflow.name}" created with ${workflow.totalSteps} steps and queued for execution. ID: ${workflow.id}`,
      },
    };
  },

  get_workflow_status: async (input) => {
    const workflowStatus = await workflowEngine.getWorkflowStatus(input.workflowId);
    if (!workflowStatus) {
      return { success: false, error: `Workflow not found with ID: ${input.workflowId}`, code: 'PRECONDITION' as ToolErrorCode };
    }

    return {
      success: true,
      data: { workflow: workflowStatus },
    };
  },

  cancel_workflow: async (input) => {
    const cancelledWorkflow = await workflowEngine.cancelWorkflow(input.workflowId);
    if (!cancelledWorkflow) {
      return { success: false, error: `Workflow not found with ID: ${input.workflowId}`, code: 'PRECONDITION' as ToolErrorCode };
    }

    return {
      success: true,
      data: {
        workflowId: cancelledWorkflow.id,
        name: cancelledWorkflow.name,
        status: cancelledWorkflow.status,
        message: `Workflow "${cancelledWorkflow.name}" cancelled successfully.`,
      },
    };
  },

  list_workflow_presets: async () => {
    const presets = getAllPresets();

    return {
      success: true,
      data: {
        presets: presets.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          triggerHints: p.triggerHints,
          stepCount: p.steps.length,
        })),
        total: presets.length,
      },
    };
  },

  run_workflow_preset: async (input) => {
    const preset = getPresetById(input.presetId);
    if (!preset) {
      return {
        success: false,
        error: `Workflow preset not found with ID: "${input.presetId}". Use list_workflow_presets to see available presets.`,
        code: 'PRECONDITION' as ToolErrorCode,
      };
    }

    // Merge any override params into step params
    const stepsWithOverrides = preset.steps.map((step) => {
      const mergedParams = { ...step.params };
      if (input.params) {
        // Apply override params to any step that has matching keys
        for (const [key, value] of Object.entries(input.params)) {
          if (key in mergedParams) {
            (mergedParams as Record<string, any>)[key] = value;
          }
        }
      }
      return {
        name: step.name,
        action: step.action,
        params: mergedParams,
        onFailure: step.onFailure || 'skip',
      };
    });

    // Return the preset plan for Jerry to show as a confirmation card
    // Don't auto-execute — let Jerry confirm first
    return {
      success: true,
      data: {
        presetId: preset.id,
        presetName: preset.name,
        description: preset.description,
        steps: stepsWithOverrides.map((s, i) => ({
          order: i + 1,
          name: s.name,
          action: s.action,
          params: s.params,
          onFailure: s.onFailure,
        })),
        totalSteps: stepsWithOverrides.length,
        message: `Workflow preset "${preset.name}" ready to execute with ${stepsWithOverrides.length} steps. Use create_workflow to start it.`,
      },
    };
  },
};

export function registerTools(registry: ToolRegistry): void {
  for (const def of definitions) {
    registry.register(def, handlers[def.name]);
  }
}
