const express = require('express');
const validate = require('../../middlewares/validate');
const blogValidation = require('../../validations/blog.validation');
const blogController = require('../../controllers/blog.controller');
const { authenticate } = require('../../middlewares/auth');

const router = express.Router();

router.get('/posts', blogController.list);
router.get('/posts/:slug', blogController.getBySlug);

router.get('/admin/posts', authenticate, blogController.adminList);
router.get('/admin/posts/:id', authenticate, blogController.getById);
router.post('/admin/posts', authenticate, validate(blogValidation.createPost), blogController.create);
router.put('/admin/posts/:id', authenticate, validate(blogValidation.updatePost), blogController.update);
router.delete('/admin/posts/:id', authenticate, blogController.remove);

module.exports = router;
