const { authenticateToken } = require('../middlewares/auth');
const { scrapeProduct } = require('../utils/scraper');

module.exports = function (Router, db) {
  const router = Router();

  // GET /api/scrape/amazon/:asin — scrape Amazon product (auth required)
  router.get('/api/scrape/amazon/:asin', authenticateToken, async (req, res, next) => {
    const { asin } = req.params;

    try {
      const result = await scrapeProduct('amazon', asin);
      res.json(result); // result is already { title }
    } catch (err) {
      next(err);
    }
  });

  // GET /api/scrape/etsy/:id — scrape Etsy product (auth required)
  router.get('/api/scrape/etsy/:id', authenticateToken, async (req, res, next) => {
    const { id } = req.params;

    try {
      const result = await scrapeProduct('etsy', id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/scrape/ebay/:id — scrape eBay product (auth required)
  router.get('/api/scrape/ebay/:id', authenticateToken, async (req, res, next) => {
    const { id } = req.params;

    try {
      const result = await scrapeProduct('ebay', id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
