const fs = require('fs');
const path = 'public/styles.css';
let css = fs.readFileSync(path, 'utf8');

console.log('Initial length:', css.length);

// 1. Fix the specific corrupted block found earlier
// Search for the malformed sequence where the properties were lost
const malformed = /\.sales-qty-spinner input\[type="number"\] \{\s*\.task-item-title \{/;
if (malformed.test(css)) {
    console.log('Found malformed spinner/task block. Fixing...');
    css = css.replace(malformed, '.sales-qty-spinner input[type="number"] {\n    flex: 1;\n    min-width: 0;\n    text-align: center;\n    border: none !important;\n    border-left: 1px solid rgba(255, 255, 255, 0.08) !important;\n    border-right: 1px solid rgba(255, 255, 255, 0.08) !important;\n    border-radius: 0 !important;\n    padding: 0 4px !important;\n    background: transparent !important;\n    font-weight: 700;\n    font-size: 1.05em;\n}\n.task-item-title {');
}

// 2. Clean up any duplicated or broken niche grid styles
css = css.replace(/\.niche-cards-grid\s*\{[\s\S]*?\}!important/g, ''); // Fix common mistake
css = css.replace(/\.niche-cards-grid\s*\{[\s\S]*?\}/g, '');
css = css.replace(/\.dinoz-premium-list-item\s*\{[\s\S]*?\}/g, '');

// 3. Add a clean, robust version at the end
const cleanStyles = `
/* ======== TRENDING NICHES - FINAL OVERRIDE ======== */
.niche-cards-grid {
    display: grid !important;
    grid-template-columns: repeat(4, 1fr) !important;
    gap: 24px !important;
    margin-top: 24px !important;
    width: 100% !important;
    box-sizing: border-box !important;
}

.dinoz-premium-list-item {
    background: rgba(30, 41, 59, 0.6) !important;
    border: 1px solid rgba(255, 255, 255, 0.15) !important;
    border-radius: 16px !important;
    padding: 20px !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 12px !important;
    transition: all 0.3s ease !important;
    backdrop-filter: blur(10px) !important;
    height: 100% !important;
}

.dinoz-premium-list-item:hover {
    border-color: var(--accent-primary) !important;
    transform: translateY(-5px) !important;
    background: rgba(30, 41, 59, 0.8) !important;
}

@media (max-width: 1200px) {
    .niche-cards-grid {
        grid-template-columns: repeat(2, 1fr) !important;
    }
}

@media (max-width: 768px) {
    .niche-cards-grid {
        grid-template-columns: 1fr !important;
    }
}
`;

css += cleanStyles;

// 4. Final brace check
const opens = (css.match(/{/g) || []).length;
const closes = (css.match(/}/g) || []).length;
console.log('Brace count:', { opens, closes });

if (opens === closes) {
    fs.writeFileSync(path, css);
    console.log('Success: CSS fixed and saved.');
} else {
    console.error('Error: Brace mismatch detected after fix. Aborting write.');
    process.exit(1);
}
