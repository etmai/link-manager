window.debugSchema = async function() {
    try {
        const schema = await API.fetch('/api/debug/schema');
        console.table(schema.sales_entries || []);
        const cols = (schema.sales_entries || []).map(c => c.name).join(', ');
        alert('sales_entries columns:\n' + cols);
    } catch(e) {
        alert('Error: ' + e.message);
    }
};
