/**
 * Database initialization — seed default data.
 * Prisma handles schema via prisma db push / migrate.
 */
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

/**
 * Initialize the database: seed defaults.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function initDatabase(prisma) {
    try {
        console.log('[DEBUG] Models:', Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$')));
        // Default admin user
        const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
        if (!admin) {
            const hash = await bcrypt.hash('Hello0', 10);
            await prisma.user.create({
                data: { username: 'admin', password: hash, role: 'admin' },
            });
            console.log('[SEED] Default admin user created.');
        }

        // Default categories
        const catCount = await prisma.category.count();
        if (catCount === 0) {
            const cats = ['Tài liệu nội bộ', 'Thiết kế UI/UX', 'Mã nguồn', 'Tham khảo ngoại bộ'];
            for (const name of cats) {
                await prisma.category.create({ data: { name } });
            }
            console.log('[SEED] Default categories created.');
        }

        // Default accounts
        const accCount = await prisma.account.count();
        if (accCount === 0) {
            const accs = ['Amazon_Main', 'Etsy_Shop1', 'eBay_Direct'];
            for (const name of accs) {
                await prisma.account.create({ data: { id: randomUUID(), name } });
            }
            console.log('[SEED] Default accounts created.');
        }

        // Default merchants
        const merCount = await prisma.merchant.count();
        if (merCount === 0) {
            const names = ['Amazon', 'Etsy', 'eBay', 'Shopify', 'Khác'];
            for (const name of names) {
                await prisma.merchant.create({ data: { id: randomUUID(), name } });
            }
            console.log('[SEED] Default merchants created.');
        }

        // Default fulfillments
        const fulCount = await prisma.fulfillment.count();
        if (fulCount === 0) {
            const names = ['Gearment', 'CustomCat', 'Printful', 'Printify', 'Khác'];
            for (const name of names) {
                await prisma.fulfillment.create({ data: { id: randomUUID(), name } });
            }
            console.log('[SEED] Default fulfillments created.');
        }

        // Default AI Providers
        const aiProviderCount = await prisma.aiProvider.count();
        if (aiProviderCount === 0) {
            const providers = [
                { name: 'Google Gemini', model: 'gemini-2.0-flash', apiKey: '', priority: 1, enabled: true },
                { name: 'Groq (Free)', model: 'llama-3.3-70b-versatile', apiKey: '', priority: 2, enabled: true },
                { name: 'OpenAI GPT-4o', model: 'gpt-4o-mini', apiKey: '', priority: 3, enabled: true },
            ];
            for (const p of providers) {
                await prisma.aiProvider.create({ data: p });
            }
            console.log('[SEED] Default AI providers created.');
        }

        // Default AI Settings (System Prompt)
        const promptKey = 'system_prompt';
        const existingPrompt = await prisma.aiSetting.findUnique({ where: { key: promptKey } });
        if (!existingPrompt) {
            const defaultPrompt = `Bạn là một chuyên gia nghiên cứu thị trường Print on Demand (POD) hàng đầu tại Mỹ. Hãy phân tích từ khóa: "{keyword}". Phân tích dựa trên các tiêu chí thẩm mỹ, tâm lý khách hàng Mỹ, và xu hướng thiết kế hiện tại.
Kết quả trả về phải là một đối tượng JSON hợp lệ với cấu trúc sau:
{
  "meaning": "Giải thích ngắn gọn ý nghĩa và nguồn gốc của ngách này trong văn hóa Mỹ.",
  "audience": "Mô tả chi tiết chân dung khách hàng (Sở thích, độ tuổi, lý do họ mua sản phẩm này).",
  "product_suggestions": ["T-shirt", "Mug", "Tumbler", "Flag", "Poster"],
  "design_ideas": ["Ý tưởng thiết kế 1: chi tiết hình ảnh, text", "Ý tưởng thiết kế 2...", "Ý tưởng thiết kế 3..."],
  "quotes": ["Câu quote 1", "Câu quote 2", "Câu quote 3"],
  "style_tips": "Gợi ý màu sắc, phông chữ (ví dụ: Vintage, Retro, Minimalist) và xu hướng thiết kế."
}
Lưu ý: Chỉ trả về JSON duy nhất, không thêm bất kỳ văn bản giải thích nào trước hoặc sau JSON.`;
            await prisma.aiSetting.create({
                data: { key: promptKey, value: defaultPrompt }
            });
            console.log('[SEED] Default AI system prompt created.');
        }

        console.log('[DB] Seed data initialized.');
    } catch (err) {
        console.error('[DB] Seed error (non-fatal):', err.message);
    }
}

module.exports = { initDatabase };
