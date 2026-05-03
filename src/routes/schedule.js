/**
 * Schedule routes — work_schedule CRUD + comments + Trello integration.
 * Rewritten to use Prisma ORM.
 */
const express = require('express');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const config = require('../config');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

module.exports = function (Router, db) {

    const router = Router();

    // ─── GET /api/schedule ─────────────────────────────────────────
    router.get('/api/schedule', authenticateToken, async (req, res) => {
        try {
            const { username: currentUser, role } = req.user;
            let tasks;

            if (role === 'admin') {
                const filterUser = req.query.user;
                if (filterUser && filterUser !== 'all') {
                    tasks = await db.workSchedule.findMany({
                        where: { userId: filterUser },
                        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
                    });
                } else {
                    tasks = await db.workSchedule.findMany({
                        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
                    });
                }
            } else {
                tasks = await db.workSchedule.findMany({
                    where: {
                        OR: [
                            { userId: currentUser },
                            { creatorRole: 'admin' }
                        ]
                    },
                    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
                });
            }

            res.json(tasks);
        } catch (err) {
            console.error('[Schedule] GET error:', err);
            res.status(500).json({ error: 'Failed to fetch schedule tasks.' });
        }
    });

    // ─── POST /api/schedule ────────────────────────────────────────
    router.post('/api/schedule', authenticateToken, async (req, res) => {
        try {
            const { username: currentUser, role } = req.user;
            const { title, description, date, userId, categories } = req.body;

            if (!title || !date) {
                return res.status(400).json({ error: 'Title and date are required.' });
            }

            const taskUserId = (role === 'admin' && userId) ? userId : currentUser;
            const now = new Date().toISOString();

            const task = await db.workSchedule.create({
                data: {
                    title,
                    description: description || '',
                    date,
                    userId: taskUserId,
                    status: 'pending',
                    createdBy: currentUser,
                    creatorRole: role,
                    createdAt: now,
                    categories: JSON.stringify(categories || []),
                },
            });

            res.status(201).json({ id: task.id, message: 'Task created successfully.' });
        } catch (err) {
            console.error('[Schedule] POST error:', err);
            res.status(500).json({ error: 'Failed to create task.' });
        }
    });

    // ─── PUT /api/schedule/:id ─────────────────────────────────────
    router.put('/api/schedule/:id', authenticateToken, async (req, res) => {
        try {
            const { username: currentUser, role } = req.user;
            const { id } = req.params;
            const { title, description, date, userId, status, categories } = req.body;

            const task = await db.workSchedule.findUnique({ where: { id } });
            if (!task) {
                return res.status(404).json({ error: 'Task not found.' });
            }

            const isAdmin = role === 'admin';
            const isCreator = task.createdBy === currentUser;
            const isAssignee = task.userId === currentUser;
            const isAdminCreated = task.creatorRole === 'admin';

            // Users can view/comment/complete Admin-created tasks
            if (!isAdmin && !isCreator && !isAssignee && !isAdminCreated) {
                return res.status(403).json({ error: 'Bạn không có quyền thao tác trên công việc này!' });
            }

            // If not Admin and not Creator, can ONLY update status
            // If it's an Admin-created task, any user can update status (according to request)
            if (!isAdmin && !isCreator) {
                if (title || description || date || userId || categories) {
                    return res.status(403).json({ error: 'Bạn chỉ có quyền cập nhật trạng thái (Hoàn thành) cho công việc này!' });
                }
                await db.workSchedule.update({
                    where: { id },
                    data: { status },
                });
                return res.json({ message: 'Task status updated.' });
            }

            // Admin or creator: build dynamic data object for provided fields
            const data = {};

            if (title !== undefined) data.title = title;
            if (description !== undefined) data.description = description;
            if (date !== undefined) data.date = date;
            if (status !== undefined) data.status = status;
            if (categories !== undefined) data.categories = JSON.stringify(categories);

            // Admin can reassign
            if (isAdmin && userId !== undefined) data.userId = userId;

            if (Object.keys(data).length === 0) {
                return res.status(400).json({ error: 'No fields to update.' });
            }

            await db.workSchedule.update({ where: { id }, data });

            res.json({ message: 'Task updated successfully.' });
        } catch (err) {
            console.error('[Schedule] PUT error:', err);
            res.status(500).json({ error: 'Failed to update task.' });
        }
    });

    // ─── DELETE /api/schedule/:id ──────────────────────────────────
    router.delete('/api/schedule/:id', authenticateToken, async (req, res) => {
        try {
            const { username: currentUser, role } = req.user;
            const { id } = req.params;

            const task = await db.workSchedule.findUnique({ where: { id } });
            if (!task) {
                return res.status(404).json({ error: 'Task not found.' });
            }

            const isAdmin = role === 'admin';
            const isCreator = task.createdBy === currentUser;

            if (!isAdmin && !isCreator) {
                return res.status(403).json({ error: 'Only admin or creator can delete this task.' });
            }

            // Non-admin cannot delete admin-created tasks
            if (!isAdmin && task.creatorRole === 'admin') {
                return res.status(403).json({ error: 'Only admin can delete admin-created tasks.' });
            }

            // If task has a Trello card, try to delete it
            if (task.trelloCardId) {
                try {
                    const trelloUrl = `https://api.trello.com/1/cards/${task.trelloCardId}?key=${config.trello.apiKey}&token=${config.trello.token}`;
                    await fetch(trelloUrl, { method: 'DELETE' });
                } catch (trelloErr) {
                    console.warn('[Schedule] Trello card deletion failed (non-critical):', trelloErr.message);
                }
            }

            // Delete associated comments
            await db.taskComment.deleteMany({ where: { taskId: id } });

            // Delete the task
            await db.workSchedule.deleteMany({ where: { id } });

            res.json({ message: 'Task deleted successfully.' });
        } catch (err) {
            console.error('[Schedule] DELETE error:', err);
            res.status(500).json({ error: 'Failed to delete task.' });
        }
    });

    // ─── GET /api/schedule/:taskId/comments ────────────────────────
    router.get('/api/schedule/:taskId/comments', authenticateToken, async (req, res) => {
        try {
            const { taskId } = req.params;
            const comments = await db.taskComment.findMany({
                where: { taskId },
                orderBy: { createdAt: 'asc' },
            });
            res.json(comments);
        } catch (err) {
            console.error('[Schedule] GET comments error:', err);
            res.status(500).json({ error: 'Failed to fetch comments.' });
        }
    });

    // ─── POST /api/schedule/:taskId/comments ───────────────────────
    router.post('/api/schedule/:taskId/comments', authenticateToken, async (req, res) => {
        try {
            const { username: currentUser } = req.user;
            const { taskId } = req.params;
            const { content } = req.body;

            if (!content || !content.trim()) {
                return res.status(400).json({ error: 'Comment content is required.' });
            }

            const now = new Date().toISOString();

            const comment = await db.taskComment.create({
                data: {
                    taskId,
                    username: currentUser,
                    content: content.trim(),
                    createdAt: now,
                },
            });

            res.status(201).json({ id: comment.id, message: 'Comment added.' });
        } catch (err) {
            console.error('[Schedule] POST comment error:', err);
            res.status(500).json({ error: 'Failed to add comment.' });
        }
    });

    // ─── POST /api/trello/sync/:taskId ─────────────────────────────
    router.post('/api/trello/sync/:taskId', authenticateToken, async (req, res) => {
        try {
            const { taskId } = req.params;
            const task = await db.workSchedule.findUnique({ where: { id: taskId } });

            if (!task) {
                return res.status(404).json({ error: 'Task not found.' });
            }

            const { apiKey, token, listId } = config.trello;
            const cardName = task.title;
            const cardDesc = task.description || '';

            let trelloCardId = task.trelloCardId;

            if (trelloCardId) {
                // Update existing card
                const updateUrl = `https://api.trello.com/1/cards/${trelloCardId}?key=${apiKey}&token=${token}`;
                await fetch(updateUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: cardName, desc: cardDesc }),
                });
            } else {
                // Create new card
                const createUrl = `https://api.trello.com/1/cards?key=${apiKey}&token=${token}`;
                const createRes = await fetch(createUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: cardName,
                        desc: cardDesc,
                        idList: listId,
                        pos: 'top',
                    }),
                });
                const cardData = await createRes.json();
                trelloCardId = cardData.id;

                await db.workSchedule.update({
                    where: { id: taskId },
                    data: { trelloCardId },
                });
            }

            res.json({ trelloCardId, message: 'Task synced to Trello.' });
        } catch (err) {
            console.error('[Trello] Sync error:', err);
            res.status(500).json({ error: 'Failed to sync task to Trello.' });
        }
    });

    // ─── POST /api/trello/upload/:taskId ───────────────────────────
    router.post('/api/trello/upload/:taskId', authenticateToken, upload.single('file'), async (req, res) => {
        try {
            const { taskId } = req.params;
            const task = await db.workSchedule.findUnique({ where: { id: taskId } });

            if (!task) {
                return res.status(404).json({ error: 'Task not found.' });
            }

            if (!task.trelloCardId) {
                return res.status(400).json({ error: 'Task has no Trello card. Sync first.' });
            }

            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded.' });
            }

            const { apiKey, token } = config.trello;
            const attachUrl = `https://api.trello.com/1/cards/${task.trelloCardId}/attachments?key=${apiKey}&token=${token}`;

            const formData = new (require('form-data'))();
            formData.append('file', req.file.buffer, req.file.originalname);

            const axios = require('axios');
            await axios.post(attachUrl, formData, {
                headers: { ...formData.getHeaders() },
            });

            res.json({ message: 'File uploaded to Trello card.' });
        } catch (err) {
            console.error('[Trello] Upload error:', err);
            res.status(500).json({ error: 'Failed to upload file to Trello.' });
        }
    });

    // ─── GET /api/trello/attachments/:taskId ───────────────────────
    router.get('/api/trello/attachments/:taskId', authenticateToken, async (req, res) => {
        try {
            const { taskId } = req.params;
            const task = await db.workSchedule.findUnique({ where: { id: taskId } });

            if (!task) {
                return res.status(404).json({ error: 'Task not found.' });
            }

            if (!task.trelloCardId) {
                return res.json([]);
            }

            const { apiKey, token } = config.trello;
            const attachUrl = `https://api.trello.com/1/cards/${task.trelloCardId}/attachments?key=${apiKey}&token=${token}`;

            const attachRes = await fetch(attachUrl);
            const attachments = await attachRes.json();

            res.json(attachments);
        } catch (err) {
            console.error('[Trello] Get attachments error:', err);
            res.status(500).json({ error: 'Failed to fetch Trello attachments.' });
        }
    });

    // ─── DELETE /api/trello/attachments/:taskId/:attachmentId ──────
    router.delete('/api/trello/attachments/:taskId/:attachmentId', authenticateToken, async (req, res) => {
        try {
            const { taskId, attachmentId } = req.params;
            const task = await db.workSchedule.findUnique({ where: { id: taskId } });

            if (!task) {
                return res.status(404).json({ error: 'Task not found.' });
            }

            if (!task.trelloCardId) {
                return res.status(400).json({ error: 'Task has no Trello card.' });
            }

            const { apiKey, token } = config.trello;
            const deleteUrl = `https://api.trello.com/1/cards/${task.trelloCardId}/attachments/${attachmentId}?key=${apiKey}&token=${token}`;

            await fetch(deleteUrl, { method: 'DELETE' });

            res.json({ message: 'Trello attachment deleted.' });
        } catch (err) {
            console.error('[Trello] Delete attachment error:', err);
            res.status(500).json({ error: 'Failed to delete Trello attachment.' });
        }
    });

    return router;
};
