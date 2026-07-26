const express = require('express');
const validate = require('../../middlewares/validate');
const ratingValidation = require('../../validations/rating.validation');
const prisma = require('../../lib/prisma');
const router = express.Router();

router.get('/:postId', async (req, res, next) => {
  try {
    const stats = await prisma.rating.aggregate({
      where: { postId: req.params.postId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    res.json({
      success: true,
      average: stats._avg.rating ? Math.round(stats._avg.rating * 10) / 10 : 0,
      count: stats._count.rating,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:postId', validate(ratingValidation.createRating), async (req, res, next) => {
  try {
    const { wallet, rating: rawRating, txHash } = req.body;
    const rating = Math.round((Number(rawRating) || 0) / 10 * 10) / 10;

    const data = await prisma.rating.upsert({
      where: { postId_wallet: { postId: req.params.postId, wallet } },
      update: { rating, txHash },
      create: { siteId: req.siteId, postId: req.params.postId, wallet, rating, txHash },
    });

    res.json({ success: true, rating: data });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
