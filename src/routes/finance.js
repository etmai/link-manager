/**
 * Finance routes — CRUD for finance_entries. All endpoints require auth + admin.
 * Rewritten to use Prisma ORM.
 */
const express = require('express');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const config = require('../config');

module.exports = function (Router, db) {

    const router = Router();

    // ─── GET /api/finance ──────────────────────────────────────────
    router.get('/api/finance', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const entries = await db.financeEntry.findMany({
                orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            });
            res.json(entries);
        } catch (err) {
            console.error('[Finance] GET error:', err);
            res.status(500).json({ error: 'Failed to fetch finance entries.' });
        }
    });

    // ─── POST /api/finance ─────────────────────────────────────────
    router.post('/api/finance', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { username: currentUser } = req.user;
            const { date, fulfillment_cost, fulfillment_note, other_cost, other_note, payment, payment_note } = req.body;

            if (!date || !date.trim()) {
                return res.status(400).json({ error: 'Date is required.' });
            }

            const now = new Date().toISOString();

            const entry = await db.financeEntry.create({
                data: {
                    date,
                    fulfillment_cost: fulfillment_cost || 0,
                    fulfillment_note: fulfillment_note || '',
                    other_cost: other_cost || 0,
                    other_note: other_note || '',
                    payment: payment || 0,
                    payment_note: payment_note || '',
                    createdAt: now,
                    addedBy: currentUser,
                },
            });

            res.status(201).json({ id: entry.id, message: 'Finance entry created.' });
        } catch (err) {
            console.error('[Finance] POST error:', err);
            res.status(500).json({ error: 'Failed to create finance entry.' });
        }
    });

    // ─── PUT /api/finance/:id ──────────────────────────────────────
    router.put('/api/finance/:id', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            const { date, fulfillment_cost, fulfillment_note, other_cost, other_note, payment, payment_note } = req.body;

            if (date !== undefined && (!date || !date.trim())) {
                return res.status(400).json({ error: 'Date cannot be empty.' });
            }

            const entry = await db.financeEntry.findUnique({ where: { id } });
            if (!entry) {
                return res.status(404).json({ error: 'Finance entry not found.' });
            }

            const data = {};

            if (date !== undefined) data.date = date;
            if (fulfillment_cost !== undefined) data.fulfillment_cost = fulfillment_cost;
            if (fulfillment_note !== undefined) data.fulfillment_note = fulfillment_note;
            if (other_cost !== undefined) data.other_cost = other_cost;
            if (other_note !== undefined) data.other_note = other_note;
            if (payment !== undefined) data.payment = payment;
            if (payment_note !== undefined) data.payment_note = payment_note;

            if (Object.keys(data).length === 0) {
                return res.status(400).json({ error: 'No fields to update.' });
            }

            await db.financeEntry.update({ where: { id }, data });

            res.json({ message: 'Finance entry updated.' });
        } catch (err) {
            console.error('[Finance] PUT error:', err);
            res.status(500).json({ error: 'Failed to update finance entry.' });
        }
    });

    // ─── DELETE /api/finance/:id ───────────────────────────────────
    router.delete('/api/finance/:id', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { id } = req.params;

            const entry = await db.financeEntry.findUnique({ where: { id } });
            if (!entry) {
                return res.status(404).json({ error: 'Finance entry not found.' });
            }

            await db.financeEntry.delete({ where: { id } });

            res.json({ message: 'Finance entry deleted.' });
        } catch (err) {
            console.error('[Finance] DELETE error:', err);
            res.status(500).json({ error: 'Failed to delete finance entry.' });
        }
    });

    return router;
};
