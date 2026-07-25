const express = require('express');
const validate = require('../../middlewares/validate');
const blogValidation = require('../../validations/blog.validation');
const blogController = require('../../controllers/blog.controller');
const { authenticate, authorize } = require('../../middlewares/auth');

const router = express.Router();

router.get('/posts', blogController.list);
router.get('/posts-by-types', blogController.listByTypes);
router.get('/posts/:slug', blogController.getBySlug);

router.get('/admin/posts', authenticate, authorize('admin', 'author'), blogController.adminList);
router.get('/admin/posts/:id', authenticate, authorize('admin', 'author'), blogController.getById);
router.post('/admin/posts', authenticate, authorize('admin', 'author'), validate(blogValidation.createPost), blogController.create);
router.put('/admin/posts/:id', authenticate, authorize('admin', 'author'), validate(blogValidation.updatePost), blogController.update);
router.delete('/admin/posts/:id', authenticate, authorize('admin', 'author'), blogController.remove);

module.exports = router;
