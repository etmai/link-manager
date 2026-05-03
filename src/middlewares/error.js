const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
    logger.error(`${err.name}: ${err.message}`, {
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        body: req.body,
    });

    // Default to 500 server error
    const statusCode = err.statusCode || 500;
    const message = err.isPublic ? err.message : 'Đã có lỗi xảy ra trên hệ thống. Vui lòng thử lại sau.';

    res.status(statusCode).json({
        error: message,
        code: err.code || 'INTERNAL_ERROR'
    });
}

module.exports = errorHandler;
