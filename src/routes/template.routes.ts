/**
 * Template Routes
 * API endpoints for message template management
 */

import { Router } from 'express';
import { templateController } from '../controllers/template.controller';

const router = Router();

/**
 * GET /templates
 * List all templates with optional filters
 * Query params: channel, isActive, isDefault, tags, limit, offset
 */
router.get('/', templateController.listTemplates.bind(templateController));

/**
 * POST /templates
 * Create a new template
 */
router.post('/', templateController.createTemplate.bind(templateController));

/**
 * GET /templates/default/:channel
 * Get the default template for a channel (SMS or EMAIL)
 */
router.get('/default/:channel', templateController.getDefaultTemplate.bind(templateController));

/**
 * GET /templates/:id
 * Get a specific template
 */
router.get('/:id', templateController.getTemplate.bind(templateController));

/**
 * PATCH /templates/:id
 * Update a template
 */
router.patch('/:id', templateController.updateTemplate.bind(templateController));

/**
 * DELETE /templates/:id
 * Delete a template
 */
router.delete('/:id', templateController.deleteTemplate.bind(templateController));

/**
 * POST /templates/:id/preview
 * Preview a template with sample data
 */
router.post('/:id/preview', templateController.previewTemplate.bind(templateController));

/**
 * POST /templates/:id/set-default
 * Set a template as the default for its channel
 */
router.post('/:id/set-default', templateController.setAsDefault.bind(templateController));

export default router;

