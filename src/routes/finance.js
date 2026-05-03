/**
 * Finance routes — CRUD for finance_entries. All endpoints require auth + admin.
 * Rewritten to use Prisma ORM.
 */
const express = require('express');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const config = require('../config');
const { z } = require('zod');
const logger = require('../utils/logger');

module.exports = function (Router, db) {

    const router = Router();

    // ─── GET /api/finance ──────────────────────────────────────────
    router.get('/api/finance', authenticateToken, requireAdmin, async (req, res, next) => {
        try {
            const entries = await db.financeEntry.findMany({
                orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            });
            res.json(entries);
        } catch (err) {
            next(err);
        }
    });

    // ─── POST /api/finance ─────────────────────────────────────────
    router.post('/api/finance', authenticateToken, requireAdmin, async (req, res, next) => {
        try {
            const schema = z.object({
                date: z.string().min(1),
                fulfillment_cost: z.number().optional().default(0),
                fulfillment_note: z.string().trim().optional().default(''),
                other_cost: z.number().optional().default(0),
                other_note: z.string().trim().optional().default(''),
                payment: z.number().optional().default(0),
                payment_note: z.string().trim().optional().default(''),
            });

            const data = schema.parse(req.body);
            const { username: currentUser } = req.user;

            const entry = await db.financeEntry.create({
                data: {
                    ...data,
                    createdAt: new Date().toISOString(),
                    addedBy: currentUser,
                },
            });

            res.status(201).json({ id: entry.id, message: 'Finance entry created.' });
        } catch (err) {
            next(err);
        }
    });

    // ─── PUT /api/finance/:id ──────────────────────────────────────
    router.put('/api/finance/:id', authenticateToken, requireAdmin, async (req, res, next) => {
        try {
            const schema = z.object({
                date: z.string().min(1).optional(),
                fulfillment_cost: z.number().optional(),
                fulfillment_note: z.string().trim().optional(),
                other_cost: z.number().optional(),
                other_note: z.string().trim().optional(),
                payment: z.number().optional(),
                payment_note: z.string().trim().optional(),
            });

            const data = schema.parse(req.body);
            const { id } = req.params;

            const entry = await db.financeEntry.findUnique({ where: { id } });
            if (!entry) {
                const error = new Error('Finance entry not found.');
                error.statusCode = 404;
                error.isPublic = true;
                throw error;
            }

            if (Object.keys(data).length === 0) {
                const error = new Error('No fields to update.');
                error.statusCode = 400;
                error.isPublic = true;
                throw error;
            }

            await db.financeEntry.update({ where: { id }, data });

            res.json({ message: 'Finance entry updated.' });
        } catch (err) {
            next(err);
        }
    });

    // ─── DELETE /api/finance/:id ───────────────────────────────────
    router.delete('/api/finance/:id', authenticateToken, requireAdmin, async (req, res, next) => {
        try {
            const { id } = req.params;

            const entry = await db.financeEntry.findUnique({ where: { id } });
            if (!entry) {
                const error = new Error('Finance entry not found.');
                error.statusCode = 404;
                error.isPublic = true;
                throw error;
            }

            await db.financeEntry.delete({ where: { id } });

            res.json({ message: 'Finance entry deleted.' });
        } catch (err) {
            next(err);
        }
    });

    return router;
};
