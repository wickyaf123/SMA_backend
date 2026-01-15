import { Router } from 'express';
import { companyController } from '../controllers/company.controller';

const router = Router();

/**
 * Company Routes
 */

// CRUD operations
router.post('/', companyController.createCompany.bind(companyController));
router.get('/:id', companyController.getCompany.bind(companyController));
router.patch('/:id', companyController.updateCompany.bind(companyController));
router.delete('/:id', companyController.deleteCompany.bind(companyController));
router.get('/', companyController.listCompanies.bind(companyController));

export default router;

