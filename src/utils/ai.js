const axios = require('axios');

/**
 * Call a specific AI provider.
 * @param {Object} provider 
 * @param {string} systemPrompt 
 * @param {string} keyword (optional)
 */
async function callAgent(provider, systemPrompt, keyword = '') {
    const fullPrompt = keyword ? systemPrompt.replace('{keyword}', keyword) : systemPrompt;
    const { name, model, apiKey } = provider;

    if (!apiKey) throw new Error(`API Key for ${name} is missing.`);

    if (name.toLowerCase().includes('gemini')) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await axios.post(url, {
            contents: [{ parts: [{ text: fullPrompt }] }]
        });
        
        return response.data.candidates[0].content.parts[0].text;
    } 
    
    if (name.toLowerCase().includes('groq') || name.toLowerCase().includes('openai')) {
        const url = name.toLowerCase().includes('groq') 
            ? 'https://api.groq.com/openai/v1/chat/completions'
            : 'https://api.openai.com/v1/chat/completions';
            
        const response = await axios.post(url, {
            model: model,
            messages: [
                { role: 'user', content: fullPrompt }
            ],
            temperature: 0.7
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
        });

        return response.data.choices[0].message.content;
    }

    throw new Error(`Provider ${name} is not supported yet.`);
}

/**
 * Extract JSON from AI response (handles markdown blocks)
 * @param {string} text 
 */
function extractJson(text) {
    try {
        // Find JSON block if wrapped in markdown
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            return JSON.parse(match[0]);
        }
        return JSON.parse(text);
    } catch (e) {
        console.error('Failed to parse AI JSON:', text);
        throw new Error('AI returned invalid JSON format.');
    }
}

/**
 * Failover logic: Try providers in order of priority.
 * @param {import('@prisma/client').PrismaClient} db 
 * @param {string} keyword 
 */
async function analyzeWithFailover(db, keyword) {
    const providers = await db.aiProvider.findMany({
        where: { enabled: true },
        orderBy: { priority: 'asc' }
    });

    const setting = await db.aiSetting.findUnique({ where: { key: 'system_prompt' } });
    const systemPrompt = setting ? setting.value : 'Analyze this keyword for POD: {keyword}';

    let lastError = null;
    for (const provider of providers) {
        try {
            console.log(`[AI] Attempting analysis with ${provider.name}...`);
            const rawText = await callAgent(provider, systemPrompt, keyword);
            const result = extractJson(rawText);
            return { result, provider: provider.name };
        } catch (err) {
            console.error(`[AI] ${provider.name} failed:`, err.response?.data || err.message);
            lastError = err;
        }
    }

    throw new Error(`Tất cả AI Agents đều thất bại. Lỗi cuối cùng: ${lastError ? lastError.message : 'No enabled providers'}`);
}

module.exports = { callAgent, analyzeWithFailover };
