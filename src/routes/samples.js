/**
 * Sample requests routes — CRUD + expired cleanup.
 * Rewritten to use Prisma ORM.
 */
const express = require('express');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const config = require('../config');

module.exports = function (Router, db) {

    const router = Router();

    // ─── GET /api/samples ──────────────────────────────────────────
    router.get('/api/samples', authenticateToken, async (req, res) => {
        try {
            const { username: currentUser, role } = req.user;
            let samples;

            if (role === 'admin') {
                samples = await db.sampleRequest.findMany({
                    orderBy: { createdAt: 'desc' },
                });
            } else {
                samples = await db.sampleRequest.findMany({
                    where: { requester: currentUser },
                    orderBy: { createdAt: 'desc' },
                });
            }

            res.json(samples);
        } catch (err) {
            console.error('[Samples] GET error:', err);
            res.status(500).json({ error: 'Failed to fetch sample requests.' });
        }
    });

    // ─── POST /api/samples ─────────────────────────────────────────
    router.post('/api/samples', authenticateToken, async (req, res) => {
        try {
            const { username: currentUser } = req.user;
            const { designId } = req.body;

            if (!designId) {
                return res.status(400).json({ error: 'designId is required.' });
            }

            // Check unique: one sample per designId (global)
            const existing = await db.sampleRequest.findFirst({
                where: { designId },
            });
            if (existing) {
                return res.status(409).json({ error: 'Sample request for this design already exists.' });
            }

            const now = new Date().toISOString();

            const sample = await db.sampleRequest.create({
                data: {
                    designId,
                    requester: currentUser,
                    requestDate: now.split('T')[0],
                    status: 'Process',
                    productLink: 'N/A',
                    expiryDate: 'N/A',
                    createdAt: now,
                },
            });

            res.status(201).json({ id: sample.id, message: 'Sample request created.' });
        } catch (err) {
            console.error('[Samples] POST error:', err);
            res.status(500).json({ error: 'Failed to create sample request.' });
        }
    });

    // ─── PUT /api/samples/:id ──────────────────────────────────────
    router.put('/api/samples/:id', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            const { productLink } = req.body;

            const sample = await db.sampleRequest.findUnique({ where: { id } });
            if (!sample) {
                return res.status(404).json({ error: 'Sample request not found.' });
            }

            if (productLink !== undefined && productLink) {
                // Calculate expiry = now + 29 days
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + 29);

                await db.sampleRequest.update({
                    where: { id },
                    data: {
                        productLink,
                        status: 'Live',
                        expiryDate: expiryDate.toISOString().split('T')[0],
                    },
                });
            }

            res.json({ message: 'Sample request updated.' });
        } catch (err) {
            console.error('[Samples] PUT error:', err);
            res.status(500).json({ error: 'Failed to update sample request.' });
        }
    });

    // ─── DELETE /api/samples/:id ───────────────────────────────────
    router.delete('/api/samples/:id', authenticateToken, async (req, res) => {
        try {
            const { username: currentUser, role } = req.user;
            const { id } = req.params;

            const sample = await db.sampleRequest.findUnique({ where: { id } });
            if (!sample) {
                return res.status(404).json({ error: 'Sample request not found.' });
            }

            const isAdmin = role === 'admin';
            const isCreator = sample.requester === currentUser;

            if (!isAdmin && !isCreator) {
                return res.status(403).json({ error: 'Only admin or the requester can delete this sample.' });
            }

            await db.sampleRequest.delete({ where: { id } });

            res.json({ message: 'Sample request deleted.' });
        } catch (err) {
            console.error('[Samples] DELETE error:', err);
            res.status(500).json({ error: 'Failed to delete sample request.' });
        }
    });

    // ─── POST /api/samples/cleanup-expired ─────────────────────────
    router.post('/api/samples/cleanup-expired', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const today = new Date().toISOString().split('T')[0];

            const result = await db.$executeRaw`
                UPDATE sample_requests
                SET status = 'Process', productLink = 'N/A', expiryDate = 'N/A'
                WHERE expiryDate < ${today} AND expiryDate != 'N/A'
            `;

            const resetCount = Number(result) || 0;

            res.json({ message: `Reset ${resetCount} expired sample(s).`, count: resetCount });
        } catch (err) {
            console.error('[Samples] Cleanup error:', err);
            res.status(500).json({ error: 'Failed to cleanup expired samples.' });
        }
    });

    return router;
};
