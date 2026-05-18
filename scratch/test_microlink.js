async function test() {
    try {
        const url = encodeURIComponent('https://www.amazon.com/dp/B07FZ8S74R');
        const res = await fetch(`https://api.microlink.io/?url=${url}`);
        const data = await res.json();
        console.log('Status:', res.status);
        console.log('Data title:', data.data?.title);
    } catch (e) {
        console.error(e);
    }
}
test();
